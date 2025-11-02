import React from "react";
import { useI18n } from "../i18n/I18nProvider";

export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang, t } = useI18n();

  const change = (next) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div className={`lang-switcher ${className}`}>
      <button
        type="button"
        className={`lang-btn ${lang === "vi" ? "active" : ""}`}
        onClick={() => change("vi")}
        aria-pressed={lang === "vi"}
        title={t("language.vi")}
      >
        VI
      </button>
      <button
        type="button"
        className={`lang-btn ${lang === "en" ? "active" : ""}`}
        onClick={() => change("en")}
        aria-pressed={lang === "en"}
        title={t("language.en")}
      >
        EN
      </button>
    </div>
  );
}
