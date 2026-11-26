// Lab 6 "Night shift" (야간 교대) and room 6-2 "Scheduled maintenance" (정기 점검): rules shared by
// the browser and the server (src/lab6.ts and src/lab16.ts import this file).
//
// A row of drop grates spans a shock trench. A grate a worker steps on drops FALL_MS later and
// stays down: crossing uses the bridge up. Some grates are cracked (defective stock): they drop
// at once, so the worker lands on the shock floor (an accident). Only the light's ultraviolet beam
// and the control desk's blueprint show which grates are cracked.
//   Room 6: the card re-hangs the grates at a winch. The far winch (after crossing) hangs fresh
//   stock, a new cracked set, and prints an inspection slip with it for whoever ran it; the
//   entrance winch is the emergency one: it hangs the same grates back, cracks and all, no slip.
//   Opening door D lets the whole bridge down (a safety interlock), so the far winch is needed.
//   Room 16: there is no winch. The building re-hangs the grates on its own clock, at every
//   minute's :00 (the HUD clock, UTC), and the cracked set moves along the row by a fixed step
//   (this opening's, 1-9) each time, wrapping round. Whoever knows the set at one minute and the
//   step knows it at any minute. Opening door D lets the bridge down until the next :00.
// Pure functions of the world and the server clock; no DOM, no text.

const T = 16; // keep in step with engine.js

export const N = 10; // grates in the row
export const GRATE_W = 2; // tiles per grate
export const ROW = 20; // the grates' tile row (the shock floor is the row below)
export const FALL_MS = 1200; // a sound grate shakes this long after it is first stepped on, then drops
export const MINUTE = 60000;
/** First tile column of the grate row, per room. */
export const X0 = { 6: 10, 16: 8 };

export const crackCount = (tier = 1) => 1 + Math.max(1, Math.min(3, tier)); // 2, 3 or 4

/** Which grate a tile column belongs to in this room, or -1. */
export function grateAt(room, tx) {
  const i = Math.floor((tx - X0[room]) / GRATE_W);
  return tx >= X0[room] && i < N ? i : -1;
}
/** A grate's extent in world pixels. */
export function grateSpan(room, i) {
  const x0 = (X0[room] + i * GRATE_W) * T;
  return { x0, x1: x0 + GRATE_W * T, y: ROW * T };
}

// ---------- which grates are cracked ----------

const minuteOf = (now) => Math.floor(now / MINUTE);

/** Room 16's step: 1-3 grates a minute, either way along the row. */
export function dealStep(rand = Math.random) {
  return (1 + Math.floor(rand() * 3)) * (rand() < 0.5 ? -1 : 1);
}

/** The cracked set rotated by `by` places (room 16). */
export function rotate(set, by) {
  const k = ((by % N) + N) % N;
  return set.map((i) => (i + k) % N).sort((a, b) => a - b);
}

/** Cracked grates in this world right now (indices 0-9). */
export function crackedNow(world, now) {
  if (!world) return [];
  if (world.lab === 16) return rotate(world.base ?? [], (world.step ?? 0) * minuteOf(now));
  return [...(world.cracked ?? [])];
}

/** Three cracked grates in a row would be a 6-tile gap: the walking aid only. Never deal one. */
function hasRun3(set, cyclic) {
  const s = new Set(set);
  for (let i = 0; i < N; i++) {
    const a = i, b = i + 1, c = i + 2;
    if (!cyclic && c >= N) break;
    if (s.has(a % N) && s.has(b % N) && s.has(c % N)) return true;
  }
  return false;
}
/** Some rotation other than none maps the set onto itself: the step could not be read off it. */
function symmetric(set) {
  const key = set.join();
  for (let k = 1; k < N; k++) if (rotate(set, k).join() === key) return true;
  return false;
}

/** A fresh cracked set. Room 16 also wants it readable under any rotation. */
export function dealCracks(tier = 1, rand = Math.random, cyclic = false) {
  for (;;) {
    const pool = [...Array(N).keys()];
    const set = [];
    for (let k = 0; k < crackCount(tier); k++) set.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    set.sort((a, b) => a - b);
    if (hasRun3(set, cyclic)) continue;
    if (cyclic && symmetric(set)) continue;
    return set;
  }
}

// ---------- falls ----------

/** A fall time still counts: room 6 until the next re-hang (gen), room 16 until the next :00. */
export function fallCounts(world, at, now) {
  if (at == null || !Number.isFinite(at)) return false;
  if (world.lab === 16) return minuteOf(at) === minuteOf(now);
  return (world.fallGen ?? 0) === (world.gen ?? 0);
}

