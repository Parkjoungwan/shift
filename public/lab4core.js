// Lab 4 "Elevator": rules shared by the browser and the server (src/lab4.ts imports this file).
// Everything here is a pure function of the world and the server clock, so every client
// sees the same lift and the same echo, and the server can check what a client claims.
// The lift's arrival delay is drawn per room opening (newState) and travels in the world.

const T = 16; // keep in step with engine.js

// ---------- the echo: the last 8 seconds of an echo-recorder shift, replayed in a loop ----------

export const ECHO_MS = 8000;
export const ECHO_STEP = 100; // one frame every 100 ms
export const ECHO_FRAMES = ECHO_MS / ECHO_STEP;

/**
 * Turns timed position samples [{t, x, y, f}] into an echo ending at `end`.
 * Between samples the worker stood still, so each frame takes the latest sample at or before it.
 */
export function recordEcho(samples, end) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const frames = [];
  let i = 0;
  for (let k = 0; k < ECHO_FRAMES; k++) {
    const t = end - ECHO_MS + (k + 1) * ECHO_STEP;
    while (i + 1 < sorted.length && sorted[i + 1].t <= t) i++;
    const s = sorted[i];
    frames.push([Math.round(s.x), Math.round(s.y), s.f < 0 ? -1 : 1]);
  }
  return { at: end, frames };
}

/** Checks echo frames sent by a client: exactly ECHO_FRAMES [x, y, face] inside the room. Returns clean frames or null. */
export function cleanFrames(frames) {
  if (!Array.isArray(frames) || frames.length !== ECHO_FRAMES) return null;
  const out = [];
  for (const f of frames) {
    if (!Array.isArray(f) || f.length !== 3) return null;
    const x = Number(f[0]), y = Number(f[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 640 || y < -64 || y > 400) return null;
    out.push([Math.round(x), Math.round(y), f[2] === -1 ? -1 : 1]);
  }
  return out;
}

/** Where the echo is at server time `now`, or null when there is none. */
export function echoAt(echo, now) {
  if (!echo || !Array.isArray(echo.frames) || echo.frames.length !== ECHO_FRAMES) return null;
  const phase = (((now - echo.at) % ECHO_MS) + ECHO_MS) % ECHO_MS;
  const k = phase / ECHO_STEP;
  const i = Math.floor(k), j = (i + 1) % ECHO_FRAMES;
  const a = echo.frames[i], b = echo.frames[j];
  const u = j === 0 ? 0 : k - i; // no sliding across the loop seam
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, face: a[2], character: "echo" };
}

// ---------- the lift ----------

export const LIFT = {
  x0: 32 * T, x1: 36 * T,
  top: 11 * T, bottom: 20 * T, away: -3 * T,
  leaveMs: 3000, // parked at the top, it rises out of sight
  arriveMs: 45000, // from the call to the moment it reaches the bottom (only for worlds older than the shuffle)
  descendMs: 4000, // the last part of the trip, visible in the shaft
  waitMs: 10000, // doors open at the bottom
  riseMs: 3000, // back up to the top floor
};

/**
 * The arrival delay is drawn once per room opening (server-authoritative), in whole seconds.
 * The countdown is on the ground-floor board (a body has to stand there to read it) and on the
 * control desk; nobody else sees it. 30-50 s keeps shift 3 workable (docs/level-design.md §6):
 * test/lab4.test.mjs proves a call time in shift 2 exists for every value.
 */
export const DELAY_MIN = 30000;
export const DELAY_MAX = 50000;
export const DELAY_STEP = 1000;
export const DELAYS = Array.from({ length: (DELAY_MAX - DELAY_MIN) / DELAY_STEP + 1 }, (_, i) => DELAY_MIN + i * DELAY_STEP);

/** This opening's delay from a world or a state (worlds from before the shuffle keep the old 45 s). */
export function arriveMsOf(src) {
  const ms = Number(src?.arriveMs);
  return Number.isFinite(ms) && ms >= DELAY_MIN && ms <= DELAY_MAX ? ms : LIFT.arriveMs;
}

