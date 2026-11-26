// Server-side rules for the last lab, "Clocking out" (퇴근). Keep in step with public/lab9.js.
// The old note's glyphs are not a secret: they hang on the wall for anyone who stands in front
// of them. Under each glyph is one of lab 1's stamp marks (①②③, by position: glyph i carries
// mark i % 3). The exit terminal wants the glyphs mark by mark, in the order the overseer stamped
// lab 1's three stations in its practice shift (order), and within a mark in reading order. That
// order lives only in this run's lab 1 record (the archive): the building draws it once per run
// (src/building.ts exitOrder) and both the practice tape and this lab read the same value. It is
// never the plain reading order, and it is never sent to the clients.
// A wrong entry locks the terminal for the rest of that shift (shiftEnded unlocks it; LOCK_MS is
// a fallback so a lock can never outlive a shift by much). Every second wrong entry of the run
// also re-tears the note: new pieces, new glyphs, the same order (so the archive's practice tape
// stays true). Trying the five orders blind means re-reading every piece every two misses; a team
// that read the archive needs one try. The re-tear is public (gen / genAt / genWhy, like lab 3). The server owns the door, the lock and
// the count of wrong tries, and decides when the run ends.

export const GLYPH_COUNT = 6;
/** The orders the overseer may have practised: every order of the three stamps but ①②③. */
export const ORDERS: readonly number[][] = [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
/** A shift is 60 s plus 1.5 s of grace: a lock nobody cleared lapses after that. */
export const LOCK_MS = 61_500;
/** Every this many wrong entries in the run, the note is torn afresh. */
export const RETEAR_EVERY = 2;

export interface Lab9State {
  pieces: number[][]; // the note, torn into pieces
  order: number[]; // the stamp marks in the order the overseer practised them in lab 1
  door: boolean;
  tries: number;
  lockedAt: number | null; // a wrong entry, this shift: the terminal is locked
  last: number[] | null; // the last wrong entry (the control desk's sheet only)
  gen: number; // bumps every time the note is torn afresh
  genAt: number; // when the current pieces went up (ms)
  genWhy: string; // "open" | "reset" (wrong entries piled up)
}

export function tornNote(tier = 1): number[][] {
  const n = Math.max(1, Math.min(3, tier)), per = n === 1 ? 3 : 2;
  const bytes = crypto.getRandomValues(new Uint8Array(n * per * 2));
  const pick = (i: number) => {
    // 252 is the largest multiple of 6 below 256: rejecting above it keeps every glyph equally likely
    for (let j = i; j < bytes.length; j += n * per) if (bytes[j] < 252) return bytes[j] % GLYPH_COUNT;
    return bytes[i] % GLYPH_COUNT;
  };
  return Array.from({ length: n }, (_, a) => Array.from({ length: per }, (_, b) => pick(a * per + b)));
}

/** One of ORDERS, every one equally likely. */
export function randomOrder(): number[] {
  for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 255) return [...ORDERS[b % ORDERS.length]];
  return [...ORDERS[0]];
}

/** The stamp mark under glyph i of the whole note (pieces in order, left to right). */
export const markOf = (i: number): number => i % 3;

/** What the exit terminal wants: the glyphs mark by mark in the practised order, each mark in reading order. */
export function exitCode(pieces: number[][], order: readonly number[]): number[] {
  const flat = pieces.flat();
  return order.flatMap((m) => flat.filter((_, i) => markOf(i) === m));
}

export function newState(tier = 1): Lab9State {
  return { pieces: tornNote(tier), order: randomOrder(), door: false, tries: 0, lockedAt: null, last: null, gen: 1, genAt: Date.now(), genWhy: "open" };
}

/** New pieces in the same places, with glyphs that are not the old ones; the order stays. */
export function retear(state: Lab9State, now = Date.now()): void {
  const old = JSON.stringify(state.pieces);
  for (let k = 0; k < 10 && JSON.stringify(state.pieces) === old; k++) state.pieces = tornNote(state.pieces.length);
  state.gen = (state.gen ?? 1) + 1;
  state.genAt = now;
  state.genWhy = "reset";
}

export function isLocked(state: Lab9State, now = Date.now()): boolean {
  return !state.door && state.lockedAt != null && now - state.lockedAt < LOCK_MS;
}

export type EnterResult = "open" | "wrong" | "reset" | "locked" | "already" | "bad";

/** One try per shift: a wrong entry locks the terminal until the shift ends; every second one re-tears the note ("reset"). */
export function enter(state: Lab9State, input: unknown, now = Date.now()): EnterResult {
  if (state.door) return "already";
  const want = exitCode(state.pieces, state.order ?? [0, 1, 2]);
  if (!Array.isArray(input) || input.length !== want.length || !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)) {
    return "bad";
  }
  if (isLocked(state, now)) return "locked";
  if (input.every((g, i) => g === want[i])) {
    state.door = true;
    state.lockedAt = null;
    return "open";
  }
  state.tries++;
  state.lockedAt = now;
  state.last = [...input];
  if (state.tries % RETEAR_EVERY === 0) {
    retear(state, now);
    return "reset";
  }
  return "wrong";
}

/** The shift is over: the next worker gets the terminal back. True when the state changed. */
export function shiftEnded(state: Lab9State): boolean {
  if (state.lockedAt == null) return false;
  state.lockedAt = null;
  return true;
}

/** Everything but the order: that stays in lab 1's record. */
export function publicWorld(world: unknown, state: Lab9State): unknown {
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {
    ...base, lab: 9, pieces: state.pieces, door: state.door, tries: state.tries,
    locked: isLocked(state), lockedAt: state.lockedAt ?? null, last: state.last ?? null,
    gen: state.gen ?? 1, genAt: state.genAt ?? 0, genWhy: state.genWhy ?? "open",
  };
  delete out.order;
  out.out = state.door && base.out === true; // nobody leaves through a shut door
  return out;
}

export function canClear(state: Lab9State, world: unknown): boolean {
  return state.door && !!world && (world as Record<string, unknown>).out === true;
}

export const id = 9;
export const characters = ["key", "tall", "light", "echo"] as const;