/** True while grate i is down. `extra` (optional): fall times this client has seen but the world may not carry yet. */
export function isDown(world, i, now, extra = null) {
  let at = fallCounts(world, world.fall?.[i], now) ? world.fall[i] : null;
  const mine = extra?.[i];
  if (fallCounts(world, mine, now) && (at == null || mine < at)) at = mine;
  if (at == null) return false;
  const cracked = crackedAt(world, i, at);
  return now >= at + (cracked ? 0 : FALL_MS);
}
/** Whether grate i was cracked at the moment it was stepped on. */
export function crackedAt(world, i, at) {
  return crackedNow(world, at).includes(i);
}

/** Grates that are standing right now (for the blueprint and the renderer). */
export function standing(world, now, extra = null) {
  return Array.from({ length: N }, (_, i) => !isDown(world, i, now, extra));
}

/** Door D's safety interlock: every grate still up is let down (fall times set to already past). */
function interlock(state, now) {
  state.drop = { gen: state.gen ?? 0, at: now - FALL_MS };
}
/** Applies the interlock's drop to a world's fall times, if it belongs to these grates. */
function dropped(fall, state, gen) {
  const d = state.drop;
  if (!d || (gen !== undefined && d.gen !== gen)) return fall;
  return fall.map((v) => (v == null ? d.at : Math.min(v, d.at)));
}

/** Clean fall times sent by a client: N entries, each a time or null. */
export function cleanFall(fall) {
  return Array.from({ length: N }, (_, i) => {
    const v = Array.isArray(fall) ? Number(fall[i]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  });
}

// ---------- server rules (also the offline stand-in) ----------

/**
 * Room 6. state: { gen, cracked, door, tier }.
 *   act "door": the card at door D's panel (far side) -> "open"
 *   act "fix": the card at the far winch -> "fixed:3,8" (the slip: 1-based numbers of the new cracked grates)
 *   act "patch": the card at the entrance winch -> "patched" (no slip)
 */
export const rules6 = {
  newState(tier = 1, rand = Math.random) {
    return { gen: 0, cracked: dealCracks(tier, rand), door: false, tier: Math.max(1, Math.min(3, tier)) };
  },
  act(state, character, what, _logId, rand = Math.random, now = Date.now()) {
    if (character !== "key") return "bad";
    if (what === "door") {
      if (state.door) return "already";
      state.door = true;
      interlock(state, now); // the bridge comes down when door D opens
      return "open";
    }
    if (what === "fix") {
      // fresh stock: a new cracked set, and the slip with it ("fixed:<re-hang no.>:<grates, 1-based>")
      state.gen = (state.gen ?? 0) + 1;
      state.cracked = dealCracks(state.tier ?? 1, rand);
      return "fixed:" + state.gen + ":" + state.cracked.map((i) => i + 1).join(",");
    }
    if (what === "patch") {
      // the emergency winch hangs the same grates back where they were: same cracks, no slip
      state.gen = (state.gen ?? 0) + 1;
      return "patched";
    }
    return "bad";
  },
  retier(state, tier) {
    if (state.gen || state.door) return false; // someone already worked with this set
    state.tier = Math.max(1, Math.min(3, tier));
    state.cracked = dealCracks(state.tier);
    return true;
  },
  publicWorld(world, state) {
    const base = world && typeof world === "object" && !Array.isArray(world) ? world : {};
    const gen = state.gen ?? 0;
    const same = base.fallGen === gen;
    const out = { ...base, lab: 6, gen, cracked: [...state.cracked], door: !!state.door, fallGen: gen, fall: dropped(same ? cleanFall(base.fall) : cleanFall(null), state, gen) };
    out.lever = !!state.door && base.lever === true; // the lever is behind door D
    return out;
  },
  canClear(state, world) {
    return !!state.door && !!world && world.lever === true;
  },
};

/**
 * Room 16. state: { base, step, door, tier }. base is the cracked set at minute 0 of the server
 * clock (epoch); at minute m it is base rotated by step * m.
 *   act "door": the card at door D's panel -> "open"
 */
export const rules16 = {
  newState(tier = 1, rand = Math.random) {
    return { base: dealCracks(tier, rand, true), step: dealStep(rand), door: false, tier: Math.max(1, Math.min(3, tier)) };
  },
  act(state, character, what, _logId, _rand, now = Date.now()) {
    if (character !== "key" || what !== "door") return "bad";
    if (state.door) return "already";
    state.door = true;
    interlock(state, now); // the bridge comes down when door D opens, until the next :00
    return "open";
  },
  retier(state, tier) {
    if (state.door) return false;
    state.tier = Math.max(1, Math.min(3, tier));
    state.base = dealCracks(state.tier, Math.random, true);
    return true;
  },
  publicWorld(world, state) {
    const base = world && typeof world === "object" && !Array.isArray(world) ? world : {};
    const out = { ...base, lab: 16, base: [...state.base], step: state.step, door: !!state.door, fall: dropped(cleanFall(base.fall), state) };
    out.lever = !!state.door && base.lever === true;
    return out;
  },
  canClear(state, world) {
    return !!state.door && !!world && world.lever === true;
  },
};
