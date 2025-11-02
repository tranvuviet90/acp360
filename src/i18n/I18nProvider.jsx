import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { DICTS } from "./dictionaries.js";

const I18nContext = createContext({
  lang: "vi",
  setLang: () => {},
  t: (key) => key,
});

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("app_lang") : null;
    return saved || "vi";
  });

  // đổi ngôn ngữ + lưu + set <html lang="">
  const setLang = (next) => {
    setLangState(next);
    try {
      localStorage.setItem("app_lang", next);
    } catch {}
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", next);
    }
  };

  useEffect(() => {
    // đảm bảo attribute khi load lần đầu
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", lang);
    }
  }, [lang]);

  const t = useMemo(() => {
    const dict = DICTS[lang] || {};
    return (key) => {
      if (!key) return "";
      const v = dict[key];
      return typeof v === "string" ? v : key; // fallback key
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
