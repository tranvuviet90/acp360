// Tệp đã sửa lỗi: App.jsx
// Đã thêm logic để không fetch-count nếu là vai trò 'Bộ phận' hoặc 'Nhà Ăn'
import React, { useState, useEffect, Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./components/Login";
import UserSettings from "./components/UserSettings";
import NotificationBell from "./components/NotificationBell";

const DailyAudit = lazy(() => import("./components/DailyAudit"));
const Gemba = lazy(() => import("./components/Gemba"));
const EhsCommittee = lazy(() => import("./components/EhsCommittee"));
const BaoCom = lazy(() => import("./components/BaoCom"));
const UserManager = lazy(() => import("./components/UserManager"));
const DocumentManager = lazy(() => import("./components/DocumentManager"));
import logo from "./assets/logo.png";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, Timestamp, getCountFromServer, setDoc } from "firebase/firestore";
import "./App.css";

import MagicMenu from "./components/MagicMenu";
import Chatbot from "./components/Chatbot";
import { colors } from "./theme";
import { ToastProvider, ConfirmProvider, useToast } from "./components/LightboxSwipeOnly";

import { useI18n } from "./i18n/I18nProvider";
import { DEPARTMENT_NAMES, DEPARTMENT_ROLES, SHIFT_START_HOURS } from "./constants/roles";
import { normalizeRole, getWeekNumber, getWeekDates, formatDateToId } from "./utils/string";

// Dùng shared constants thay vì khai báo lại
const departments = DEPARTMENT_NAMES.map(name => ({ name }));
const deptRolesNormalized = new Set(DEPARTMENT_ROLES.map(normalizeRole));
const CANTEEN_NORMALIZED = normalizeRole("Nhà Ăn");


function getAssignedShifts(assignedTo) {
  const shifts = { S1: null, S2: null, S3: null, HC: null, S8: null };
  if (!assignedTo) return shifts;
  
  if (Array.isArray(assignedTo)) {
    const keys = ["HC", "S1", "S2", "S3", "S8"];
    assignedTo.forEach((u, i) => {
      if (i < keys.length && u) {
        shifts[keys[i]] = { uid: u.uid, name: u.name };
      }
    });
    return shifts;
  }
  
  const hasShiftKeys = ["S1", "S2", "S3", "HC", "S8"].some(k => k in assignedTo);
  if (hasShiftKeys) {
    return {
      S1: assignedTo.S1 || null,
      S2: assignedTo.S2 || null,
      S3: assignedTo.S3 || null,
      HC: assignedTo.HC || null,
      S8: assignedTo.S8 || null,
    };
  }
  
  if (assignedTo.uid && assignedTo.name) {
    shifts.HC = { uid: assignedTo.uid, name: assignedTo.name };
  }
  return shifts;
}

function useWindowSize() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth !== windowWidth) {
        setWindowWidth(window.innerWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [windowWidth]);
  return { width: windowWidth };
}

