// Server-side rules for room 3-2 "Split code" (갈라진 기호). Keep in step with public/lab13.js.
// The code is split by kind, not by halves (KTANE: rule x state; Outer Wilds: combine clues).
// The high plaque, readable only by the walking aid standing on its ledge, carries an ORDER: all
// six glyphs laid out in a row, a grid or a ring, with a drawn path (start dot, arrows) through
// them. The ultraviolet wall in the dark alcove, only for the light, carries a SET: four glyphs
// scattered with no order. The code is the set, read in the plaque's order. Neither note alone
// fixes even one position. Both are reshuffled when the room opens and on every reset.
// Neither ever leaves the server except to the one worker standing in front of it.

export const GLYPH_COUNT = 6;
export const SET_SIZE = 4; // 5 would leave the plaque alone with only 6 candidates
export const MAX_TRIES = 3; // wrong entries before both surfaces change
export const PER_SHIFT = 2; // wrong entries one shift may make before the terminal locks for it
export const LOCK_MS = 60_000; // fallback when no shift-end arrives: a lock never outlives a shift by much

/** Reading paths per layout: 0 row, 1 grid 3x2, 2 ring of six. The geometry is in public/lab13.js. */
export const PATHS = [2, 8, 12];
/** More staff, more procedure: which plaque layouts this tier draws from. */
export const layoutsFor = (tier = 1): number[] => (tier >= 3 ? [1, 2] : tier === 2 ? [0, 1, 2] : [0, 1]);

export interface Lab13State {
  rule: number[]; // the plaque: [layout, path, ...the six glyphs in reading order]
  set: number[]; // the ultraviolet wall: SET_SIZE different glyphs, ascending (no order)
  tier: number;
  gen: number; // bumps whenever rule and set are replaced
  genAt: number; // when the current ones were issued (ms)
  genWhy: string; // "open" | "reset" | "tier"
  tries: number;
  shiftWrong: number; // wrong entries since the shift began (or since LOCK_MS of quiet)
  wrongAt: number;
  seenHigh: boolean;
  seenUV: boolean;
  door: boolean;
}

function randInt(n: number): number {
  const limit = 256 - (256 % n);
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    if (b < limit) return b % n;
  }
}
function shuffled(xs: number[]): number[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const ALL = Array.from({ length: GLYPH_COUNT }, (_, i) => i);

function issue(state: Lab13State, why: string): void {
  const layouts = layoutsFor(state.tier);
  const layout = layouts[randInt(layouts.length)];
  state.rule = [layout, randInt(PATHS[layout]), ...shuffled(ALL)];
  state.set = shuffled(ALL).slice(0, SET_SIZE).sort((a, b) => a - b);
  state.genAt = Date.now();
  state.genWhy = why;
  state.tries = 0;
  state.seenHigh = state.seenUV = false;
}

export function newState(tier = 1): Lab13State {
  const state = {
    tier: Math.max(1, Math.min(3, tier)), gen: 1, tries: 0, shiftWrong: 0, wrongAt: 0, seenHigh: false, seenUV: false, door: false,
  } as Lab13State;
  issue(state, "open");
  return state;
}

/** A state stored by an older build (two halves) gets a fresh rule and set. */
function fix(state: Lab13State): Lab13State {
  if (!Array.isArray(state.rule) || state.rule.length !== 2 + GLYPH_COUNT || !Array.isArray(state.set)) {
    state.tier ??= 1;
    state.gen = (state.gen ?? 0) + 1;
    state.shiftWrong ??= 0;
    state.wrongAt ??= 0;
    issue(state, "open");
  }
  return state;
}

/** The code: the wall's glyphs in the order the plaque's path visits them. */
export function answer(state: Lab13State): number[] {
  const order = state.rule.slice(2);
  return [...state.set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export const locked = (state: Lab13State, now = Date.now()): boolean =>
  (state.shiftWrong ?? 0) >= PER_SHIFT && now - (state.wrongAt ?? 0) < LOCK_MS;

export type EnterResult = "open" | "wrong" | "reset" | "locked" | "already" | "bad";

/**
 * The card types the code. A wrong entry is a thinking mistake: the second one in a shift locks
 * the terminal until the shift ends; the third overall replaces the plaque and the wall.
 */
export function enter(state: Lab13State, input: unknown, now = Date.now()): EnterResult {
  fix(state);
  if (state.door) return "already";
  if (!Array.isArray(input) || input.length !== SET_SIZE || !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)) return "bad";
  if (state.shiftWrong && now - state.wrongAt >= LOCK_MS) state.shiftWrong = 0;
  if (locked(state, now)) return "locked";
  const want = answer(state);
  if (input.every((g, i) => g === want[i])) {
    state.door = true;
    return "open";
  }
  state.shiftWrong++;
  state.wrongAt = now;
  state.tries++;
  if (state.tries < MAX_TRIES) return "wrong";
  state.gen++;
  issue(state, "reset"); // every note about the old plaque and wall is now a lie
  return "reset";
}

/** A shift ended: the next card worker gets the terminal back. True when the state changed. */
export function shiftEnded(state: Lab13State): boolean {
  if (!state.shiftWrong) return false;
  state.shiftWrong = 0;
  return true;
}

/** What a worker standing at its surface reads: the walking aid the plaque, the light the wall. */
export function read(state: Lab13State, character: string): { gen: number; code: number[]; part: string } | null {
  fix(state);
  if (character === "tall") { state.seenHigh = true; return { gen: state.gen, code: [...state.rule], part: "high" }; }
  if (character === "light") { state.seenUV = true; return { gen: state.gen, code: [...state.set], part: "uv" }; }
  return null;
}

export function retier(state: Lab13State, tier: number): boolean {
  fix(state);
  if (state.door) return false;
  const next = Math.max(1, Math.min(3, tier));
  if (next === state.tier) return false;
  state.tier = next;
  if (!layoutsFor(next).includes(state.rule[0])) {
    state.gen++;
    issue(state, "tier");
  }
  return true;
}

/**
 * Everyone's view: gen / genAt / genWhy say when the plaque and the wall last changed (the tape's
 * event strip and the 「오래됨」 stamp read them); no glyph and no part of the rule.
 */
export function publicWorld(world: unknown, state: Lab13State, now = Date.now()): unknown {
  fix(state);
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {
    ...base, lab: 13, gen: state.gen, genAt: state.genAt, genWhy: state.genWhy, tries: state.tries,
    seenHigh: state.seenHigh, seenUV: state.seenUV, door: state.door, size: SET_SIZE, locked: !state.door && locked(state, now),
  };
  for (const k of ["code", "rule", "set", "high", "uv", "lengths"]) delete out[k];
  out.lever = state.door && base.lever === true;
  return out;
}

export const canClear = (state: Lab13State, world: unknown): boolean => state.door && !!world && (world as Record<string, unknown>).lever === true;

export const id = 13;
export const characters = ["tall", "light", "key"] as const;
