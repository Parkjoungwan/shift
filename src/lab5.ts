// Server-side rules for lab 5 "Signature" (서명). Keep in step with public/lab5.js.
// The server owns the room's phase, the anchor, the card signatures on door D and how many
// switches each phase-shifter shift has used. It also writes the overseer's forged pin
// (reports/퍼즐 깊이 설계 리서치.md S4): signed with the number of a real shift that was not on
// the control desk, so the shift log and the tapes prove it false, and truthful a third of the
// time, so only the signature tells.

import { ALL_WORDS, TEMPLATES, type Phrase } from "../public/directives.js";

export type Phase = "blue" | "red";
export const SWITCHES_PER_SHIFT = 2;

export interface Lab5State {
  phase: Phase;
  anchor: Phase | null; // the colour held solid whatever the phase
  signs: number[]; // log ids of the card shifts that signed at the terminal
  needed: number; // signatures door D wants: more staff, more procedure
  used: { logId: number; n: number }; // switches used by the current phase-shifter shift
  seen?: { logId: number; character: string }[]; // shifts that acted here: what the overseer signs with
}

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function newState(tier = 1): Lab5State {
  const phase: Phase = crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? "blue" : "red";
  return { phase, anchor: null, signs: [], needed: Math.max(1, Math.min(3, tier)), used: { logId: 0, n: 0 }, seen: [] };
}

const door = (s: Lab5State) => s.signs.length >= s.needed;

export type ActResult = "switched" | "limit" | "anchored" | "released" | "signed" | "open" | "already" | "bad";

export const SEEN_MAX = 6;
/** A shift that did something here: its number and equipment are in the log and on its tape. */
function remember(state: Lab5State, logId: number, character: string): void {
  if (!(logId > 0) || character === "control") return;
  const seen = (state.seen ?? []).filter((s) => s.logId !== logId);
  seen.push({ logId, character });
  state.seen = seen.slice(-SEEN_MAX);
}

/**
 * "switch": the phase shifter flips the room (twice a shift). "anchor:blue" / "anchor:red": plants
 * the one anchor in that colour's socket (again: pulls it out). "sign": the card signs at the terminal.
 */
export function act(state: Lab5State, character: string, what: unknown, logId = 0): ActResult {
  const result = act0(state, character, what, logId);
  if (result !== "bad") remember(state, logId, character);
  return result;
}
function act0(state: Lab5State, character: string, what: unknown, logId: number): ActResult {
  if (what === "switch") {
    if (character !== "phase") return "bad";
    if (state.used.logId !== logId) state.used = { logId, n: 0 };
    if (state.used.n >= SWITCHES_PER_SHIFT) return "limit";
    state.used.n++;
    state.phase = state.phase === "blue" ? "red" : "blue";
    return "switched";
  }
  if (what === "anchor:blue" || what === "anchor:red") {
    if (character !== "phase") return "bad";
    const c: Phase = what === "anchor:blue" ? "blue" : "red";
    if (state.anchor === c) { state.anchor = null; return "released"; }
    state.anchor = c;
    return "anchored";
  }
  if (what === "sign") {
    if (character !== "key") return "bad";
    if (door(state)) return "already";
    if (state.signs.includes(logId)) return "already"; // one signature per card shift
    state.signs.push(logId);
    return door(state) ? "open" : "signed";
  }
  return "bad";
}

export function retier(state: Lab5State, tier: number): boolean {
  if (door(state)) return false;
  state.needed = Math.max(1, Math.min(3, tier));
  return true;
}

export function publicWorld(world: unknown, state: Lab5State): unknown {
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {
    ...base, lab: 5, phase: state.phase, anchor: state.anchor, signs: state.signs.length, needed: state.needed,
    door: door(state), used: { ...state.used },
  };
  out.lever = door(state) && base.lever === true;
  return out;
}

export function canClear(state: Lab5State, world: unknown): boolean {
  return door(state) && !!world && (world as Record<string, unknown>).lever === true;
}

// ---------- the overseer's forgery (same as public/lab5.js) ----------

export const FORGE_TRUTH = 1 / 3;
const PHASE_WORD: Record<Phase, string> = { blue: "청 위상", red: "적 위상" };
const EQUIP_WORD: Record<string, string> = { phase: "위상 이동기", key: "출입 카드", tall: "보행 보조 장치", light: "조명" };
const phrase = (template: string, word: string): Phrase => [TEMPLATES.indexOf(template), ALL_WORDS.indexOf(word)] as Phrase;
const pick = <T>(list: T[], r: () => number): T => list[Math.min(list.length - 1, Math.floor(r() * list.length))];

function neededNext(state: Lab5State): string {
  const bridge = state.phase === "blue" || state.anchor === "blue";
  const steps = state.phase === "red" || state.anchor === "red";
  if (!door(state)) return bridge ? "key" : "phase";
  return bridge && steps ? "tall" : "phase";
}
function wastedNow(state: Lab5State): string[] {
  if (!door(state)) return ["tall", "light"];
  return neededNext(state) === "tall" ? ["phase", "light"] : ["light"];
}

/**
 * The overseer's directive after a shift, by the entrance. logId is the signature it claims: a real
 * shift of this opening that was not the control desk (0 only before anyone has acted). It names
 * the phase or the next worker's equipment, truthfully a third of the time.
 * ended: the shift that just ended, when the caller passes it.
 */
export function forge(
  state: Lab5State,
  ended: { logId: number; character: string } | null = null,
  r: () => number = rand,
): { x: number; y: number; msg: Phrase; logId: number } {
  const signers = (state.seen ?? []).map((s) => s.logId);
  if (ended && ended.logId > 0 && ended.character !== "control" && !signers.includes(ended.logId)) signers.push(ended.logId);
  const logId = signers.length ? pick(signers, r) : 0;
  const truthful = r() < FORGE_TRUTH;
  let msg: Phrase;
  if (r() < 0.5) {
    const phase: Phase = truthful ? state.phase : state.phase === "blue" ? "red" : "blue";
    msg = phrase("{} 있음", PHASE_WORD[phase]);
  } else {
    msg = phrase("다음 근무자는 {}", EQUIP_WORD[truthful ? neededNext(state) : pick(wastedNow(state), r)]);
  }
  return { x: 4 * 16 + 8, y: 20 * 16, msg, logId };
}

export const id = 5;
export const characters = ["phase", "key", "tall", "light"] as const;
