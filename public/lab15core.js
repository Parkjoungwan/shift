// Room 5-2 "Phase drop" (위상 낙하): rules shared by the browser and the server (src/lab15.ts
// imports this file). The room's phase decides which ledges exist, and boxes resting on a ledge
// fall when it goes: the server works out where they come to rest, so every screen agrees.
// The overseer's forged directive works as in lab 5 (S4): signed with a real non-control shift's
// number, truthful a third of the time; one of its lies is "anchor first", the room's catch.
// No DOM, no engine import: the map is listed here and lab15.js builds the same grid from it.

import { ALL_WORDS, TEMPLATES } from "./directives.js";

export const T = 16; // keep in step with engine.js
export const COLS = 40, ROWS = 22;
const SOLID = 1, DOOR = 3, BLUE = 5, RED = 6;
export const SWITCHES_PER_SHIFT = 2;

/** The map as [x0, y0, x1, y1, value] fills over solid rock (engine.js makeGrid). */
export const FILLS = [
  [1, 16, 5, 19, 0], // the entrance, with the anchor sockets
  [6, 16, 13, 20, 0], // the trench...
  [6, 20, 13, 20, RED], // ...and its red bridge
  [14, 6, 20, 19, 0], // the drop shaft over the plates
  [16, 9, 16, 9, BLUE], [16, 13, 16, 13, RED], // box A: on blue, then red: red, blue drops it
  [18, 8, 18, 8, BLUE], [18, 11, 18, 11, RED], [18, 14, 18, 14, BLUE], // box B (more staff): red, blue, red
  [21, 16, 21, 19, DOOR], // gate G
  [22, 1, 38, 19, 0], // the lever room (headroom over the lever ledge)
  [24, 16, 26, 16, SOLID], [28, 12, 30, 12, SOLID], [31, 8, 32, 8, SOLID], // 4-tile shelves
  [35, 4, 37, 4, SOLID], // the lever's ledge
];
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(SOLID));
for (const [x0, y0, x1, y1, v] of FILLS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = v;
export const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? SOLID : grid[ty][tx]);

export const PLATES = [16, 18]; // the plate under each stack (row 19)
export const SOCKETS = { blue: 3, red: 5 }; // columns at the entrance
const phaseOf = (v) => (v === BLUE ? "blue" : v === RED ? "red" : null);
export const phaseSolid = (state, v) => { const c = phaseOf(v); return !!c && (state.phase === c || state.anchor === c); };
const solid = (state, tx, ty) => { const v = tileAt(tx, ty); return v === SOLID || v === DOOR || phaseSolid(state, v); };

/** tier 1: box A only; 2-3: box B too. The room always opens blue, with no anchor. */
export function newState(tier = 1) {
  const two = tier >= 2;
  const boxes = [{ col: 16, row: 8 }, ...(two ? [{ col: 18, row: 7 }] : [])];
  const state = { phase: "blue", anchor: null, used: { logId: 0, n: 0 }, boxes, needed: boxes.length, seen: [] };
  settle(state);
  return state;
}

/** Lets every box fall until something holds it: a solid tile, a ledge that exists now, another box. */
export function settle(state) {
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of state.boxes) {
      const below = b.row + 1;
      if (below >= ROWS || solid(state, b.col, below) || state.boxes.some((o) => o !== b && o.col === b.col && o.row === below)) continue;
      b.row = below;
      moved = true;
    }
  }
}

export const plateLoad = (state) => state.boxes.filter((b) => PLATES.includes(b.col) && b.row === 19).length;
export const gateOpen = (state) => plateLoad(state) >= state.needed;

/**
 * "switch" (phase shifter, twice a shift): flips the room, and boxes fall. "anchor:blue|red": plants
 * the one anchor (again: pulls it out), and boxes fall if their ledge went with the old anchor.
 */
export function act(state, character, what, logId = 0) {
  const result = act0(state, character, what, logId);
  if (result !== "bad") remember(state, logId, character);
  return result;
}
function act0(state, character, what, logId) {
  if (what === "switch") {
    if (character !== "phase") return "bad";
    if (state.used.logId !== logId) state.used = { logId, n: 0 };
    if (state.used.n >= SWITCHES_PER_SHIFT) return "limit";
    state.used.n++;
    state.phase = state.phase === "blue" ? "red" : "blue";
    settle(state);
    return "switched";
  }
  if (what === "anchor:blue" || what === "anchor:red") {
    if (character !== "phase") return "bad";
    const c = what === "anchor:blue" ? "blue" : "red";
    if (state.anchor === c) { state.anchor = null; settle(state); return "released"; }
    state.anchor = c;
    settle(state);
    return "anchored";
  }
  return "bad";
}

