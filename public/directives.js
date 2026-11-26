// The controller's tools, shared by the browser and the Worker (src/building.ts imports this
// file), so both sides accept exactly the same things.
//
// The controller (관제) is a shift like any other, taken with the "control" equipment card. It
// has no body: it spends its 60 seconds at the console and leaves
//   - numbered pins (①②③) on the floor of the lab, each with an optional directive built from
//     a fixed template and a fixed word list (no free text, so nothing to moderate), and
//   - stamps on other workers' notes: 확인됨 / 틀림 / 오래됨.
// White collar writes in forms; blue collar draws. That contrast is the point.

import { t, tr } from "./i18n.js";

export const PINS = 3; // pin numbers 1..PINS
export const STAMPS_PER_SHIFT = 3;

// One seal-red ink for every stamp; they differ by shape, so they read without colour vision.
export const STAMP_INK = "#b8302a";
export const STAMPS = {
  ok: { label: t("확인됨"), shape: "circle", color: STAMP_INK },
  wrong: { label: t("틀림"), shape: "cross", color: STAMP_INK },
  old: { label: t("오래됨"), shape: "dashed", color: STAMP_INK },
};

/**
 * Pins follow the Korean industrial safety-sign grammar (안전보건표지): the template decides
 * the sign. prohibit = red ring with a bar, warn = yellow triangle, must = blue disc,
 * info = green square; a pin without a directive is a plain grey marker.
 */
export const SIGNS = {
  prohibit: { color: "#c8402e", ink: "#1e1e1c" },
  warn: { color: "#e8b830", ink: "#1e1e1c" },
  must: { color: "#2f5fa8", ink: "#f4ecd8" },
  info: { color: "#3f8f4a", ink: "#f4ecd8" },
  plain: { color: "#a8a59c", ink: "#1e1e1c" },
};
const SIGN_OF_TEMPLATE = ["info", "warn", "must", "prohibit", "must", "info", "info", "must", "must", "warn"];
export function signFor(msg) {
  const p = cleanPhrase(msg);
  return p ? SIGN_OF_TEMPLATE[p[0]] ?? "info" : "plain";
}

/** "{}" is where the word goes. Words are all nouns, so every pairing reads as a sentence. */
export const TEMPLATES = [
  "여기서 {}",
  "{} 주의",
  "{} 필요",
  "{} 금지",
  "{} 먼저",
  "{} 있음",
  "{} 없음",
  "다음 근무자는 {}",
  "{} 확인 바람",
  "{}?",
];

export const WORDS = [
  { group: "장비", words: ["출입 카드", "보행 보조 장치", "조명", "잔상 기록기", "관제"] },
  { group: "동작", words: ["점프", "대기", "퇴근", "입력", "탑승", "등반", "후퇴", "서두름", "휴식"] },
  { group: "장치", words: ["문", "발판", "선반", "단말기", "레버", "엘리베이터", "버튼", "차단기", "기호 벽", "쪽지"] },
  { group: "판단", words: ["정답", "거짓", "함정", "지름길", "막다른 길", "시간 부족", "안전", "위험", "앞사람 실수"] },
  { group: "순서·시간", words: ["1번 핀", "2번 핀", "3번 핀", "10초", "20초", "30초", "45초"] },
  { group: "기타", words: ["어둠", "감독관", "실험", "기록", "예산"] },
  // added for lab 5; new groups go at the end so the indices of stored pins keep their meaning
  { group: "위상", words: ["위상 이동기", "청 위상", "적 위상", "위상 닻", "감전", "서명"] },
];
export const ALL_WORDS = WORDS.flatMap((g) => g.words);

export const CONNECTORS = ["그리고", "그러나", "그러므로", "아니면", "그래도"];

const index = (v, list) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : -1);

/**
 * A directive is [template, word] or [template, word, connector, template, word], as indices.
 * Returns a clean copy, or null when it is not one.
 */
export function cleanPhrase(msg) {
  if (!Array.isArray(msg) || (msg.length !== 2 && msg.length !== 5)) return null;
  const t = index(msg[0], TEMPLATES), w = index(msg[1], ALL_WORDS);
  if (t < 0 || w < 0) return null;
  if (msg.length === 2) return [t, w];
  const c = index(msg[2], CONNECTORS), t2 = index(msg[3], TEMPLATES), w2 = index(msg[4], ALL_WORDS);
  if (c < 0 || t2 < 0 || w2 < 0) return null;
  return [t, w, c, t2, w2];
}

/** The directive as text, or "" for none. */
export function phraseText(msg) {
  const p = cleanPhrase(msg);
  if (!p) return "";
  // the lists stay Korean (the server matches them); the words are translated here, for display
  const clause = (t, w) => tr(TEMPLATES[t]).replace("{}", tr(ALL_WORDS[w]));
  const first = clause(p[0], p[1]);
  return p.length === 2 ? first : `${first}, ${tr(CONNECTORS[p[2]])} ${clause(p[3], p[4])}`;
}

/** Room size in world pixels, for checking where a pin goes (see engine.js). */
const W = 640, H = 352;

/**
 * Checks a pin from the controller. Returns { n, x, y, msg } or null.
 * Where it may stand (an open floor tile) is the client's word, like every position.
 */
export function cleanPin(input) {
  if (!input || typeof input !== "object") return null;
  const n = Number(input.n), x = Number(input.x), y = Number(input.y);
  if (!Number.isInteger(n) || n < 1 || n > PINS) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > W || y < 0 || y > H) return null;
  const msg = input.msg == null ? null : cleanPhrase(input.msg);
  if (input.msg != null && !msg) return null;
  return { n, x: Math.round(x), y: Math.round(y), msg };
}
