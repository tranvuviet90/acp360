import React, { Suspense, lazy, useEffect } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { colors } from "../theme";
import { FaWalkieTalkie, FaLock, FaCertificate } from "react-icons/fa6";
import { IoCalendarClearOutline, IoCafeOutline, IoTrash } from "react-icons/io5";
import { MdSmokingRooms } from "react-icons/md";

// Lazy load các component con
const Calamviec = lazy(() => import("./Calamviec"));
const Bodam = lazy(() => import("./Bodam"));
const GiamSatHutThuoc = lazy(() => import("./GiamSatHutThuoc"));
const GiamSatGiaiLao = lazy(() => import("./GiamSatGiaiLao"));
const GiamSatNhaRac = lazy(() => import("./GiamSatNhaRac"));

// Placeholder cho các tính năng đang phát triển
function DevelopmentPlaceholder() {
  return (
    <div style={{
      padding: "60px 20px",
      textAlign: "center",
      color: colors.textSecondary,
      background: colors.background,
      borderRadius: "16px",
      border: `2px dashed ${colors.border}`,
      fontSize: "15px",
      fontWeight: "600",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px",
      boxShadow: "inset 0 2px 8px rgba(0,0,0,0.02)"
    }}>
      <div style={{ fontSize: "36px" }}>🚧</div>
      <div style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: "700" }}>
        Nội dung đang được phát triển
      </div>
      <div style={{ fontSize: "13px", color: colors.textSecondary }}>
        Tính năng này sẽ sớm ra mắt trong phiên bản cập nhật tiếp theo.
      </div>
    </div>
  );
}

const SUB_TABS = [
  { id: "calamviec", key: "menu.shift", shortKey: "menu.short.shift", Icon: IoCalendarClearOutline, component: Calamviec },
  { id: "bodam", key: "menu.walkietalkie", shortKey: "menu.short.walkietalkie", Icon: FaWalkieTalkie, component: Bodam },
  { id: "smoking", key: "menu.smoking", shortKey: "menu.short.smoking", Icon: MdSmokingRooms, component: GiamSatHutThuoc },
  { id: "break", key: "menu.break", shortKey: "menu.short.break", Icon: IoCafeOutline, component: GiamSatGiaiLao },
  { id: "trash", key: "menu.trash", shortKey: "menu.short.trash", Icon: IoTrash, component: GiamSatNhaRac },
  { id: "locker", key: "menu.locker", shortKey: "menu.short.locker", Icon: FaLock, component: DevelopmentPlaceholder },
  { id: "license", key: "menu.license", shortKey: "menu.short.license", Icon: FaCertificate, component: DevelopmentPlaceholder }
];

export default function EhsCommittee({ user, isMobile, activeSubTab, setActiveSubTab }) {
  const { t } = useI18n();

  // Đảm bảo có tab mặc định nếu chưa được set
  useEffect(() => {
    if (!activeSubTab) {
      setActiveSubTab("calamviec");
    }
  }, [activeSubTab, setActiveSubTab]);

  const activeTabConfig = SUB_TABS.find(tab => tab.id === activeSubTab) || SUB_TABS[0];
  const ActiveComponent = activeTabConfig.component;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Sub tabs navigation */}
      <div 
        className="ehs-subtabs-nav"
        style={{
          display: "flex",
          width: "100%",
          gap: isMobile ? "2px" : "12px",
          borderBottom: `2px solid ${colors.border}`,
          paddingBottom: "8px",
          overflowX: "auto", // Cho phép cuộn ngang tự động nếu màn hình quá hẹp trên PC
          scrollbarWidth: "none", // Ẩn scrollbar Firefox
          msOverflowStyle: "none", // Ẩn scrollbar IE/Edge
          WebkitOverflowScrolling: "touch"
        }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          .ehs-subtabs-nav::-webkit-scrollbar {
            display: none; /* Ẩn scrollbar Chrome/Safari/Edge */
          }
          .ehs-subtab-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: ${isMobile ? "column" : "row"};
            flex: 1;
            gap: ${isMobile ? "4px" : "8px"};
            padding: ${isMobile ? "6px 1px" : "10px 8px"};
            border: none;
            border-radius: 8px;
            background: transparent;
            color: ${colors.textSecondary};
            font-size: ${isMobile ? "10px" : "14px"};
            font-weight: 600;
            cursor: pointer;
            white-space: normal; /* Cho phép tự xuống dòng nếu màn hình bị hẹp trên cả PC */
            text-align: center;
            line-height: 1.2;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .ehs-subtab-btn:hover {
            color: ${colors.primary};
            background: ${colors.backgroundLight};
            transform: translateY(-1px);
          }
          .ehs-subtab-btn.active {
            color: ${colors.white};
            background: ${colors.primary};
            box-shadow: 0 4px 12px rgba(70, 110, 115, 0.3);
          }
          .ehs-subtab-btn svg {
            font-size: ${isMobile ? "15px" : "18px"};
          }
        `}} />

        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`ehs-subtab-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveSubTab(tab.id)}
            >
              <tab.Icon />
              <span>{isMobile ? t(tab.shortKey) : t(tab.key)}</span>
            </button>
          );
        })}
      </div>

      {/* Render sub-tab content */}
      <div style={{ width: "100%" }}>
        <Suspense fallback={
          <div style={{ padding: "40px 0", textAlign: "center", color: colors.textSecondary }}>
            <div className="loading-spinner"></div>
            <div style={{ marginTop: "12px" }}>Đang tải tính năng...</div>
          </div>
        }>
          <ActiveComponent user={user} isMobile={isMobile} />
        </Suspense>
      </div>
    </div>
  );
}
