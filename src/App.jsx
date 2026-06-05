// Tệp đã sửa lỗi: App.jsx
// Đã thêm logic để không fetch-count nếu là vai trò 'Bộ phận' hoặc 'Nhà Ăn'
import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import DailyAudit from "./components/DailyAudit";
import Gemba from "./components/Gemba";
import Bodam from "./components/Bodam";
import Calamviec from "./components/Calamviec";
import GiamSatHutThuoc from "./components/GiamSatHutThuoc";
import GiamSatGiaiLao from "./components/GiamSatGiaiLao";
import GiamSatNhaRac from "./components/GiamSatNhaRac";
import BaoCom from "./components/BaoCom";
import UserSettings from "./components/UserSettings";
import UserManager from "./components/UserManager";
import DocumentManager from "./components/DocumentManager";
import NotificationBell from "./components/NotificationBell";
import logo from "./assets/logo.svg";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, Timestamp, getCountFromServer, setDoc } from "firebase/firestore";
import "./App.css";

import MagicMenu from "./components/MagicMenu";
import Chatbot from "./components/Chatbot";
import { colors } from "./theme";
import { ToastProvider, ConfirmProvider, useToast } from "./components/LightboxSwipeOnly";

import { useI18n } from "./i18n/I18nProvider";

const departments = [
  { name: "Cutting" }, { name: "Rolling" }, { name: "Finishing" }, { name: "Dipping" },
  { name: "Graphics" }, { name: "QC" }, { name: "Warehouse" }, { name: "Arrow" },
  { name: "MTN" }, { name: "ENG" },
];

// CHANGED: Đã sửa "Q_QC" thành "G_QC"
const departmentRoles = [
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

const stripDiacritics = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeRole = (r) => stripDiacritics(String(r || "").trim()).toLowerCase();
const deptRolesNormalized = new Set(departmentRoles.map(normalizeRole));
const CANTEEN_NORMALIZED = normalizeRole("Nhà Ăn");

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
  const roleN = user ? normalizeRole(user.role) : "";
  const isDept = deptRolesNormalized.has(roleN);
  const isCanteen = roleN === CANTEEN_NORMALIZED;
  const isRestrictedRole = isDept || isCanteen; 
  // ---------------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const userData = { uid: firebaseUser.uid, email: firebaseUser.email, ...data };
          setUser(userData);

          const currentRoleN = normalizeRole(userData.role);
          const currentIsDept = deptRolesNormalized.has(currentRoleN);
          const currentIsCanteen = currentRoleN === CANTEEN_NORMALIZED;
          
          // --- SỬA LỖI TẠI ĐÂY ---
          // CHANGED: Chỉ tự động chuyển đến tab Báo cơm (index 7) nếu người dùng
          // có vai trò là một bộ phận hoặc là nhà ăn.
          // Người dùng "ehs committee" được ủy quyền sẽ không bị chuyển tab,
          // họ sẽ ở lại tab mặc định là 0. Logic hiển thị tab đã được xử lý
          // trong MagicMenu.jsx nên tab Báo cơm vẫn sẽ xuất hiện.
          setTab(currentIsDept || currentIsCanteen ? 7 : 0);
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

            <NotificationBell user={user} setActiveTab={setTab} />
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
            setActiveTab={setTab}
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
            {/* THÊM BỌC ĐIỀU KIỆN CHO TAB 0 VÀ 1 */}
            {!isRestrictedRole && (
              <div style={tabStyle(0)}>{shouldMount(0) && <DailyAudit user={user} isMobile={isMobile} newErrorCounts={gembaNotifCounts} setGembaNotifCounts={setGembaNotifCounts} />}</div>
            )}
            {!isRestrictedRole && (
              <div style={tabStyle(1)}>{shouldMount(1) && <Gemba user={user} isMobile={isMobile} newLogCounts={tuGembaNotifCounts} setTuGembaNotifCounts={setTuGembaNotifCounts} />}</div>
            )}
            
            {/* CÁC TAB CÒN LẠI GIỮ NGUYÊN */}
            <div style={tabStyle(2)}>{shouldMount(2) && <Bodam user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(3)}>{shouldMount(3) && <Calamviec user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(4)}>{shouldMount(4) && <GiamSatHutThuoc user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(5)}>{shouldMount(5) && <GiamSatGiaiLao user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(6)}>{shouldMount(6) && <GiamSatNhaRac user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(7)}>{shouldMount(7) && <BaoCom user={user} isMobile={isMobile} />}</div>
            <div style={tabStyle(8)}>{shouldMount(8) && (user?.role === "admin" ? <UserManager user={user} isMobile={isMobile} /> : <div style={{padding:20}}>Access Denied</div>)}</div>
            <div style={tabStyle(9)}>{shouldMount(9) && <DocumentManager user={user} isMobile={isMobile} />}</div>
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

        <Chatbot />
      </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}