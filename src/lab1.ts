// Server-side rules for lab 1 "Joining" (입사). Keep in step with public/lab1.js.
// The server owns which stamps are in (and in what order), the card door and the approval
// order; a worker's checkpoint cannot stamp anything or pull the lever early.
// The approval order is drawn every time the room opens, never the plain ①②③ and never this
// run's exit order (avoidOrder: the practice tape below must stay the only place that order
// lives). Tier 1 posts it on the board by the entrance, legible only to a body standing in front
// of it (public/lab1.js readsBoard: not the CCTV, not the public sheet); tiers 2-3 post it only on
// the control desk's sheet (blind; ctrl). Without anyone reading it the field still finds it the
// expensive way: a stamp out of turn is refused and its station lamp turns red for everyone
// (refused), until the right stamp goes in.

export const STAMP_COUNT = 3;
const STAMP_OF: Record<string, number> = { key: 0, tall: 1, light: 2 };

export interface Lab1State {
  seq: number[]; // stamps made, in the order they were made
  door: boolean; // the card door: once open, it stays open
  order: number[] | null; // the order the stamps must go in (null only in states saved before 11-16)
  blind: boolean; // tier 2+: the order is posted only on the control blueprint (tier 1: the board, up close)
  refused: number[]; // stamps refused out of turn since the last one went in (public: a red lamp)
  avoid?: number[] | null; // this run's exit order: never lab 1's own (server only, never published)
}

/** Every order of the three stamps. */
export const PERMS: readonly (readonly number[])[] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const same = (a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean =>
  !!a && !!b && a.length === b.length && a.every((v, k) => v === b[k]);

/** A uniform pick below n from crypto bytes (rejecting the uneven tail). */
function randomBelow(n: number): number {
  const limit = 256 - (256 % n);
  for (;;) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < limit) return b % n;
}

/**
 * An approval order that starts with the stamps already made (seq). It is never the plain ①②③
 * and never `avoid` (the run's exit order), unless the stamps already made leave no other choice.
 */
export function pickOrder(seq: readonly number[] = [], avoid: readonly number[] | null = null): number[] {
  const fits = PERMS.filter((o) => seq.every((v, k) => o[k] === v));
  const good = fits.filter((o) => !same(o, PERMS[0]) && !same(o, avoid));
  const from = good.length ? good : fits;
  return [...from[randomBelow(from.length)]];
}

/** A fresh opening: the order is drawn every time; tiers 2-3 post it only on the control desk's sheet. */
export function newState(tier = 1, avoid: readonly number[] | null = null): Lab1State {
  return { seq: [], door: false, order: pickOrder([], avoid), blind: tier >= 2, refused: [], avoid: avoid ? [...avoid] : null };
}

/**
 * Called when the room opens with this run's exit order (building.ts enterLab): lab 1's own order
 * must not be it, or the room itself would hand out the archive key (S5).
 */
export function avoidOrder(state: Lab1State, avoid: readonly number[] | null): void {
  state.avoid = avoid ? [...avoid] : null;
  if (same(state.order, avoid)) state.order = pickOrder(state.seq, avoid);
}

export type ActResult = "open" | "stamped" | "already" | "order" | "bad";

export function act(state: Lab1State, character: string, what: unknown): ActResult {
  if (what === "door") {
    if (character !== "key") return "bad";
    if (state.door) return "already";
    state.door = true;
    return "open";
  }
  if (what === "stamp") {
    const i = STAMP_OF[character];
    if (i === undefined) return "bad";
    if (state.seq.includes(i)) return "already";
    if (state.order && state.order[state.seq.length] !== i) {
      state.refused = [...(state.refused ?? []).filter((k) => k !== i), i];
      return "order";
    }
    state.seq.push(i);
    state.refused = [];
    return "stamped";
  }
  return "bad";
}

/** The admin's procedure valve: a new order that keeps the stamps already made at its head. */
export function retier(state: Lab1State, tier: number): boolean {
  state.blind = tier >= 2;
  state.refused = [];
  state.order = pickOrder(state.seq, state.avoid ?? null);
  return true;
}

