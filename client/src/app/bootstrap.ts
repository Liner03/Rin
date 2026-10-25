import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { listenSystemMode } from "../utils/darkModeUtils";
import en from "../../public/locales/en/translation.json";
import zhCN from "../../public/locales/zh-CN/translation.json";

let bootstrapped = false;

export function bootstrapApp() {
  if (bootstrapped) {
    return;
  }

  listenSystemMode();

  i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // Keep the most common language and its fallback off the startup network path.
      resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
      partialBundledLanguages: true,
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
      },
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN", "zh-TW", "ja"],
      load: "currentOnly",
      interpolation: {
        escapeValue: false,
      },
    });

  bootstrapped = true;
}
