import React, {
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
  useState,
  useCallback,
} from "react";
import "./MagicMenu.css";
import { useI18n } from "../i18n/I18nProvider";
import { BsClipboard2Check } from "react-icons/bs";
import {
  IoFootsteps,
  IoCalendarClearOutline,
  IoCafeOutline,
  IoTrash,
  IoRestaurantOutline,
} from "react-icons/io5";
import { MdSmokingRooms } from "react-icons/md";
import { FaWalkieTalkie } from "react-icons/fa6";

const ALL_ITEMS = [
  { key: "menu.gemba", Icon: BsClipboard2Check, countProp: "gembaNotifCount" },
  { key: "menu.tugemba", Icon: IoFootsteps, countProp: "tuGembaNotifCount" },
  { key: "menu.walkietalkie", Icon: FaWalkieTalkie },
  {
    key: "menu.shift",
    Icon: IoCalendarClearOutline,
    roles: ["admin", "ehs", "ehs committee", "manager"],
  },
  { key: "menu.smoking", Icon: MdSmokingRooms },
  { key: "menu.break", Icon: IoCafeOutline },
  { key: "menu.trash", Icon: IoTrash },
  { key: "menu.meal", Icon: IoRestaurantOutline },
];

// CHANGED: Đã sửa "Q_QC" thành "G_QC"
const departmentRoles = [
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

const strip = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (r) => strip(String(r || "").trim()).toLowerCase();
const deptSet = new Set(departmentRoles.map(norm));
const CANTEEN = norm("Nhà Ăn");

const rafThrottle = (fn) => {
  let ticking = false;
  return (...args) => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        fn(...args);
      });
    }
  };
};

export default function MagicMenu({ user, activeTab, setActiveTab, ...props }) {
  const { t } = useI18n();
  const roleN = norm(user?.role || "");

  const visible = useMemo(() => {
    if (roleN === CANTEEN) return ALL_ITEMS.filter((i) => i.key === "menu.meal");
    const base = ALL_ITEMS.filter(
      (i) => !i.roles || i.roles.map(norm).includes(roleN)
    );
    
    // Logic này đã đúng để xử lý race condition.
    // Khi user object được cập nhật đầy đủ (với mealDept), useMemo sẽ chạy lại
    // và hiển thị tab Báo cơm một cách chính xác.
    if (roleN === norm("ehs committee")) {
      const hasValidProxy = user?.mealDept && deptSet.has(norm(user.mealDept));
      if (!hasValidProxy) {
        return base.filter((i) => i.key !== "menu.meal");
      }
    }
    
    return base;
  }, [roleN, user]); // Phụ thuộc vào `user` đảm bảo re-render khi user data thay đổi.

  const navRef = useRef(null);
  const mountedRef = useRef(false);
  const [indicator, setIndicator] = useState({
    show: false,
    left: 0,
    top: 0,
    size: 80,
    border: 8,
  });
  const prevGoodRect = useRef(null);

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;

    const ul = nav.querySelector("ul");
    if (!ul) return;

    let li =
      ul.querySelector(`li[data-index="${activeTab}"]`) ||
      ul.querySelector("li.active");

    if (!li) {
      if (prevGoodRect.current) {
        setIndicator((s) => ({ ...s, show: true }));
      }
      return;
    }

    const liRect = li.getBoundingClientRect();
    const ulRect = ul.getBoundingClientRect();

    if (!liRect || !ulRect || liRect.width === 0 || liRect.height === 0) {
      if (prevGoodRect.current) setIndicator((s) => ({ ...s, show: true }));
      return;
    }

    const base = Math.min(liRect.width, liRect.height);
    const size = Math.max(64, Math.min(92, Math.floor(base * 1.2)));
    const border = Math.round(size * 0.1);
    const left = liRect.left - ulRect.left + liRect.width / 2 - size / 2;
    const top = liRect.top - ulRect.top - size * 0.35;

    prevGoodRect.current = { left, top, size, border };
    setIndicator({ show: true, left, top, size, border });
  }, [activeTab]);

  const measureRaf = useRef(rafThrottle(measure)).current;

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      measure();
      mountedRef.current = true;
    } else {
      measureRaf();
    }
  }, [activeTab, visible.length, measure, measureRaf]);

  useEffect(() => {
    const reflow = measureRaf;
    window.addEventListener("resize", reflow);
    window.addEventListener("orientationchange", reflow);
    window.addEventListener("scroll", reflow, true);

    const ro = new ResizeObserver(reflow);
    if (navRef.current) ro.observe(navRef.current);

    if (document?.fonts?.ready) {
      document.fonts.ready.then(() => reflow());
    }

    return () => {
      window.removeEventListener("resize", reflow);
      window.removeEventListener("orientationchange", reflow);
      window.removeEventListener("scroll", reflow, true);
      ro.disconnect();
    };
  }, [measureRaf]);

  return (
    <div className="magic-navigation" ref={navRef} data-skip-auto-fix>
      <ul>
        {visible.map((item) => {
          const originalIndex = ALL_ITEMS.findIndex((o) => o.key === item.key);
          const isActive = activeTab === originalIndex;
          const isDeptRole = deptSet.has(roleN);
          const isDisabled = isDeptRole && item.key !== "menu.meal";
          const count = item.countProp ? props[item.countProp] || 0 : 0;

          return (
            <li
              key={item.key}
              data-index={originalIndex}
              className={`list ${isActive ? "active" : ""} ${
                isDisabled ? "disabled" : ""
              }`}
              onClick={() => {
                if (!isDisabled && typeof setActiveTab === "function") {
                  setActiveTab(originalIndex);
                }
              }}
            >
              <a>
                <span className="icon">
                  <item.Icon />
                  {count > 0 && (
                    <span
                      className="notification-badge-magic"
                      aria-label="unread"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
                <span className="text">{t(item.key)}</span>
              </a>
            </li>
          );
        })}
        <div
          className={`indicator ${mountedRef.current ? "animated" : "no-anim"}`}
          style={{
            display: indicator.show ? "block" : "none",
            position: "absolute",
            left: indicator.left,
            top: indicator.top,
            width: indicator.size,
            height: indicator.size,
            borderWidth: indicator.border,
            willChange: "left, top",
          }}
        />
      </ul>
    </div>
  );
}