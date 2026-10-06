import { localeMessages } from "./messages.js";

export const languageKey = "interfaceLanguage";

export function languagePreference() {
  try {
    const value = globalThis.localStorage?.getItem(languageKey);
    if (["en", "zh_CN"].includes(value)) return value;
  } catch { /* Use the browser language if local preferences are unavailable. */ }
  return "auto";
}

export function language() {
  const preference = languagePreference();
  return preference === "auto" ? (chrome.i18n.getUILanguage().startsWith("zh") ? "zh_CN" : "en") : preference;
}

export function setLanguage(value) {
  if (!["auto", "en", "zh_CN"].includes(value)) throw new TypeError("Unsupported language");
  if (value === "auto") localStorage.removeItem(languageKey);
  else localStorage.setItem(languageKey, value);
}

export function t(key, substitutions) {
  return tForLocale(language(), key, substitutions);
}

export function tForLocale(language, key, substitutions) {
  if (!["en", "zh_CN"].includes(language)) language = "en";
  const entry = localeMessages[language][key] || localeMessages.en[key];
  if (!entry) return chrome.i18n.getMessage(key, substitutions) || key;
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return entry.message.replace(/\$([a-zA-Z0-9_]+)\$/g, (_, name) =>
    entry.placeholders[name.toLowerCase()].content.replace(/\$(\d+)/g, (_, n) => values[Number(n) - 1] ?? ""));
}

export function localize(root = document) {
  root.documentElement.lang = language() === "zh_CN" ? "zh-CN" : "en";
  for (const element of root.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const element of root.querySelectorAll("[data-i18n-label]")) element.setAttribute("aria-label", t(element.dataset.i18nLabel));
}