export function publicWorld(world: unknown, state: Lab1State): unknown {
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base, lab: 1, seq: [...state.seq], door: state.door, order: state.order, blind: state.blind, refused: [...(state.refused ?? [])] };
  out.lever = state.seq.length >= STAMP_COUNT && base.lever === true; // locked until all three are in
  return out;
}

export function canClear(state: Lab1State, world: unknown): boolean {
  return state.seq.length >= STAMP_COUNT && !!world && (world as Record<string, unknown>).lever === true;
}

export const id = 1;
export const characters = ["key", "tall", "light"] as const;

// ---------- the overseer's practice shift (reports/퍼즐 깊이 설계 리서치.md S5) ----------
// When this run's lab 1 is filed, the overseer adds one shift of its own to the record: no
// number (log id 0), no body (it flies, like the drone it is). It stamps the three stations in
// the order the exit terminal of 「퇴근」 will want the note's marks (src/lab9.ts exitCode), then
// goes and stands in front of the old note until its 60 seconds are up. The record is the only
// place that order exists; the archive's replay shows the stamps going in one by one, with the
// order on the sheet (archive replays are cleared: clearance).

const T = 16;
const PRACTICE_SPAWN: [number, number] = [2 * T + 8, 20 * T];
/** Where the drone hovers for each station (public/lab1.js STAMPS), and where it ends up: the old note. */
const PRACTICE_AT: [number, number][] = [[36 * T + 8, 20 * T], [5 * T + 8, 8 * T], [26 * T + 8, 5 * T]];
const PRACTICE_NOTE: [number, number] = [21 * T + 8, 20 * T];

export interface PracticeTape {
  logId: 0;
  nick: string;
  character: "control";
  lab: 1;
  startedAt: number;
  ms: number;
  frames: [number, number, number, number][];
  worlds: [number, unknown][];
}

/** The practice shift as a tape (times in tenths of a second, like every tape). order: stamp indices 0-2. */
export function practiceTape(order: readonly number[], startedAt: number): PracticeTape {
  // legs: fly 3 s to each station, hover 5 s (the stamp goes in 2 s after arriving), then to the note
  const legs: { to: [number, number]; at: number; stay: number }[] = [];
  let t = 10; // a second at the entrance first
  for (const i of order) {
    legs.push({ to: PRACTICE_AT[i], at: t + 30, stay: 50 });
    t += 80;
  }
  legs.push({ to: PRACTICE_NOTE, at: t + 30, stay: 600 });
  const where = (time: number): [number, number, number] => {
    let from = PRACTICE_SPAWN, start = 10;
    for (const leg of legs) {
      if (time < leg.at) {
        const k = Math.max(0, Math.min(1, (time - start) / (leg.at - start)));
        return [from[0] + (leg.to[0] - from[0]) * k, from[1] + (leg.to[1] - from[1]) * k, leg.to[0] >= from[0] ? 1 : -1];
      }
      if (time < leg.at + leg.stay) return [leg.to[0], leg.to[1], 1];
      from = leg.to;
      start = leg.at + leg.stay;
    }
    return [PRACTICE_NOTE[0], PRACTICE_NOTE[1], 1];
  };
  const frames: PracticeTape["frames"] = [];
  for (let time = 0; time <= 600; time += 2) {
    const [x, y, face] = where(time);
    frames.push([time, Math.round(x), Math.round(y), face]);
  }
  const world = (seq: number[]) => ({
    lab: 1, seq, door: seq.includes(0), lever: false, order: [...order], blind: false, refused: [], practice: true,
  });
  const worlds: [number, unknown][] = [[0, world([])]];
  legs.slice(0, order.length).forEach((leg, k) => worlds.push([leg.at + 20, world(order.slice(0, k + 1) as number[])]));
  return { logId: 0, nick: "감독관", character: "control", lab: 1, startedAt, ms: 60_000, frames, worlds };
}