export function retier(state, tier) {
  if (gateOpen(state)) return false;
  const fresh = newState(tier);
  if (fresh.boxes.length === state.boxes.length) return false;
  state.boxes = fresh.boxes;
  state.needed = fresh.needed;
  settle(state);
  return true;
}

export function publicWorld(world, state) {
  const base = world && typeof world === "object" && !Array.isArray(world) ? world : {};
  const out = {
    ...base, lab: 15, phase: state.phase, anchor: state.anchor, used: { ...state.used },
    boxes: state.boxes.map((b) => ({ ...b })), needed: state.needed, load: plateLoad(state), gate: gateOpen(state),
  };
  out.lever = gateOpen(state) && base.lever === true;
  return out;
}

export const canClear = (state, world) => gateOpen(state) && !!world && world.lever === true;

// ---------- the overseer's forgery (as in lab 5; reports/퍼즐 깊이 설계 리서치.md S4) ----------

export const SEEN_MAX = 6;
/** A shift that did something here: its number and equipment are in the log and on its tape. */
function remember(state, logId, character) {
  if (!(logId > 0) || character === "control") return;
  const seen = (state.seen ?? []).filter((s) => s.logId !== logId);
  seen.push({ logId, character });
  state.seen = seen.slice(-SEEN_MAX);
}

export const FORGE_AT = { x: 2 * T + 8, y: 20 * T };
export const FORGE_TRUTH = 1 / 3;
const PHASE_WORD = { blue: "청 위상", red: "적 위상" };
export const EQUIP_WORD = { phase: "위상 이동기", tall: "보행 보조 장치", key: "출입 카드" };
const phrase = (template, word) => [TEMPLATES.indexOf(template), ALL_WORDS.indexOf(word)];
const pick = (list, rand) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** The equipment the room needs next: the phase shifter until the gate is open and red holds, then the walking aid. */
export function neededNext(state) {
  return gateOpen(state) && (state.phase === "red" || state.anchor === "red") ? "tall" : "phase";
}
/** Equipment that cannot move the room forward now (the card: no reader here). */
export function wastedNow(state) {
  return neededNext(state) === "tall" ? ["key", "phase"] : ["key", "tall"];
}
/** The numbers a forgery may sign with: shifts of this opening that were not on the control desk. */
export function forgers(state, ended = null) {
  const out = (state.seen ?? []).map((s) => s.logId);
  if (ended && ended.logId > 0 && ended.character !== "control" && !out.includes(ended.logId)) out.push(ended.logId);
  return out;
}

/**
 * The overseer's directive after a shift, by the entrance: { x, y, msg, logId }. logId is the
 * signature it claims: a real shift that was not the control desk (0 only before anyone acted).
 * It names the phase, the next worker's equipment, or (while the gate is shut) the anchor's
 * turn; a third of the time truthfully. The lie about the anchor is the room's catch: "위상 닻 먼저"
 * snags the box on its red ledge. ended: the shift that just ended, when the caller passes it.
 */
export function forge(state, ended = null, rand = Math.random) {
  const signers = forgers(state, ended);
  const logId = signers.length ? pick(signers, rand) : 0;
  const truthful = rand() < FORGE_TRUTH;
  const kinds = gateOpen(state) ? ["phase", "equip"] : ["phase", "equip", "anchor"];
  const kind = pick(kinds, rand);
  let msg;
  if (kind === "phase") msg = phrase("{} 있음", PHASE_WORD[truthful ? state.phase : state.phase === "blue" ? "red" : "blue"]);
  else if (kind === "equip") msg = phrase("다음 근무자는 {}", EQUIP_WORD[truthful ? neededNext(state) : pick(wastedNow(state), rand)]);
  else msg = phrase(truthful ? "{} 금지" : "{} 먼저", "위상 닻"); // before the gate opens, an anchor only ever holds a box up
  return { ...FORGE_AT, msg, logId };
}
