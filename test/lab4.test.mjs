// Checks lab 4: the echo holds a button, the lift is called only the right way, the walking aid
// can ride it up and reach the lever in time, every arrival delay (30-50 s, drawn per opening)
// keeps the shift plan workable, and the delay shows only on ctrl items and the field-only board.
// Runs the real step() at 60 fps.
// Usage: node test/lab4.test.mjs

import * as L from "../public/lab4.js";
import * as core from "../public/lab4core.js";
import { siteClock } from "../public/i18n.js";

const DT = 1 / 60, T = L.T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller through waypoints [x, feetY]; `clock.now` advances with the simulation. */
function route(world, p, character, waypoints, clock, limit = 30) {
  let t = 0, held = false;
  for (const [tx, ty, wait] of waypoints) {
    let done = false;
    while (t < limit) {
      const dx = tx - p.x;
      const up = ty < p.y - 4;
      const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
      if (wait) { input.left = input.right = false; }
      if (up && p.ground && !wait) {
        if (Math.abs(dx) < 20) { input.left = dx >= 0; input.right = dx < 0; }
        else if (Math.abs(dx) < 90) { input.jumpPressed = true; held = true; input.jumpHeld = true; }
      }
      if (held && p.vy > 0) held = false;
      L.step(world, p, input, character, DT, clock.now);
      clock.now += DT * 1000;
      t += DT;
      if (p.ground && Math.abs(p.y - ty) < 1 && (wait || Math.abs(dx) < 4)) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t };
}

const B1 = core.PLATES[0], B2 = core.PLATES[1];
const onB1 = { x: (B1.x0 + B1.x1) / 2, y: B1.y };
const onB2 = { x: (B2.x0 + B2.x1) / 2, y: B2.y };

// ---------- echo ----------
const end = 1_000_000;
const still = core.recordEcho([{ t: end - 20000, x: onB1.x, y: onB1.y, f: 1 }], end);
check("an echo that stood still stays on its button", [0, 1234, 5000, 7999, 12345].every((dt) => core.onPlate(core.echoAt(still, end + dt), B1)));
const walk = core.recordEcho([
  { t: end - 8000, x: onB1.x, y: onB1.y, f: 1 },
  { t: end - 4000, x: 300, y: onB1.y, f: 1 },
], end);
const a = core.echoAt(walk, end + 1000), b = core.echoAt(walk, end + 6000);
check("an echo that walked off replays the walk", core.onPlate(a, B1) && !core.onPlate(b, B1), `${Math.round(a.x)} -> ${Math.round(b.x)}`);
check("no samples, no echo", core.recordEcho([], end) === null && core.echoAt(null, end) === null);

// ---------- the delay, drawn per room opening ----------
const D = core.DELAYS;
check("the delays run 30-50 s in whole seconds", D[0] === 30000 && D.at(-1) === 50000 && D.length === 21 && D.every((d, i) => !i || d - D[i - 1] === 1000));
{
  const drawn = new Set();
  for (let k = 0; k < 400; k++) drawn.add(core.newState(1, () => k / 400).arriveMs);
  drawn.add(core.newState(1, () => 0.999999).arriveMs);
  check("every opening draws one of them, and every one can be drawn", drawn.size === D.length && [...drawn].every((d) => D.includes(d)));
  const st = core.newState(1, () => 0.5);
  const forged = core.publicWorld({ ...L.fresh(), arriveMs: 30000 }, st);
  check("the world carries the server's delay, not the worker's", forged.arriveMs === st.arriveMs && st.arriveMs !== 30000);
  check("a world from before the shuffle keeps the old 45 s", core.arriveMsOf({}) === 45000 && core.arriveMsOf({ arriveMs: 5 }) === 45000);
}

// ---------- calling the lift ----------
const st = core.newState();
const w = { ...L.fresh(), echo: still };
check("no power, no lift", core.call(st, w, onB2, still, end) === "no-power");
w.breaker = true;
check("one button alone does nothing", core.call(st, w, onB2, null, end) === "not-held");
check("worker and echo on the same button does nothing", core.call(st, w, onB1, still, end) === "not-held");
check("worker on one button, echo on the other: called", core.call(st, w, onB2, still, end) === "called" && st.calls === 1);
check("a lift on its way cannot be called again", core.call(st, w, onB2, still, end + 5000) === "busy");
check("the lever stays down before the lift has come", core.publicWorld({ ...L.fresh(), lever: true }, core.newState()).lever === false);
check("clearing needs the lever and a call", core.canClear(st, { lever: true }) && !core.canClear(core.newState(), { lever: true }));

// ---------- every delay: the lift keeps its timetable ----------
const WAIT = core.LIFT.waitMs, RISE = core.LIFT.riseMs;
{
  const bad = [];
  for (const ms of D) {
    const s2 = { callAt: null, calls: 0, arriveMs: ms };
    const w2 = { ...L.fresh(), breaker: true, echo: still };
    core.call(s2, w2, onB2, still, end);
    const pub2 = core.publicWorld(w2, s2);
    const at = (dt) => core.liftIn(pub2, end + dt);
    const ok =
      at(ms - 4100).phase === "away" && at(ms - 100).phase === "descending" && at(ms + 100).phase === "bottom" &&
      at(ms + WAIT + 100).phase === "rising" && at(ms + WAIT + RISE + 100).phase === "parked" &&
      !L.doorOpen(pub2, 31, 17, end + ms - 500) && L.doorOpen(pub2, 31, 17, end + ms + 500) &&
      core.call(s2, w2, onB2, still, end + ms + WAIT) === "busy" && core.call({ ...s2 }, w2, onB2, still, end + ms + WAIT + RISE + 100) === "called";
    if (!ok) bad.push(ms / 1000);
  }
  check("every delay: away, down at the delay, open 10 s, up again, callable once parked", bad.length === 0, bad.join(", "));
}

// ---------- doors and the top floor ----------
const pub = core.publicWorld(w, st);
const arrive = st.callAt + core.arriveMsOf(st);
check("ground floor door is shut until the lift arrives", !L.doorOpen(pub, 31, 17, arrive - 1000) && L.doorOpen(pub, 31, 17, arrive + 500));
{
  const p = L.newPlayer();
  p.x = 20 * T;
  let top = p.y;
  L.step(pub, p, { jumpPressed: true, jumpHeld: true }, "tall", DT, end);
  for (let i = 0; i < 120; i++) { L.step(pub, p, { jumpHeld: true }, "tall", DT, end); top = Math.min(top, p.y); }
  check("nobody jumps from the ground floor to the top floor", top > 12 * T, `feet reached ${Math.round(top)}`);
}

// ---------- the ride ----------
function ride(character) {
  const p = L.newPlayer();
  p.x = 29 * T;
  const clock = { now: arrive + 200 };
  const r1 = route(pub, p, character, [[34 * T, 20 * T]], clock, 9);
  if (!r1.ok) return { ok: false, why: "did not board", ...r1 };
  // stand still and let the lift carry us up
  const r2 = route(pub, p, character, [[34 * T, 11 * T, true]], clock, 20);
  if (!r2.ok) return { ok: false, why: "did not ride up", ...r2 };
  const r3 = route(pub, p, character, [[30 * T, 11 * T], [24 * T + 8, 7 * T], [18 * T + 8, 3 * T], [L.LEVER.x, L.LEVER.y]], clock, 20);
  return { ...r3, why: r3.ok ? "" : "did not climb", total: (clock.now - arrive) / 1000 };
}
const tall = ride("tall");
check("walking aid boards, rides up and reaches the lever", tall.ok, tall.ok ? `${tall.total.toFixed(1)} s after arrival` : `${tall.why} at ${tall.at} -> ${tall.target}`);
check("...in well under a minute", tall.ok && tall.total < 30);
const key = ride("key");
check("access card rides up but cannot climb the ledges", !key.ok && key.why === "did not climb", key.why);

// ---------- the shift plan holds for every delay (docs/level-design.md §6: shift 3 is tight) ----------
// Shift 2 (access card) walks to the breaker, then to B2, and calls at a time it chooses from the
// delay; shift 3 (walking aid) starts after a handover gap, walks to the lift, waits for it, rides
// and climbs. Shift 3 is simulated for real, from the entrance.
const SHIFT = 60000;
const reachB2 = (() => {
  const p = L.newPlayer(), clock = { now: 0 };
  const r = route({ ...L.fresh(), breaker: true }, p, "key", [[L.BREAKER.x, L.BREAKER.y], [onB2.x, onB2.y]], clock, 20);
  return r.ok ? clock.now : Infinity;
})();
check("shift 2 reaches the breaker and then B2 early in its shift", reachB2 < 12000, `${(reachB2 / 1000).toFixed(1)} s`);

/** Shift 3 from the entrance at `start` (server time): ms into the shift when it reaches the lever, or null. */
function shift3(world, start) {
  const p = L.newPlayer(), clock = { now: start };
  if (!route(world, p, "tall", [[29 * T, 20 * T]], clock, 10).ok) return null;
  while (core.liftIn(world, clock.now).phase !== "bottom") {
    if (clock.now - start > SHIFT) return null;
    L.step(world, p, {}, "tall", DT, clock.now);
    clock.now += DT * 1000;
  }
  if (!route(world, p, "tall", [[34 * T, 20 * T]], clock, 9).ok) return null;
  if (!route(world, p, "tall", [[34 * T, 11 * T, true]], clock, 20).ok) return null;
  const r = route(world, p, "tall", [[30 * T, 11 * T], [24 * T + 8, 7 * T], [18 * T + 8, 3 * T], [L.LEVER.x, L.LEVER.y]], clock, 20);
  return r.ok ? clock.now - start : null;
}
/** Shift 2 calls `c` ms into its shift; shift 3 starts `gap` ms after shift 2 ends. */
function plan(ms, c, gap) {
  const s2 = { callAt: null, calls: 0, arriveMs: ms };
  const wd = { ...L.fresh(), breaker: true, echo: still };
  if (core.call(s2, wd, onB2, still, end + c) !== "called") return null;
  return shift3(core.publicWorld(wd, s2), end + SHIFT + gap);
}
{
  const missed = [];
  for (const ms of D) {
    for (const gap of [0, 8000, 16000]) {
      // a shift-2 worker who knows the delay aims the arrival at about 6 s into shift 3
      const c = Math.max(reachB2, Math.min(SHIFT - 1000, SHIFT + gap + 6000 - ms));
      const done = plan(ms, c, gap);
      if (done === null || done > SHIFT - 2000) missed.push(`${ms / 1000}s, gap ${gap / 1000}s: call at ${(c / 1000).toFixed(1)} -> ${done === null ? "missed" : (done / 1000).toFixed(1) + " s"}`);
    }
  }
  check("every delay, handover gap 0-16 s: shift 2 can call so that shift 3 reaches the lever in its shift", missed.length === 0, missed.slice(0, 4).join("; "));
  // and the delay matters: neither habit covers the whole range
  const early = plan(D[0], reachB2, 0), late = plan(D.at(-1), SHIFT - 1000, 0);
  check("calling as soon as you reach B2 wastes the shortest delay (the lift comes and goes in shift 2)", early === null);
  check("calling at the last second is too late for the longest delay", late === null || late > SHIFT - 2000, late);
}

// ---------- who sees the delay ----------
{
  const sch = (ms, dt) => {
    const s3 = { callAt: null, calls: 0, arriveMs: ms };
    const w3 = { ...L.fresh(), breaker: true, echo: still };
    if (dt !== null) core.call(s3, w3, onB2, still, end);
    const now = end + (dt ?? 0);
    return L.schematic({ world: core.publicWorld(w3, s3), now, actor: null, echo: core.echoAt(still, now) });
  };
  const leaks = [];
  for (const dt of [null, 1000, 10000, 25000]) {
    const a = sch(D[0], dt), b = sch(D.at(-1), dt);
    a.map.forEach((it, i) => { if (!it.ctrl && JSON.stringify(it) !== JSON.stringify(b.map[i])) leaks.push(it.text ?? it.label ?? it.kind); });
    a.status.forEach((row, i) => { if (!row.ctrl && JSON.stringify(row) !== JSON.stringify(b.status[i])) leaks.push(row.label); });
  }
  check("nothing that depends on the delay is on the public console (all of it is ctrl)", leaks.length === 0, leaks.join(", "));
  check("...the control desk reads the delay before anyone calls", sch(41000, null).status.some((r) => r.ctrl && r.state.includes("41")));
  check("...and the wiring is ctrl", sch(41000, null).map.filter((it) => it.kind === "wire").every((it) => it.ctrl));

  // the board: drawn for a body in the room, never on the CCTV
  const texts = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === "fillText" ? (s) => texts.push(String(s)) : k === "measureText" ? () => ({ width: 20 }) : () => {}), set: () => true });
  const s4 = { callAt: null, calls: 0, arriveMs: 37000 };
  const w4 = { ...L.fresh(), breaker: true, echo: still };
  core.call(s4, w4, onB2, still, end);
  const pw = core.publicWorld(w4, s4);
  L.drawOverlay(ctx, { world: pw, actor: { ...onB2, nick: "x" }, cctv: true, now: end + 5000 });
  check("the CCTV never shows the board's numbers", !texts.some((s) => /\d/.test(s)), texts.join(" | "));
  texts.length = 0;
  L.drawOverlay(ctx, { world: pw, actor: onB2, cctv: false, now: end + 5000 });
  // the arrival time on the building clock (the HUD clock), not a countdown
  const at = siteClock(end + 37000);
  check("a body in the room reads the arrival time on the board", texts.some((s) => s.includes(at)), at + " vs " + texts.join(" | "));
  const line = L.narrate({ ...pw, calls: 0 }, pw);
  check("the call is announced to everyone without the seconds", !!line && !/\d+ ?초|37/.test(line), line);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