const lerp = (a, b, u) => a + (b - a) * Math.min(1, Math.max(0, u));

/**
 * The lift at server time `now`, given when it was last called (or null) and this opening's delay.
 * phase: parked | leaving | away | descending | bottom | rising
 */
export function lift(callAt, now, arriveMs = LIFT.arriveMs) {
  const L = LIFT, A = arriveMs;
  if (callAt == null) return { y: L.top, phase: "parked", arriveIn: null };
  const t = now - callAt;
  const arriveIn = A - t;
  if (t < 0) return { y: L.top, phase: "parked", arriveIn: null };
  if (t < L.leaveMs) return { y: lerp(L.top, L.away, t / L.leaveMs), phase: "leaving", arriveIn };
  if (t < A - L.descendMs) return { y: L.away, phase: "away", arriveIn };
  if (t < A) return { y: lerp(L.away, L.bottom, (t - (A - L.descendMs)) / L.descendMs), phase: "descending", arriveIn };
  if (t < A + L.waitMs) return { y: L.bottom, phase: "bottom", arriveIn: 0, leavesIn: A + L.waitMs - t };
  if (t < A + L.waitMs + L.riseMs) return { y: lerp(L.bottom, L.top, (t - A - L.waitMs) / L.riseMs), phase: "rising", arriveIn: null };
  return { y: L.top, phase: "parked", arriveIn: null };
}

/** The lift in a world as the clients have it (callAt and this opening's delay are both in it). */
export const liftIn = (world, now) => lift(world?.callAt ?? null, now, arriveMsOf(world));

// ---------- the two-person safety buttons ----------

export const PLATES = [
  { x0: 2 * T, x1: 4 * T, y: 20 * T },
  { x0: 26 * T, x1: 28 * T, y: 20 * T },
];

export function onPlate(pos, plate) {
  return !!pos && pos.x + 5 > plate.x0 && pos.x - 5 < plate.x1 && Math.abs(pos.y - plate.y) < 2;
}

/** Which plates are held right now by the worker or the echo. */
export function platesHeld(worker, echo) {
  return PLATES.map((pl) => onPlate(worker, pl) || onPlate(echo, pl));
}

/** True if the echo stands on the plate at any moment between `from` and `to` (server time). */
export function echoOnPlateBetween(echo, plate, from, to) {
  for (let t = from; t <= to; t += 50) if (onPlate(echoAt(echo, t), plate)) return true;
  return false;
}

// ---------- server rules (also used by the offline stand-in) ----------

/** A fresh room: no call yet, and this opening's arrival delay. rand: for tests. */
export function newState(_tier = 1, rand = Math.random) {
  const i = Math.min(DELAYS.length - 1, Math.floor(rand() * DELAYS.length));
  return { callAt: null, calls: 0, arriveMs: DELAYS[i] };
}

/** The world everyone sees: the worker's world with the lift taken from the server. */
export function publicWorld(world, state) {
  if (!world || typeof world !== "object" || Array.isArray(world)) return null;
  const out = { ...world, lab: 4, callAt: state.callAt, calls: state.calls, arriveMs: arriveMsOf(state) };
  out.breaker = out.breaker === true;
  // The lever is on the top floor: nobody gets there before the lift has been called once.
  if (!state.calls) out.lever = false;
  else out.lever = out.lever === true;
  return out;
}

export function canClear(state, world) {
  return !!world && world.lever === true && state.calls > 0;
}

/**
 * Calls the lift if the rules allow it. worker: the worker's position as the server last heard it.
 * Mutates state and returns what happened.
 */
export function call(state, world, worker, echo, now) {
  if (!world || world.breaker !== true) return "no-power";
  if (lift(state.callAt, now, arriveMsOf(state)).phase !== "parked") return "busy";
  // One plate under the worker, the other under the echo some time in the last moment
  // (the echo the client saw may be a little ahead of or behind the server's clock).
  const ok = PLATES.some((pl, i) => onPlate(worker, pl) && echoOnPlateBetween(echo, PLATES[1 - i], now - 800, now + 300));
  if (!ok) return "not-held";
  state.callAt = now;
  state.calls++;
  return "called";
}
