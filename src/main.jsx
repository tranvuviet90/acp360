import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

import "./index.css";
import "./styles/typography.css";
import "./styles/global-responsive.css";
import "./auto-fix.js";

import { I18nProvider } from "./i18n/I18nProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
);
