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
  IoDocumentsOutline,
} from "react-icons/io5";
import { MdSmokingRooms } from "react-icons/md";
import { FaWalkieTalkie, FaUserShield, FaHelmetSafety } from "react-icons/fa6";
import { FiUsers, FiSettings } from "react-icons/fi";

const ALL_ITEMS = [
  { key: "menu.gemba", Icon: BsClipboard2Check, countProp: "gembaNotifCount" },
  { key: "menu.tugemba", Icon: IoFootsteps, countProp: "tuGembaNotifCount" },
  {
    key: "menu.ehsCommittee",
    Icon: FaHelmetSafety,
    roles: ["admin", "ehs", "ehs committee", "manager"],
  },
  { key: "menu.meal", Icon: IoRestaurantOutline },
  { key: "manager.title", Icon: FiSettings, roles: ["admin"] },
  {
    key: "menu.documents",
    Icon: IoDocumentsOutline,
    roles: ["admin", "ehs", "ehs committee", "trainer", "manager"],
  },
];

import { DEPARTMENT_ROLES } from "../constants/roles";
import { normalizeRole } from "../utils/string";

const deptSet = new Set(DEPARTMENT_ROLES.map(normalizeRole));
const CANTEEN = normalizeRole("Nhà Ăn");

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
  const userRolesList = useMemo(() => {
    const raw = user?.role;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [String(raw)];
    return arr.flatMap(r => String(r).split(',')).map(r => normalizeRole(r)).filter(Boolean);
  }, [user?.role]);

  const visible = useMemo(() => {
    const isCanteen = userRolesList.includes(CANTEEN);
    if (isCanteen) return ALL_ITEMS.filter((i) => i.key === "menu.meal");
    
    const base = ALL_ITEMS.filter(
      (item) => !item.roles || item.roles.map(normalizeRole).some(r => userRolesList.includes(r))
    );
    
    // Show/hide meal registration tab for EHS Committee proxy
    if (userRolesList.includes(normalizeRole("ehs committee"))) {
      const hasValidProxy = user?.mealDept && deptSet.has(normalizeRole(user.mealDept));
      if (!hasValidProxy) {
        return base.filter((i) => i.key !== "menu.meal");
      }
    }
    
    return base;
  }, [userRolesList, user]); // Phụ thuộc vào `user` đảm bảo re-render khi user data thay đổi.

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
          const isDeptRole = userRolesList.some(r => deptSet.has(r));
          const hasEhsAccess = userRolesList.some(r => ["admin", "ehs", "ehs committee", "manager"].includes(r));
          const isDisabled = isDeptRole && !hasEhsAccess && item.key !== "menu.meal";
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