import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { colors } from "../theme";

const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "";
  const timeMs = timestamp.seconds ? timestamp.seconds * 1000 : timestamp;
  const diffMs = Date.now() - timeMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Vài giây trước";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay === 1) return "Hôm qua";
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(timeMs).toLocaleDateString("vi-VN");
};

const getNotificationIcon = (type) => {
  switch (type) {
    case "new_gemba_error": return "🚨";
    case "new_tu_gemba_error": return "💡";
    case "new_error": return "🚨"; // fallback
    case "bodam_assign": return "📻";
    case "shift_assign": return "🗓️";
    case "shift_note": return "📝";
    case "shift_reminder": return "⏳";
    case "role_request": return "👤";
    case "role_response": return "🔑";
    case "meal_registration": return "🍽️";
    default: return "🔔";
  }
};

const getTabForNotification = (type) => {
  switch (type) {
    case "new_gemba_error":    return 0; // Tab Gemba
    case "new_tu_gemba_error": return 1; // Tab Tự Gemba
    case "new_error":          return 0; // fallback cũ → Gemba
    case "bodam_assign":       return 2; // Tab Bộ đàm
    case "shift_assign":       return 3; // Tab Ca làm việc
    case "shift_note":         return 3; // Tab Ca làm việc
    case "shift_reminder":     return 3; // Tab Ca làm việc
    case "role_request":       return 8; // Tab Quản lý người dùng
    case "role_response":      return 0;
    case "meal_registration":  return 7; // Tab Báo Cơm
    default: return null;
  }
};

/* ===== TOAST POPUP COMPONENT (Facebook-style) ===== */
function ToastPopup({ toast, onDismiss, onNavigate }) {
  const [visible, setVisible] = useState(false);   
  const [hiding, setHiding] = useState(false);      

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => {
      setHiding(true);
      setTimeout(() => onDismiss(toast.toastId), 400); 
    }, 5000);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [toast.toastId, onDismiss]);

  const handleClick = () => {
    setHiding(true);
    setTimeout(() => onNavigate(toast), 400);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    setHiding(true);
    setTimeout(() => onDismiss(toast.toastId), 400);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 320,
        background: "white",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        cursor: "pointer",
        zIndex: 9999,
        borderLeft: "4px solid #E88E2E",
        opacity: visible && !hiding ? 1 : 0,
        transform: visible && !hiding ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
        pointerEvents: visible && !hiding ? "auto" : "none",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 26, flexShrink: 0, marginTop: 1 }}>
        {getNotificationIcon(toast.type)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#222", marginBottom: 3, lineHeight: 1.4 }}>
          Thông báo mới
        </div>
        <div style={{
          fontSize: 13,
          color: "#444",
          lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {toast.message}
        </div>
        <div style={{ fontSize: 11, color: "#E88E2E", marginTop: 5, fontWeight: 500 }}>
          {formatRelativeTime(toast.timestamp)}
        </div>
      </div>

      <button
        onClick={handleClose}
        style={{
          background: "#f0f0f0",
          border: "none",
          borderRadius: "50%",
          width: 22,
          height: 22,
          cursor: "pointer",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#666",
          marginTop: 1,
        }}
      >
        ✕
      </button>

      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        height: 3,
        borderRadius: "0 0 0 12px",
        background: "#E88E2E",
        width: visible && !hiding ? "0%" : "100%",
        transition: visible && !hiding ? "width 5s linear" : "none",
      }} />
    </div>
  );
}

