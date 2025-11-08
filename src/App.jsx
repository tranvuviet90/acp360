// Tệp: App.jsx
// SỬA LỖI: Thêm try...catch vào trong onAuthStateChanged
// để xử lý lỗi promise (Uncaught in promise)
import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import GembaCheckList from "./components/gembachecklist";
import TuGemba from "./components/TuGemba";
import Bodam from "./components/Bodam";
import Calamviec from "./components/Calamviec";
import HutThuocToilet from "./components/HutThuocToilet";
import GiaiLaoChat from "./components/GiaiLaoChat";
import GiamSatNhaRac from "./components/GiamSatNhaRac";
import BaoCom from "./components/BaoCom";
import logo from "./assets/logo.png";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, Timestamp, getCountFromServer } from "firebase/firestore";
import "./App.css";

import MagicMenu from "./components/MagicMenu";
import Chatbot from "./components/Chatbot";
import { colors } from "./theme";
import { ToastProvider, useToast } from "./components/LightboxSwipeOnly";

import { useI18n } from "./i18n/I18nProvider";
import LanguageSwitcher from "./components/LanguageSwitcher";

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
  const [windowSize, setWindowSize] = useState({ width: undefined, height: undefined });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
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

  useEffect(() => {
    // =================================================================
    // === BẮT ĐẦU SỬA LỖI (Uncaught in promise)                      ===
    // =================================================================
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try { // Thêm try...
        if (firebaseUser) {
          const ref = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(ref); // Lệnh await này có thể gây lỗi
          if (snap.exists()) {
            const data = snap.data();
            const userData = { uid: firebaseUser.uid, email: firebaseUser.email, ...data };
            setUser(userData);

            const roleN = normalizeRole(userData.role);
            const isDept = deptRolesNormalized.has(roleN);
            const isCanteen = roleN === CANTEEN_NORMALIZED;
            
            setTab(isDept || isCanteen ? 7 : 0);
            
          } else {
            // Nếu không tìm thấy thông tin user trong 'users' (ví dụ: bị xóa)
            setUser(null); 
          }
        } else {
          setUser(null);
        }
      } catch (error) { // Thêm ...catch
        // Xử lý bất kỳ lỗi nào xảy ra khi getDoc
        console.error("Lỗi khi kiểm tra trạng thái đăng nhập:", error);
        setUser(null); // Đảm bảo logout nếu có lỗi
      } finally { // Thêm finally
        setLoading(false);
      }
      // =================================================================
      // === KẾT THÚC SỬA LỖI                                          ===
      // =================================================================
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const roleN = normalizeRole(user.role);
    const isDept = deptRolesNormalized.has(roleN);
    const isCanteen = roleN === CANTEEN_NORMALIZED;

    if (isDept || isCanteen) {
      setGembaNotifCounts({});
      setTuGembaNotifCounts({});
      return; 
    }

    const fetchCountsForTab = async (collectionName, storageKey, setCountFunction) => {
      const lastSeenTimestamps = JSON.parse(localStorage.getItem(storageKey) || "{}");
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
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // setUser(null) và setLoading(false) sẽ được xử lý tự động
      // bởi onAuthStateChanged
    } catch (e) {
      console.error("Lỗi đăng xuất:", e);
    }
  };

  if (loading) return <div className="loading-container"><p>{t("common.loading")}</p></div>;
  if (!user) return <Login setUser={setUser} />;

  const tabComponents = [
    <GembaCheckList newErrorCounts={gembaNotifCounts} setGembaNotifCounts={setGembaNotifCounts} />,
    <TuGemba newLogCounts={tuGembaNotifCounts} setTuGembaNotifCounts={setTuGembaNotifCounts} />,
    <Bodam />,
    <Calamviec />,
    <HutThuocToilet />,
    <GiaiLaoChat />,
    <GiamSatNhaRac />,
    <BaoCom />
  ];
  const ActiveComponent = React.cloneElement(tabComponents[tab], { user, isMobile });

  return (
    <ToastProvider>
      <ToastBridge />
      <div style={{
        minHeight: "100vh",
        background: colors.backgroundLight,
        color: colors.textPrimary,
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        {/* Header */}
        <div style={{
          position: "sticky",
          top: 0,
          background: colors.primary,
          width: "100vw",
          boxShadow: "0 2px 12px #E88E2E55",
          zIndex: 10,
          padding: isMobile ? "10px 16px" : "10px 24px",
          boxSizing: "border-box"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom: "10px",
          }}>
            <img src={logo} alt="logo" className="app-header-logo" />

            <div className="app-header-right">
              <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                {user?.name} {!isMobile && `(${user?.role})`}
              </span>

              <LanguageSwitcher />

              <button
                onClick={handleLogout}
                title={t("logout")}
                className="btn-logout"
              >
                {t("logout")}
              </button>
            </div>
          </div>

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
          boxShadow: "0 6px 32px #E88E2E22, 0 1.5px 10px #0001",
          padding: isMobile ? "24px 16px" : "38px 32px",
          display: "flex",
          color: colors.textPrimary,
          flexGrow: 1,
          boxSizing: "border-box"
        }}>
          <div style={{ width: "100%" }}>
            {ActiveComponent}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center",
          color: "#E88E2E",
          fontSize: 14,
          fontWeight: 600,
          padding: "16px 0 22px 0",
          width: "100%"
        }}>
          ACP360 © {new Date().getFullYear()} | Created by Viet Tran
        </div>

        <Chatbot />
      </div>
    </ToastProvider>
  );
}