function ToastBridge() {
  const { pushToast } = useToast();
  useEffect(() => {
    const prevAlert = window.alert;
    window.__pushToast = (msg, type = "info", ttlMs = 4000) => pushToast(String(msg), type, ttlMs);
    window.alert = (msg) => pushToast(String(msg), "error");
    return () => {
      window.alert = prevAlert;
      delete window.__pushToast;
    };
  }, [pushToast]);
  return null;
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [ehsActiveSubTab, setEhsActiveSubTab] = useState("calamviec");

  const handleSetActiveTab = (mainTab, subTab = null) => {
    setTab(mainTab);
    if (subTab) {
      setEhsActiveSubTab(subTab);
    }
  };
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [gembaNotifCounts, setGembaNotifCounts] = useState({});
  const [tuGembaNotifCounts, setTuGembaNotifCounts] = useState({});

  const totalGembaNotifications = Object.values(gembaNotifCounts).reduce((a, b) => a + b, 0);
  const totalTuGembaNotifications = Object.values(tuGembaNotifCounts).reduce((a, b) => a + b, 0);

  const { width } = useWindowSize();
  const isMobile = width < 768;

  const { t } = useI18n();

  // --- THÊM: ĐƯA BIẾN KIỂM TRA ROLE RA NGOÀI ĐỂ DÙNG CHUNG (Chống Ghost Mount) ---
  const roleRawList = user?.role ? (Array.isArray(user.role) ? user.role : String(user.role).split(',').map(r => r.trim())) : [];
  const rolesNormalized = roleRawList.map(normalizeRole);
  const hasEhsAccess = rolesNormalized.some(r => ['admin', 'ehs', 'ehs committee', 'manager'].includes(r));
  const hasDeptRole = rolesNormalized.some(r => deptRolesNormalized.has(r));
  const hasCanteenRole = rolesNormalized.some(r => r === CANTEEN_NORMALIZED);
  const isRestrictedRole = (hasDeptRole || hasCanteenRole) && !hasEhsAccess;
  // ---------------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const rawRole = data.role;
          const parsedRoles = rawRole ? (Array.isArray(rawRole) ? rawRole : [String(rawRole)]).flatMap(r => String(r).split(',')).map(r => r.trim()).filter(Boolean) : [];
          const userData = { uid: firebaseUser.uid, email: firebaseUser.email, ...data, role: parsedRoles };
          setUser(userData);

          const currentIsDept = parsedRoles.some(r => deptRolesNormalized.has(normalizeRole(r)));
          const currentIsCanteen = parsedRoles.some(r => normalizeRole(r) === CANTEEN_NORMALIZED);
          const currentHasEhs = parsedRoles.some(r => ['admin', 'ehs', 'ehs committee', 'manager'].includes(normalizeRole(r)));
          
          // --- SỬA LỖI TẠI ĐÂY ---
          // CHANGED: Chỉ tự động chuyển đến tab Báo cơm (index 3) nếu người dùng
          // chỉ có vai trò bộ phận hoặc nhà ăn (không có quyền EHS/Admin).
          // Các tài khoản đa vai trò có quyền EHS/Admin sẽ giữ tab mặc định là 0.
          const forceMealTab = (currentIsDept || currentIsCanteen) && !currentHasEhs;
          setTab(forceMealTab ? 3 : 0);
          // --- KẾT THÚC SỬA LỖI ---
          
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // =================================================================
    // === BẮT ĐẦU SỬA LỖI 403 (Permission Denied) CHO VAI TRÒ BỘ PHẬN ===
    // =================================================================
    // Nếu là vai trò 'Bộ phận' hoặc 'Nhà ăn', họ không cần xem
    // thông báo Gemba/TuGemba (vì menu bị ẩn).
    // Bỏ qua việc fetch counts để tránh lỗi 403 và tối ưu.
    if (isRestrictedRole) {
      setGembaNotifCounts({});
      setTuGembaNotifCounts({});
      return;
    }

    const fetchCountsForTab = async (collectionName, storageKey, setCountFunction) => {
      // Ƭu tiên lấy từ Firestore (cross-device), fallback về localStorage
      let lastSeenTimestamps = {};
      try {
        const prefRef = doc(db, "user_prefs", user.uid);
        const prefSnap = await getDoc(prefRef);
        if (prefSnap.exists() && prefSnap.data()[storageKey]) {
          lastSeenTimestamps = prefSnap.data()[storageKey];
        } else {
          lastSeenTimestamps = JSON.parse(localStorage.getItem(storageKey) || "{}");
        }
      } catch {
        lastSeenTimestamps = JSON.parse(localStorage.getItem(storageKey) || "{}");
      }
      const counts = {};
      const promises = departments.map(async (dept) => {
        const lastSeen = lastSeenTimestamps[dept.name] ? new Date(lastSeenTimestamps[dept.name]) : new Date(0);
        const q = query(
          collection(db, collectionName),
          where("department", "==", dept.name),
          where("timestamp", ">", Timestamp.fromDate(lastSeen))
        );
        const snapshot = await getCountFromServer(q);
        counts[dept.name] = snapshot.data().count;
      });
      await Promise.all(promises);
      setCountFunction(counts);
    };
    const fetchAll = () => {
      fetchCountsForTab("gemba_events", "gembaLastSeenTimestamps", setGembaNotifCounts);
      fetchCountsForTab("tu_gemba_logs", "tuGembaLastSeenTimestamps", setTuGembaNotifCounts);
    };
    fetchAll();
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, isRestrictedRole]); // Cập nhật dependency

  // Automatic shift start and walkie-talkie reminders
  useEffect(() => {
    const userRolesList = user?.role ? (Array.isArray(user.role) ? user.role.map(normalizeRole) : String(user.role).split(',').map(r => normalizeRole(r))) : [];
    if (!user || !userRolesList.includes("ehs committee")) return;

    const checkReminders = async () => {
      try {
        const today = new Date();
        const todayDateId = formatDateToId(today);
        const weekDates = getWeekDates(today);
        const weekId = `${weekDates[0].getFullYear()}-${getWeekNumber(weekDates[0])}`;

        // 1. Fetch weekly shift assignments
        const shiftDocRef = doc(db, "weekly_shifts", weekId);
        const shiftSnap = await getDoc(shiftDocRef);
        if (!shiftSnap.exists()) return;

        const shiftData = shiftSnap.data();
        const myShifts = shiftData[user.name];
        const todayShift = myShifts ? myShifts[todayDateId] : null;

        if (!todayShift || todayShift === "Off") return;

        // SHIFT_START_HOURS đã được import từ constants/roles.js
        const startHour = SHIFT_START_HOURS[todayShift];
        if (startHour === undefined) return;

        const currentHour = today.getHours();
        const currentMinute = today.getMinutes();
        const nowMinutes = currentHour * 60 + currentMinute;
        const shiftStartMinutes = startHour * 60;

        // A. Shift Start Reminder: within 1 hour after shift start
        if (nowMinutes >= shiftStartMinutes && nowMinutes < shiftStartMinutes + 60) {
          const notifId = `shift-remind-${todayDateId}-${user.uid}-${todayShift}`;
          await setDoc(doc(db, "notifications", notifId), {
            type: "shift_start_remind",
            message: `Ca trực ${todayShift} của bạn đã bắt đầu. Hãy nhớ thực hiện các nhiệm vụ EHS nhé!`,
            targetUserId: user.uid,
            createdBy: "system",
            readBy: [],
            relatedId: notifId,
            timestamp: Timestamp.now()
          });
        }

        // B. Walkie-Talkie Reminder: within 15 mins to 1h15m after shift start
        if (nowMinutes >= shiftStartMinutes + 15 && nowMinutes < shiftStartMinutes + 75) {
          const bodamDocRef = doc(db, "bodam", "status");
          const bodamSnap = await getDoc(bodamDocRef);
          if (bodamSnap.exists() && bodamSnap.data().status) {
            const statusList = bodamSnap.data().status;
            let assignedBodamIdx = -1;
            let isCheckedIn = false;

            statusList.forEach((cur, idx) => {
              const assigned = getAssignedShifts(cur.assignedTo);
              if (assigned[todayShift]?.uid === user.uid) {
                assignedBodamIdx = idx;
                if (cur.checked && cur.name === user.name) {
                  isCheckedIn = true;
                }
              }
            });

            if (assignedBodamIdx !== -1 && !isCheckedIn) {
              const notifId = `bodam-remind-${todayDateId}-${user.uid}-${todayShift}`;
              await setDoc(doc(db, "notifications", notifId), {
                type: "bodam_unreturned_remind",
                message: `Bạn đã bắt đầu ca trực ${todayShift} nhưng chưa nhận/check-in Bộ đàm ${assignedBodamIdx + 1}. Hãy check-in ngay nhé!`,
                targetUserId: user.uid,
                createdBy: "system",
                readBy: [],
                relatedId: notifId,
                timestamp: Timestamp.now()
              });
            }
          }
        }
      } catch (err) {
        console.error("Lỗi kiểm tra nhắc nhở ca trực/bộ đàm:", err);
      }
    };

    // Run check immediately on mount, and then every 2 minutes
    checkReminders();
    const intervalId = setInterval(checkReminders, 2 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Lỗi đăng xuất:", e);
    }
  };

  const [mountedTabs, setMountedTabs] = useState(new Set());
  useEffect(() => {
    // SỬA LỖI: Không ghi nhận tab 0 vào lúc app đang loading để chống Ghost Mount
    if (loading || !user) return; 

    setMountedTabs(prev => {
      if (prev.has(tab)) return prev; // không đổi → không re-render thừa
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab, loading, user]); // Cập nhật dependency

  if (loading) return <div className="loading-container"><p>{t("common.loading")}</p></div>;
  if (!user) return <Login setUser={setUser} />;

  // Lazy mount + keep-alive: chỉ mount tab khi user lần đầu vào.
  // Sau đó ẩn/hiện bằng CSS display — KHÔNG unmount.
  // mountedTabs là state để trigger re-render khi tab mới được thêm vào.

  const tabStyle = (i) => ({ display: tab === i ? "block" : "none", width: "100%" });
  const shouldMount = (i) => mountedTabs.has(i);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <ToastBridge />
      <div style={{
        minHeight: "100vh",
        background: colors.backgroundLight,
        color: colors.textPrimary,
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        {/* Top Branding Bar */}
        <div style={{
          background: colors.surface,
          width: "100vw",
          padding: isMobile ? "10px 16px" : "12px 24px",
          boxSizing: "border-box",
          borderBottom: `1px solid ${colors.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <img src={logo} alt="logo" className="app-header-logo" />

          <div className="app-header-right" style={{ color: colors.textPrimary }}>
            <span style={{ whiteSpace: "nowrap", fontWeight: 600, color: colors.textPrimary }}>
              {user?.name} {!isMobile && `(${user?.role})`}
            </span>

            <NotificationBell user={user} setActiveTab={handleSetActiveTab} />
            <UserSettings user={user} onLogout={handleLogout} />
          </div>
        </div>

        {/* Sticky Navigation Bar (The Teal Banner) */}
        <div style={{
          position: "sticky",
          top: 0,
          background: colors.primary,
          width: "100vw",
          boxShadow: `0 3px 14px ${colors.primary}33`,
          zIndex: 10,
          padding: "4px 0",
          boxSizing: "border-box"
        }}>
          <MagicMenu
            user={user}
            activeTab={tab}
            setActiveTab={handleSetActiveTab}
            gembaNotifCount={totalGembaNotifications}
            tuGembaNotifCount={totalTuGembaNotifications}
          />
        </div>

        {/* Content */}
        <div style={{
          maxWidth: 1100,
          width: "100%",
          margin: isMobile ? "0" : "38px auto",
          background: colors.surface,
          borderRadius: isMobile ? 0 : 22,
          minHeight: 460,
          boxShadow: `0 6px 32px ${colors.primary}22, 0 1.5px 10px #0001`,
          padding: isMobile ? "24px 16px" : "38px 32px",
          display: "flex",
          color: colors.textPrimary,
          flexGrow: 1,
          boxSizing: "border-box"
        }}>
          <div style={{ width: "100%" }}>
            <Suspense fallback={
              <div style={{ padding: "60px 0", textAlign: "center", color: colors.textSecondary }}>
                <div className="loading-spinner"></div>
                <div>Đang tải tính năng...</div>
              </div>
            }>
              {/* THÊM BỌC ĐIỀU KIỆN CHO TAB 0 VÀ 1 */}
              {!isRestrictedRole && (
                <div style={tabStyle(0)}>{shouldMount(0) && <ErrorBoundary fallbackTitle="Lỗi tải Gemba Checklist"><DailyAudit user={user} isMobile={isMobile} newErrorCounts={gembaNotifCounts} setGembaNotifCounts={setGembaNotifCounts} /></ErrorBoundary>}</div>
              )}
              {!isRestrictedRole && (
                <div style={tabStyle(1)}>{shouldMount(1) && <ErrorBoundary fallbackTitle="Lỗi tải Tự Gemba"><Gemba user={user} isMobile={isMobile} newLogCounts={tuGembaNotifCounts} setTuGembaNotifCounts={setTuGembaNotifCounts} /></ErrorBoundary>}</div>
              )}
              
              {/* EHS Committee Tab */}
              <div style={tabStyle(2)}>{shouldMount(2) && <ErrorBoundary fallbackTitle="Lỗi tải EHS Committee"><EhsCommittee user={user} isMobile={isMobile} activeSubTab={ehsActiveSubTab} setActiveSubTab={setEhsActiveSubTab} /></ErrorBoundary>}</div>
              
              <div style={tabStyle(3)}>{shouldMount(3) && <ErrorBoundary fallbackTitle="Lỗi tải Báo cơm"><BaoCom user={user} isMobile={isMobile} /></ErrorBoundary>}</div>
              <div style={tabStyle(4)}>{shouldMount(4) && <ErrorBoundary fallbackTitle="Lỗi tải Quản lý người dùng">{rolesNormalized.includes("admin") ? <UserManager user={user} isMobile={isMobile} /> : <div style={{padding:20}}>Access Denied</div>}</ErrorBoundary>}</div>
              <div style={tabStyle(5)}>{shouldMount(5) && <ErrorBoundary fallbackTitle="Lỗi tải Tài liệu"><DocumentManager user={user} isMobile={isMobile} /></ErrorBoundary>}</div>
            </Suspense>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center",
          color: colors.primary,
          fontSize: 14,
          fontWeight: 600,
          padding: "16px 0 22px 0",
          width: "100%"
        }}>
          SafeOne © {new Date().getFullYear()} | Created by Viet Tran
        </div>

        <Chatbot user={user} />
      </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}