export default function NotificationBell({ user, setActiveTab }) {
  const [roleNotifications, setRoleNotifications] = useState([]);
  const [userNotifications, setUserNotifications] = useState([]);
  const [localNotifications, setLocalNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const [toastQueue, setToastQueue] = useState([]); 
  
  // Tích hợp 2 lớp khiên: Cuốn sổ lưu ID và Thẻ báo cáo initialLoad
  const seenIdsRef = useRef(new Set()); 
  const initialLoadRole = useRef(true);
  const initialLoadUser = useRef(true);

  const dbNotifications = useMemo(() => {
    const combinedMap = new Map();
    roleNotifications.forEach(n => combinedMap.set(n.id, n));
    userNotifications.forEach(n => combinedMap.set(n.id, n));
    return Array.from(combinedMap.values()).sort((a, b) => {
      const tA = a.timestamp?.seconds || 0;
      const tB = b.timestamp?.seconds || 0;
      return tB - tA;
    });
  }, [roleNotifications, userNotifications]);

  useEffect(() => {
    if (!user) {
      setRoleNotifications([]);
      setUserNotifications([]);
      return;
    }

    initialLoadRole.current = true;
    initialLoadUser.current = true;

    const qRole = query(
      collection(db, "notifications"),
      where("targetRoles", "array-contains", user.role || "")
    );

    const qUser = query(
      collection(db, "notifications"),
      where("targetUserId", "==", user.uid)
    );

    const unsubRole = onSnapshot(qRole, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRoleNotifications(list);

      if (initialLoadRole.current) {
        snap.docs.forEach(d => seenIdsRef.current.add(d.id));
        initialLoadRole.current = false; 
        return;
      }

      // Lọc thông báo mới, chưa đọc, và KHÔNG phải do chính mình tạo
      const newNotifs = list
        .filter(n => !seenIdsRef.current.has(n.id))
        .filter(n =>
          !(n.readBy || []).includes(user.uid) && // chưa đọc
          n.createdBy !== user.uid                // không phải do mình tạo
        );

      newNotifs.forEach(n => {
        seenIdsRef.current.add(n.id);
        setToastQueue(prev => [...prev, { ...n, toastId: `${n.id}-${Date.now()}` }]);
      });
      
      snap.docs.forEach(d => seenIdsRef.current.add(d.id));
    }, (err) => console.error("Lỗi Role Notif:", err));

    const unsubUser = onSnapshot(qUser, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUserNotifications(list);

      if (initialLoadUser.current) {
        snap.docs.forEach(d => seenIdsRef.current.add(d.id));
        initialLoadUser.current = false; 
        return;
      }

      // Lọc thông báo mới, chưa đọc, và KHÔNG phải do chính mình tạo
      const newNotifs = list
        .filter(n => !seenIdsRef.current.has(n.id))
        .filter(n =>
          !(n.readBy || []).includes(user.uid) && // chưa đọc
          n.createdBy !== user.uid                // không phải do mình tạo
        );

      newNotifs.forEach(n => {
        seenIdsRef.current.add(n.id);
        setToastQueue(prev => [...prev, { ...n, toastId: `${n.id}-${Date.now()}` }]);
      });
      
      snap.docs.forEach(d => seenIdsRef.current.add(d.id));
    }, (err) => console.error("Lỗi User Notif:", err));

    return () => {
      unsubRole();
      unsubUser();
    };
  }, [user]);

  // Logic nhắc nhở chọn ca
  useEffect(() => {
    if (!user || !user.name) return;
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    
    if (dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      const nextWeekDate = new Date();
      nextWeekDate.setDate(today.getDate() + 7);
      const nextWeekId = `${nextWeekDate.getFullYear()}-${getWeekNumber(nextWeekDate)}`;

      const unsub = onSnapshot(
        doc(db, "weekly_shifts", nextWeekId),
        (snap) => {
          let hasShift = false;
          if (snap.exists()) {
            const data = snap.data();
            if (data[user.name]) hasShift = true;
          }
          if (!hasShift) {
            setLocalNotifications([{
              id: 'local-shift-reminder',
              type: 'shift_reminder',
              message: 'Sang tuần mới rồi, bạn chưa chọn ca làm việc. Nhấn vào đây để chọn ngay!',
              timestamp: Date.now(),
              readBy: [],
              isLocal: true
            }]);
          } else {
            setLocalNotifications([]);
          }
        },
        (error) => {
          console.warn("Không thể đọc weekly_shifts để nhắc nhở ca:", error.code);
          setLocalNotifications([]);
        }
      );
      return () => unsub();
    } else {
      setLocalNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lọc thông báo do chính mình tạo — không hiển thị trong dropdown lẫn toast
  const allNotifications = [...localNotifications, ...dbNotifications]
    .filter(n => !n.createdBy || n.createdBy !== user.uid)
    .sort((a, b) => {
    const tA = a.isLocal ? a.timestamp : (a.timestamp?.seconds * 1000 || 0);
    const tB = b.isLocal ? b.timestamp : (b.timestamp?.seconds * 1000 || 0);
    return tB - tA;
  });

  // Tối ưu unreadCount: Không cần "&& n.createdBy !== user.uid" vì allNotifications đã lọc sạch sẽ rồi
  const unreadCount = allNotifications.filter(n => !(n.readBy || []).includes(user.uid)).length;

  const markAsReadAndNavigate = async (notif) => {
    // Đánh dấu đã đọc
    if (!notif.isLocal && !(notif.readBy || []).includes(user.uid)) {
      try {
        await updateDoc(doc(db, "notifications", notif.id), {
          readBy: arrayUnion(user.uid)
        });
      } catch (e) {
        console.error("Lỗi đánh dấu đã đọc", e);
      }
    }
    
    // Đóng dropdown và chuyển tab
    setIsOpen(false);
    const targetTab = getTabForNotification(notif.type);
    if (targetTab !== null && setActiveTab) {
      setActiveTab(targetTab);
    }
  };

  const dismissToast = useCallback((toastId) => {
    setToastQueue(prev => prev.filter(t => t.toastId !== toastId));
  }, []);

  const markAllAsRead = async () => {
    const unread = allNotifications.filter(n => !n.isLocal && !(n.readBy || []).includes(user.uid));
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        const ref = doc(db, "notifications", n.id);
        batch.update(ref, { readBy: arrayUnion(user.uid) });
      });
      await batch.commit();
    } catch (e) {
      console.error("Lỗi đánh dấu tất cả đã đọc", e);
    }
  };

  const handleToggle = () => setIsOpen(!isOpen);

  return (
    <>
    <div style={{ position: "relative", marginRight: 15 }} ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 22,
          position: "relative",
          padding: 5
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: "red",
            color: "white",
            fontSize: 11,
            fontWeight: "bold",
            borderRadius: "50%",
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          background: "white",
          width: 320,
          maxHeight: 450,
          overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          borderRadius: 12,
          zIndex: 1000,
          padding: "10px 0"
        }}>
          <div style={{ padding: "0 15px 10px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", fontSize: 18, color: colors.primary }}>Thông báo</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{ fontSize: 12, color: colors.primary, background: "transparent", border: `1px solid ${colors.primary}`, borderRadius: 12, padding: "3px 10px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
              >
                ✓ Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
          {allNotifications.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>Không có thông báo nào</div>
          ) : (
            allNotifications.map(n => {
              const isUnread = !(n.readBy || []).includes(user.uid);
              return (
                <div 
                  key={n.id} 
                  onClick={() => markAsReadAndNavigate(n)}
                  style={{
                    padding: "12px 15px",
                    borderBottom: "1px solid #f5f5f5",
                    background: isUnread ? "#fff6ea" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    transition: "background 0.2s"
                  }}
                  onMouseOver={(e) => { if (!isUnread) e.currentTarget.style.background = "#f9f9f9"; }}
                  onMouseOut={(e) => { if (!isUnread) e.currentTarget.style.background = "white"; }}
                >
                  <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>
                    {getNotificationIcon(n.type)}
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ 
                      fontSize: 14, 
                      color: isUnread ? "#222" : "#555", 
                      fontWeight: isUnread ? "600" : "400",
                      lineHeight: "1.4"
                    }}>
                      {n.message}
                    </div>
                    <div style={{ 
                      fontSize: 12, 
                      color: isUnread ? colors.primary : "#999", 
                      marginTop: 4,
                      fontWeight: isUnread ? "500" : "400" 
                    }}>
                      {formatRelativeTime(n.timestamp)}
                    </div>
                  </div>
                  {isUnread && (
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: colors.primary, flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>

    {/* ===== FACEBOOK-STYLE TOAST POPUP ===== */}
    {toastQueue.map((toast) => (
      <ToastPopup
        key={toast.toastId}
        toast={toast}
        onDismiss={dismissToast}
        onNavigate={(notif) => {
          markAsReadAndNavigate(notif);
          dismissToast(toast.toastId);
        }}
      />
    ))}
    </>
  );
}