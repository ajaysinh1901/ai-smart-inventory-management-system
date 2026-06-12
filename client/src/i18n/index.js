// i18n setup. Adds Hindi and Gujarati alongside English. Detector reads
// navigator.language → falls back to localStorage → falls back to 'en'.
//
// Translation files are colocated below so the Vite bundle splits cleanly
// per language. Hindi/Gujarati strings are included inline (small enough)
// instead of a separate JSON fetch — keeps the first paint snappy on 4G.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import gu from './locales/gu.json';

export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English',  native: 'English' },
  { code: 'hi', label: 'Hindi',    native: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      gu: { translation: gu },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS.map((l) => l.code),
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'smartstock-lang',
    },
    react: { useSuspense: false },
  });

export default i18n;
