// Shared constants, types and input validation for the shift relay server.

export interface Env {
  BUILDING: DurableObjectNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
  ADMIN_TOKEN?: string;
  DISCORD_WEBHOOK?: string;
}

// "control" is the controller: a shift spent at the console, offered in every lab (see public/directives.js).
export const CHARACTERS = ["key", "tall", "light", "echo", "phase", "control"] as const;
export type Character = (typeof CHARACTERS)[number];

export const LIMITS = {
  maxMessage: 32 * 1024, // any incoming WebSocket frame
  maxState: 512, // one relayed position snapshot
  maxWorld: 16 * 1024, // serialized shared world
  maxQueue: 50,
  nickLength: 12,
  offerMs: 20_000, // time to pick a character once it is your turn
  idleMs: 90_000, // worker with no input is clocked out
  maxShiftMs: 60_000, // default length of one shift; admins can change it at runtime
  shiftGraceMs: 1500, // the client clocks itself out at the limit; the server steps in after this
  alarmMs: 20_000, // how often an active shift is checked
  handoverMs: 60_000, // window to leave notes after clocking out
  notesPerShift: 1, // one note per shift: a handover, not a notice board
  noteW: 96,
  noteH: 64,
  noteColors: 4,
  noteStrokes: 60,
  notePoints: 2000,
  blurAt: 1, // reports needed to blur a note
  hideAt: 2, // reports needed to hide a note or mask a nickname
} as const;

export const ANON_NICK = "익명 근무자";

// Small starter list; extend as needed. Compared after removing spaces and lowercasing.
const BLOCKED = ["시발", "씨발", "병신", "좆", "fuck", "shit", "nigg", "bitch", "sex"];

/** Returns the cleaned nickname, or "" when there is none or it is not allowed. */
export function cleanNick(input: unknown): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .normalize("NFKC")
    // control characters, zero-width characters and bidi overrides
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const nick = Array.from(cleaned).slice(0, LIMITS.nickLength).join("");
  if (!nick) return "";
  const flat = nick.replace(/\s/g, "").toLowerCase();
  if (BLOCKED.some((w) => flat.includes(w))) return "";
  return nick;
}

export function validCid(input: unknown): input is string {
  return typeof input === "string" && /^[A-Za-z0-9-]{8,64}$/.test(input);
}

export interface Stroke {
  c: number; // colour index
  p: number[]; // x0,y0,x1,y1,...
}

/** Returns sanitized strokes, or null when the drawing is malformed or empty. */
export function cleanStrokes(input: unknown): Stroke[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > LIMITS.noteStrokes) return null;
  const out: Stroke[] = [];
  let points = 0;
  for (const s of input) {
    if (!s || typeof s !== "object") return null;
    const { c, p } = s as { c: unknown; p: unknown };
    if (!Number.isInteger(c) || (c as number) < 0 || (c as number) >= LIMITS.noteColors) return null;
    if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
    points += p.length / 2;
    if (points > LIMITS.notePoints) return null;
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      const max = i % 2 === 0 ? LIMITS.noteW : LIMITS.noteH;
      if (!Number.isInteger(v) || v < 0 || v >= max) return null;
    }
    out.push({ c: c as number, p: p as number[] });
  }
  return out;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
