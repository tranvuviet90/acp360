import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { colors } from "../theme";
import { useToast } from "./LightboxSwipeOnly";

const DEPARTMENTS = [
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

const NOTIFICATION_TYPES_CONFIG = [
  {
    type: "new_gemba_error",
    label: "🚨 Báo cáo sự cố Gemba",
    desc: "Nhận thông báo khi có sự cố Gemba mới phát sinh cần kiểm tra.",
    roles: ["admin", "ehs"]
  },
  {
    type: "new_tu_gemba_error",
    label: "💡 Báo cáo Tự Gemba",
    desc: "Nhận thông báo khi có báo cáo Tự Gemba mới được ghi nhận.",
    roles: ["admin", "ehs", ...DEPARTMENTS]
  },
  {
    type: "bodam_assign",
    label: "📻 Giao nhận Bộ đàm",
    desc: "Thông báo khi bạn được bàn giao hoặc thu hồi bộ đàm nhiệm vụ.",
    roles: ["admin", "ehs", "Bảo Vệ"]
  },
  {
    type: "shift_reminder",
    label: "🗓️ Ca làm việc & Nhắc nhở ca",
    desc: "Nhận nhắc nhở đăng ký ca làm việc tuần mới và lịch phân ca.",
    roles: ["admin", "ehs", "ehs committee"]
  },
  {
    type: "role_request",
    label: "👤 Yêu cầu thay đổi chức vụ",
    desc: "Nhận thông báo khi thành viên gửi yêu cầu xin thay đổi chức vụ.",
    roles: ["admin"]
  },
  {
    type: "meal_registration",
    label: "🍽️ Báo cơm & Suất ăn",
    desc: "Nhận thông báo khi có thay đổi, điều chỉnh cơm hoặc Nhà Ăn đã phát mì/sữa.",
    roles: ["admin", "ehs", "Nhà Ăn", ...DEPARTMENTS]
  }
];

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

  const { pushToast } = useToast();

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(`notif_settings_${user?.uid}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showSettings, setShowSettings] = useState(false);

  // Sync settings when user changes
  useEffect(() => {
    if (user?.uid) {
      try {
        const saved = localStorage.getItem(`notif_settings_${user.uid}`);
        setSettings(saved ? JSON.parse(saved) : {});
      } catch {
        setSettings({});
      }
    }
  }, [user]);

  const isNotifTypeEnabled = useCallback((type) => {
    let targetType = type;
    if (type === "shift_assign" || type === "shift_note") {
      targetType = "shift_reminder";
    }
    return settings[targetType] !== false;
  }, [settings]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  
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

      const isNotifTypeEnabledRef = (type) => {
        let targetType = type;
        if (type === "shift_assign" || type === "shift_note") {
          targetType = "shift_reminder";
        }
        return settingsRef.current[targetType] !== false;
      };

      // Lọc thông báo mới, chưa đọc, và KHÔNG phải do chính mình tạo
      const newNotifs = list
        .filter(n => !seenIdsRef.current.has(n.id))
        .filter(n =>
          !(n.readBy || []).includes(user.uid) && // chưa đọc
          n.createdBy !== user.uid &&             // không phải do mình tạo
          isNotifTypeEnabledRef(n.type)          // chưa bị tắt
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

      const isNotifTypeEnabledRef = (type) => {
        let targetType = type;
        if (type === "shift_assign" || type === "shift_note") {
          targetType = "shift_reminder";
        }
        return settingsRef.current[targetType] !== false;
      };

      // Lọc thông báo mới, chưa đọc, và KHÔNG phải do chính mình tạo
      const newNotifs = list
        .filter(n => !seenIdsRef.current.has(n.id))
        .filter(n =>
          !(n.readBy || []).includes(user.uid) && // chưa đọc
          n.createdBy !== user.uid &&             // không phải do mình tạo
          isNotifTypeEnabledRef(n.type)          // chưa bị tắt
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

    // CHỈ áp dụng thông báo cho users có vai trò là "ehs committee"
    const userRoleNormalized = (user.role || "").toLowerCase();
    if (userRoleNormalized !== "ehs committee") {
      setLocalNotifications([]);
      return;
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const hour = today.getHours();
    
    // CHỈ nhận thông báo từ 08:00 sáng Chủ nhật hàng tuần (dayOfWeek === 0 và hour >= 8)
    if (dayOfWeek === 0 && hour >= 8) {
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
  const filteredNotifications = [...localNotifications, ...dbNotifications]
    .filter(n => !n.createdBy || n.createdBy !== user.uid)
    .filter(n => isNotifTypeEnabled(n.type))
    .sort((a, b) => {
      const tA = a.isLocal ? a.timestamp : (a.timestamp?.seconds * 1000 || 0);
      const tB = b.isLocal ? b.timestamp : (b.timestamp?.seconds * 1000 || 0);
      return tB - tA;
    });

  // Đếm số lượng thông báo chưa đọc từ danh sách đã lọc
  const unreadCount = filteredNotifications.filter(n => !(n.readBy || []).includes(user.uid)).length;

  // Hiển thị tối đa 20 thông báo gần nhất (bao gồm cả đã đọc và chưa đọc) để tránh dropdown quá dài
  const allNotifications = filteredNotifications.slice(0, 20);

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
          <div style={{ padding: "5px 15px 10px", borderBottom: "1px solid #eee", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: "bold", fontSize: 18, color: colors.primary, marginBottom: 4 }}>Thông báo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                onClick={markAllAsRead}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13.5,
                  color: "#333",
                  background: "transparent",
                  border: "none",
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  fontWeight: 500,
                  transition: "all 0.15s"
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.color = colors.primary; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#333"; }}
              >
                <span style={{ fontSize: 15, fontWeight: "bold", color: colors.primary }}>✓</span> Đánh dấu tất cả là đã đọc
              </button>
              
              <button
                onClick={() => { setShowSettings(true); setIsOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13.5,
                  color: "#333",
                  background: "transparent",
                  border: "none",
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  fontWeight: 500,
                  transition: "all 0.15s"
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.color = colors.primary; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#333"; }}
              >
                <span style={{ fontSize: 15, color: colors.primary }}>⚙️</span> Cài đặt thông báo
              </button>
            </div>
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

    {/* ===== MODAL CÀI ĐẶT THÔNG BÁO ===== */}
    {showSettings && (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000
      }}>
        <div style={{
          background: "#fff", padding: 24, borderRadius: 16,
          width: "min(460px, 95vw)", boxShadow: "0 10px 40px rgba(0,0,0,.2)",
          display: "flex", flexDirection: "column", gap: 18
        }}>
          <h3 style={{ margin: 0, color: colors.primary, display: "flex", alignItems: "center", gap: 8, borderBottom: "1.5px solid #eee", paddingBottom: 10 }}>
            <span>⚙️</span> Cài đặt thông báo
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
            {(() => {
              const userRoles = Array.isArray(user?.role) ? user.role : [user?.role || ""];
              const userRolesLower = userRoles.map(r => String(r).toLowerCase());
              
              const applicableTypes = NOTIFICATION_TYPES_CONFIG.filter(cfg => {
                return cfg.roles.some(r => userRolesLower.includes(r.toLowerCase()));
              });

              if (applicableTypes.length === 0) {
                return <p style={{ margin: 0, color: "#666", fontSize: 14 }}>Chức vụ của bạn không có cấu hình thông báo nào áp dụng.</p>;
              }

              return applicableTypes.map(cfg => {
                const isEnabled = settings[cfg.type] !== false;
                return (
                  <div
                    key={cfg.type}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "10px 12px", borderRadius: 8, background: "#f8fafc",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`chk-${cfg.type}`}
                      checked={isEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setSettings(prev => ({ ...prev, [cfg.type]: val }));
                      }}
                      style={{ width: 18, height: 18, marginTop: 3, cursor: "pointer", accentColor: colors.primary }}
                    />
                    <label htmlFor={`chk-${cfg.type}`} style={{ cursor: "pointer", flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 2 }}>{cfg.label}</div>
                      <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.4 }}>{cfg.desc}</div>
                    </label>
                  </div>
                );
              });
            })()}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1.5px solid #eee", paddingTop: 14 }}>
            <button
              onClick={() => {
                // Hủy: khôi phục từ localStorage
                try {
                  const saved = localStorage.getItem(`notif_settings_${user?.uid}`);
                  setSettings(saved ? JSON.parse(saved) : {});
                } catch {}
                setShowSettings(false);
              }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #ccc", background: "#eee", fontWeight: 600, cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              onClick={async () => {
                // Lưu
                try {
                  localStorage.setItem(`notif_settings_${user?.uid}`, JSON.stringify(settings));
                  
                  // Đồng bộ Firestore dạng best-effort
                  try {
                    await updateDoc(doc(db, "users", user.uid), {
                      notificationSettings: settings
                    });
                  } catch (fsErr) {
                    console.warn("Firestore sync warning (Security Rules might restrict write):", fsErr);
                  }
                  
                  pushToast("Đã lưu cài đặt thông báo thành công!", "success");
                } catch (e) {
                  console.error(e);
                  pushToast("Lỗi khi lưu cài đặt.", "error");
                } finally {
                  setShowSettings(false);
                }
              }}
              style={{ padding: "8px 20px", background: colors.primary, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}