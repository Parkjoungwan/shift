// Languages. The Korean sentence is the key: t("출근") returns "출근" in Korean and the
// dictionary entry elsewhere, falling back to Korean when an entry is missing.
//
// Rules for code that shows text (test/i18n.test.mjs checks them):
//   - The first argument of t() is always a plain string literal, never a variable or a
//     template literal, so scripts/i18n-keys.mjs can find every key.
//   - Values go in {name} slots: t("근무 {n}", { n: 3 }). Word order is the translator's job.
//   - Protocol values (lab names the server matches, directive word lists, error codes) stay
//     Korean in data; translate them where they are shown: t(word) with a dynamic key is
//     allowed only through tr(), which marks "this key is listed elsewhere".
//
// This file also runs in the Worker and in node tests (directives.js and the lab modules
// import it), so it touches no browser API unless one exists. There it is always Korean.

import en from "./i18n/en.js";
import ja from "./i18n/ja.js";
import zh from "./i18n/zh.js";

export const LANGS = [
  { id: "ko", name: "한국어" },
  { id: "en", name: "English" },
  { id: "ja", name: "日本語" },
  { id: "zh", name: "简体中文" },
];
const DICTS = { en, ja, zh };
const KEY = "shift.lang";

function pick() {
  if (typeof location === "undefined") return "ko";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && (q === "ko" || DICTS[q])) return q;
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (saved === "ko" || DICTS[saved])) return saved;
  } catch { /* storage blocked in a third-party iframe */ }
  const nav = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "ko";
  const two = nav.slice(0, 2).toLowerCase();
  if (two === "ko" || two === "ja" || two === "zh" || two === "en") return two;
  return "en";
}

export const lang = pick();
/** True once the visitor picked a language themselves (or the URL did). */
export const chosen = (() => {
  if (typeof location === "undefined") return true;
  try { if (new URLSearchParams(location.search).get("lang")) return true; } catch { /* ignore */ }
  try { return !!localStorage.getItem(KEY); } catch { return false; }
})();

const dict = lang === "ko" ? null : DICTS[lang];

function fill(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate a Korean literal. */
export function t(ko, vars) {
  return fill((dict && dict[ko]) || ko, vars);
}

/** Translate a Korean value that came from data (a lab name, an equipment name, a directive word). */
export function tr(ko, vars) {
  if (ko == null) return ko;
  return fill((dict && dict[ko]) || ko, vars);
}

/** Saves the choice and reloads, so every module evaluates its text again in the new language. */
export function setLang(id) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) url.searchParams.set("lang", id);
  // storage can be blocked in an iframe; carry the choice in the URL then
  try { if (localStorage.getItem(KEY) !== id) url.searchParams.set("lang", id); } catch { url.searchParams.set("lang", id); }
  location.replace(url.href);
}

/**
 * The building clock: server time in one fixed zone for everyone. Workers in different time
 * zones hand over in this clock ("arrives 14:03:20" on a note), so it never follows the
 * visitor's own zone. Same HH:MM:SS in every language.
 */
export const SITE_ZONE = "UTC";
export function siteClock(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds());
}

/** Font stacks for canvas text, per language. Galmuri covers Hangul, Latin and kana. */
export const FONT_FALLBACK = {
  ko: `"Malgun Gothic", sans-serif`,
  en: `"Malgun Gothic", sans-serif`,
  ja: `"Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif`,
  zh: `"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`,
}[lang];
