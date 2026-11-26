// Checks lab 2 "Boxes": the walking aid fetches boxes and sets the full ones on the plate, the gate
// answers to the plate's weight (a worker standing on it only opens it for themselves), the crane
// drops its box where the card chooses (the light's sensor cannot choose), and the lever is
// reachable only from a box. The crane is wired straight here (it teaches; 2-2 breaks the habit),
// but every wiring would be solvable, and the wiring is ctrl-only on the control sheet.
// The catch: the boxes only look alike. Each opening some are empty; an empty box on the plate
// weighs nothing and seals the plate for the rest of the shift. Every opening (every tier, every
// choice of full boxes) clears by a walking aid that feels the weight when it lifts; a guesser
// loses at most a shift per empty box and is never locked; which boxes are full is ctrl-only on
// the control sheet and nowhere on the wall, the public sheet or the hints. Room 2-2 shares the
// rules and must not weigh anything.
// Runs the real step() at 60 fps with the shared rules.
// Usage: node test/lab2.test.mjs (node --experimental-strip-types also checks src/lab2.ts)

import * as L from "../public/lab2.js";
import * as core from "../public/lab2core.js";
import * as E from "../public/engine.js";

const DT = 1 / 60, T = L.T, FLOOR = 20 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller through waypoints [x, feetY]; jumps when the target is above. Stops on a trap. */
function route(getWorld, p, character, waypoints, clock, limit = 30) {
  let held = false;
  const t0 = clock.t;
  for (const [tx, ty] of waypoints) {
    let done = false;
    while (clock.t - t0 < limit) {
      const dx = tx - p.x, up = ty < p.y - 4;
      const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
      if (up && p.ground) {
        if (Math.abs(dx) < 20) { input.left = dx >= 0; input.right = dx < 0; }
        else if (Math.abs(dx) < 90) { input.jumpPressed = true; held = true; input.jumpHeld = true; }
      }
      if (held && p.vy > 0) held = false;
      // wait out the press: never walk into it while it is down or about to come down
      const press = L.traps[0], s = L.trapState(press, clock.t * 1000 + 300);
      const ahead = p.x + Math.sign(dx) * 14;
      if ((s.active || s.warn || L.trapState(press, clock.t * 1000).active) && ahead > press.x0 - 6 && ahead < press.x1 + 6 && !(p.x > press.x0 - 6 && p.x < press.x1 + 6)) input.left = input.right = false;
      L.step(getWorld(), p, input, character, DT, clock.t * 1000);
      clock.t += DT;
      const trap = L.trapHit(L, p, clock.t * 1000);
      if (trap) return { ok: false, trap, t: clock.t - t0, at: [Math.round(p.x), Math.round(p.y)] };
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t: clock.t - t0, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t: clock.t - t0 };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : r.trap ? `${r.trap.kind} at ${r.at}` : `stuck at ${r.at} going to ${r.target}`);
const W = (state, extra = {}) => ({ ...core.publicWorld({ lab: 2 }, state), ...extra });

/** Presses E as this worker: does what use() would ask the server, applied to the shared rules. */
function press(state, p, character) {
  let asked = null;
  L.use({ world: W(state), p, character, say: () => {}, act: (what) => { asked = what; }, pullLever: () => { asked = "lever"; } });
  return asked === null ? null : asked === "lever" ? "lever" : core.act(state, character, asked);
}

/** How high a standing jump, held, lifts this equipment's feet (px), in an open room. */
function jumpHeight(character) {
  const room = { tileAt: E.makeGrid([[1, 1, 38, 19, 0]]), solidAt: (w, tx, ty) => room.tileAt(tx, ty) === E.TILE.SOLID, doorOpen: () => false };
  const p = { ...L.newPlayer(), x: 100, y: FLOOR };
  let top = FLOOR;
  for (let f = 0; f < 90; f++) {
    E.step(room, {}, p, { left: false, right: false, jumpPressed: f === 0, jumpHeld: true }, character, DT, 0);
    top = Math.min(top, p.y);
  }
  return FLOOR - top;
}

/** Every way to choose k of n (index lists). */
const choose = (n, k, from = 0) => (k === 0 ? [[]] : from >= n ? [] : [...choose(n, k - 1, from + 1).map((c) => [from, ...c]), ...choose(n, k, from + 1)]);
/** A fresh opening at this tier with exactly these stored boxes full (the crane's box is always full). */
function opening(tier, full) {
  const st = core.newState(tier);
  st.weights = st.boxes.map((_, i) => (i === st.crane || full.includes(i) ? 1 : 0));
  return st;
}
/** Every opening each tier can deal: [tier, full indices]. */
const OPENINGS = [1, 2, 3].flatMap((tier) => {
  const st = core.newState(tier);
  return choose(st.boxes.length - 1, st.needed).map((full) => [tier, full]);
});

/** Where the walking aid stands (and faces) to lift stored box i: shelf boxes from the shelf, the gate box from the floor. */
function liftFrom(st, i) {
  const b = st.boxes[i];
  return b.row === 15 ? { way: [[7 * T + 8, 16 * T], [(b.col + 1) * T, 16 * T]], face: -1 } : { way: [[(b.col + 1) * T, FLOOR]], face: -1 };
}
/** The plate spots in order (col 9, col 10, then on top of col 9): where to stand, facing right. */
const PLATE_STAND = [8 * T + 8, 9 * T + 8, 8 * T + 8];

/**
 * The walking aid's shift by the field's means only: lift each stored box, nearest first, and go by
 * what the hands say (the carry hint, and the overseer's line to the carrier): a light one goes
 * back where it was, a heavy one onto the plate.
 */
function feelShift(st, clock) {
  const p = L.newPlayer(), log = [];
  let placed = 0;
  for (let i = 0; i < st.boxes.length - 1 && placed < st.needed; i++) {
    const { way, face } = liftFrom(st, i);
    const r = route(() => W(st), p, "tall", way, clock);
    p.face = face;
    let asked = null;
    L.use({ world: W(st), p, character: "tall", say: () => {}, act: (w) => { asked = w; }, pullLever: () => {} });
    const picked = r.ok && asked === `pick:${i}` ? core.act(st, "tall", asked) : `${fmt(r)} asked ${asked}`;
    const said = L.acted(asked, picked, W(st)) ?? "";
    const hint = L.hint(W(st), p, "tall");
    if (picked !== "picked") { log.push(`box ${i}: ${picked}`); return { ok: false, log }; }
    if (hint.includes("가벼움") && said.includes("가볍")) {
      log.push(`box ${i} light`);
      const back = press(st, p, "tall");
      if (back !== "dropped" || st.boxes[i].col === null) { log.push(`back: ${back}`); return { ok: false, log }; }
      continue;
    }
    const r2 = route(() => W(st), p, "tall", [[11 * T + 8, FLOOR], [PLATE_STAND[placed], FLOOR]], clock); // past the plate, then back along the floor
    p.face = 1;
    const dropped = r2.ok && press(st, p, "tall");
    log.push(`box ${i} heavy -> ${dropped}`);
    if (dropped !== "dropped") { log.push(fmt(r2)); return { ok: false, log }; }
    placed++;
  }
  return { ok: core.gateOpen(st) && !st.jam, log };
}

// ---------- every opening: the whole relay, by the field's means ----------
{
  let cleared = 0, slowest = 0;
  const bad = [];
  for (const [tier, full] of OPENINGS) {
    const st = opening(tier, full);
    // shift 1: the walking aid sorts the boxes by feel and loads the plate
    const c1 = { t: 0 };
    const s1 = feelShift(st, c1);
    slowest = Math.max(slowest, c1.t);
    if (!s1.ok) { bad.push(`t${tier} [${full}]: ${s1.log.join(", ")} ${c1.t.toFixed(1)} s`); continue; }
    core.shiftEnded(st);
    // shift 2: the card through the gate to button ③, the crane drops its box under the lever
    const crane = st.crane;
    const key = L.newPlayer(), c2 = { t: 100 };
    const r2 = route(() => W(st), key, "key", [[L.BUTTONS[2].x, FLOOR]], c2);
    const craned = r2.ok && press(st, key, "key");
    if (craned !== "craned" || st.boxes[crane].col !== core.CRANE_SLOTS[2]) { bad.push(`t${tier} [${full}]: card ${fmt(r2)} ${craned}`); continue; }
    core.shiftEnded(st);
    // shift 3: the walking aid up the box to the lever
    const t3 = L.newPlayer(), c3 = { t: 200 };
    const b = st.boxes[crane];
    const r3 = route(() => W(st), t3, "tall", [[b.col * T - 24, FLOOR], [b.col * T + 8, b.row * T], [L.LEVER.x, L.LEVER.y]], c3);
    if (r3.ok && L.nearLever(t3) && press(st, t3, "tall") === "lever" && core.canClear(st, { lever: true })) cleared++;
    else bad.push(`t${tier} [${full}]: climb ${fmt(r3)}`);
  }
  check(`every opening (${OPENINGS.length}: each tier, each choice of full boxes) clears in three shifts by feel, never sealing`, cleared === OPENINGS.length, `${cleared}/${OPENINGS.length} ${bad.slice(0, 3).join(" | ")}`);
  check("...the walking aid's sorting fits in one shift even when it lifts every box", slowest < 60, `slowest ${slowest.toFixed(1)} s`);
}

// ---------- the catch: an empty box on the plate seals it for the shift ----------
{
  // the veteran's first move: the nearest box, straight onto the plate, without minding its weight
  const st = opening(1, [1]); // box 0, nearest the shelf's free end, is empty this time
  const before = W(st);
  check("the veteran's nearest box lifts like any other", core.act(st, "tall", "pick:0") === "picked");
  const res = core.act(st, "tall", "drop:0:9:19");
  const after = W(st);
  check("an empty box on the plate: 'jammed', it weighs nothing and the plate is sealed", res === "jammed" && after.jam === true && after.load === 0 && !after.gate);
  check("...the seal is public: the overseer says so to everyone, the sheet and the plate show it", /봉인/.test(L.narrate(before, after) ?? "") && JSON.stringify(L.schematic({ world: after })).includes("봉인") && L.mood(before, after) === "Attack");
  check("...nothing on the sealed plate can be lifted this shift (and the overseer says why)", core.act(st, "tall", "pick:0") === "sealed" && /봉인/.test(L.acted("pick:0", "sealed", after) ?? ""));
  check("...and even the full box set beside it does not open the gate this shift", core.act(st, "tall", "pick:1") === "picked" && core.act(st, "tall", "drop:1:10:19") === "dropped" && core.plateLoad(st) === 1 && !core.gateOpen(st));
  const hintOn = L.hint(W(st), { ...L.newPlayer(), x: 8 * T + 12, y: FLOOR, face: 1 }, "tall");
  check("...the hint by the sealed plate says it is sealed until the shift ends", /봉인/.test(hintOn), hintOn);
  // the shift ends: the seal lifts, the empty box stays as the record, and the gate answers again
  const sealed = W(st);
  check("the shift's end lifts the seal; the empty box stays on the plate as the record", core.shiftEnded(st) && !st.jam && st.boxes[0].col === 9 && core.gateOpen(st));
  check("...and the overseer says the seal is off (and the gate is open again)", /봉인이 풀렸/.test(L.narrate(sealed, W(st)) ?? "") && /게이트/.test(L.narrate(sealed, W(st)) ?? ""));
  check("offline: the shift's end lifts the seal too", (() => {
    const s0 = opening(1, [1]);
    core.act(s0, "tall", "pick:0"); core.act(s0, "tall", "drop:0:9:19");
    return s0.jam && L.local.shiftEnded(s0) && !s0.jam;
  })());
  check("an empty box can be lifted off the unsealed plate, and a full one on top of an empty one counts", (() => {
    const s2 = opening(1, [1]);
    core.act(s2, "tall", "pick:0"); core.act(s2, "tall", "drop:0:9:19"); core.shiftEnded(s2);
    const lifted = core.act(s2, "tall", "pick:0") === "picked" && core.act(s2, "tall", "drop:0:2:19") === "dropped";
    const s3 = opening(1, [1]);
    core.act(s3, "tall", "pick:0"); core.act(s3, "tall", "drop:0:9:19"); core.shiftEnded(s3);
    const stacked = core.act(s3, "tall", "pick:1") === "picked" && core.act(s3, "tall", "drop:1:9:18") === "dropped" && core.gateOpen(s3);
    return lifted && stacked;
  })());
  check("an empty box set down anywhere but the plate is harmless", (() => {
    const s4 = opening(1, [2]);
    return core.act(s4, "tall", "pick:0") === "picked" && core.act(s4, "tall", "drop:0:7:15") === "dropped" && !s4.jam;
  })());
  check("a seal closes a gate that was open (the mistake costs whenever it is made)", (() => {
    const s5 = opening(2, [0, 1]);
    core.act(s5, "tall", "pick:0"); core.act(s5, "tall", "drop:0:9:19"); core.act(s5, "tall", "pick:1"); core.act(s5, "tall", "drop:1:10:19");
    const wasOpen = core.gateOpen(s5);
    core.act(s5, "tall", "pick:2");
    return wasOpen && core.act(s5, "tall", "drop:2:9:18") === "jammed" && !core.gateOpen(s5) && !W(s5).gate;
  })());
  check("the admin valve does not move a sealed plate's room on (and a seal keeps its gate shut)", (() => {
    const s6 = opening(1, [1]);
    core.act(s6, "tall", "pick:0"); core.act(s6, "tall", "drop:0:9:19");
    return core.retier(s6, 2) && s6.jam && !core.gateOpen(s6);
  })());

  // a guesser that ignores its hands and learns only from seals: every opening, every guess order
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  const onPlate = (b) => b.col >= core.PLATE.c0 && b.col <= core.PLATE.c1;
  let runs = 0, opened = 0, worst = 0, within = true;
  for (const [tier, full] of OPENINGS) {
    const n = opening(tier, full).boxes.length - 1;
    for (const order of perms(Array.from({ length: n }, (_, i) => i))) {
      runs++;
      const st = opening(tier, full);
      const known = []; // boxes seen sealing the plate (on the tape, the sheet, the overseer's line)
      let wasted = 0, shifts = 0;
      while (!core.gateOpen(st) && shifts < 10) {
        shifts++;
        // tidy first: a known-empty box on the plate goes to the floor by the entrance
        for (const [k, i] of known.entries()) if (onPlate(st.boxes[i]) && core.act(st, "tall", `pick:${i}`) === "picked") core.act(st, "tall", `drop:${i}:${1 + k}:19`);
        for (const i of order) {
          if (known.includes(i) || onPlate(st.boxes[i]) || core.gateOpen(st)) continue;
          if (core.act(st, "tall", `pick:${i}`) !== "picked") continue;
          const [c, r] = [[9, 19], [10, 19], [9, 18]].find(([c, r]) => core.restRow(st, c, r) === r);
          if (core.act(st, "tall", `drop:${i}:${c}:${r}`) === "jammed") { known.push(i); wasted++; break; }
        }
        core.shiftEnded(st);
      }
      if (core.gateOpen(st)) opened++;
      worst = Math.max(worst, wasted);
      if (wasted > n - st.needed) within = false;
    }
  }
  check("guessing without feeling the weight: every opening, every guess order still opens the gate (never locked)", opened === runs, `${opened}/${runs}`);
  check("...losing at most one shift per empty box (two at tiers 1-2, one at tier 3)", within && worst === 2, `worst ${worst}`);
}

// ---------- the field's cue, and what nobody else sees ----------
// what everyone but the control desk sees: console.js drops ctrl wires and labels, redacts ctrl devices and rows
const pub = (sch) => JSON.stringify({
  map: sch.map.filter((it) => !it.ctrl || it.kind === "device" || it.kind === "zone" || it.kind === "box").map((it) => (it.ctrl ? { ...it, state: "#", label: it.kind === "device" ? it.label : "#" } : it)),
  status: sch.status.map((r) => (r.ctrl ? { label: r.label, state: "#" } : r)),
});
const drawLog = (world) => {
  const log = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => log.push(`${String(k)}(${a.join(",")})`)), set: (o, k, v) => { log.push(`${String(k)}=${v}`); return true; } });
  L.drawOverlay(ctx, { world, actor: null });
  return log.join(";");
};
{
  /** Hints a walking aid gets at each lifting spot (before lifting anything), and by the plate. */
  const hintsAt = (st) => st.boxes.slice(0, -1).map((_, i) => {
    const { way, face } = liftFrom(st, i);
    const [x, y] = way.at(-1);
    return L.hint(W(st), { ...L.newPlayer(), x, y, face }, "tall");
  }).join("|") + L.hint(W(st), { ...L.newPlayer(), x: 8 * T + 8, y: FLOOR, face: 1 }, "tall");
  let tiersSame = 0, desksDiffer = 0, labelsRight = 0, rowsRight = 0, cue = 0;
  for (const tier of [1, 2, 3]) {
    const mine = OPENINGS.filter(([t]) => t === tier);
    const sheets = new Set(), desks = new Set(), walls = new Set(), hints = new Set();
    for (const [, full] of mine) {
      const st = opening(tier, full);
      const sch = L.schematic({ world: W(st) });
      sheets.add(pub(sch));
      desks.add(JSON.stringify(sch));
      walls.add(drawLog(W(st)));
      hints.add(hintsAt(st));
      // the desk's labels: one ctrl word on each stored box, "적재" exactly on the full ones
      const words = sch.map.filter((it) => it.kind === "label" && it.ctrl && (it.text === "적재" || it.text === "빈 상자"));
      const fullX = st.boxes.flatMap((b, i) => (i !== st.crane && full.includes(i) ? [b.col * T + 8] : [])).sort().join();
      if (words.length === st.boxes.length - 1 && words.filter((w) => w.text === "적재").map((w) => w.x).sort().join() === fullX) labelsRight++;
      const row = sch.status.find((r) => r.ctrl && /무게/.test(r.label));
      const want = st.boxes.map((b, i) => ({ b, i })).filter(({ i }) => i !== st.crane).sort((a, b) => a.b.col - b.b.col).map(({ i }) => (full.includes(i) ? "●" : "○")).join("");
      if (row?.state === want) rowsRight++;
      // the hands: lifting each box tells the carrier its weight, in the hint and the overseer's line
      for (let i = 0; i < st.boxes.length - 1; i++) {
        const s2 = opening(tier, full), { way, face } = liftFrom(s2, i), [x, y] = way.at(-1);
        core.act(s2, "tall", `pick:${i}`);
        const h = L.hint(W(s2), { ...L.newPlayer(), x, y, face }, "tall"), line = L.acted(`pick:${i}`, "picked", W(s2)) ?? "";
        if (full.includes(i) ? /묵직/.test(h) && /묵직/.test(line) : /가벼/.test(h) && /가볍/.test(line)) cue++;
      }
    }
    if (sheets.size === 1 && walls.size === 1 && hints.size === 1) tiersSame++;
    else console.log(`      tier ${tier}: ${sheets.size} public sheets, ${walls.size} walls, ${hints.size} hint sets`);
    if (desks.size === mine.length) desksDiffer++;
  }
  const stored = OPENINGS.reduce((n, [tier]) => n + core.newState(tier).boxes.length - 1, 0);
  check("before anyone lifts, the public sheet, the room (CCTV) and the hints are the same for every opening of a tier", tiersSame === 3);
  check("the control desk's sheet differs with the full boxes (it is there)", desksDiffer === 3);
  check("...as a ctrl word on each box, '적재' exactly on the full ones", labelsRight === OPENINGS.length, `${labelsRight}/${OPENINGS.length}`);
  check("...and a ctrl row of the boxes left to right (●/○)", rowsRight === OPENINGS.length, `${rowsRight}/${OPENINGS.length}`);
  check("the field's cue: lifting tells the carrier (hint and overseer's line) heavy or light, every box of every opening", cue === stored, `${cue}/${stored}`);
  check("...and only the carrier: the overseer's public lines say nothing about a lift", (() => {
    const st = opening(1, [2]), a = W(st);
    core.act(st, "tall", "pick:0");
    return L.narrate(a, W(st)) === null;
  })());
  const fresh = L.schematic({ world: W(core.newState(1)) });
  check("no public text names a full or an empty box (only the redacted row's name says weight exists)", !/적재|빈 상자|●|○/.test(pub(fresh).replace(/"label":"상자 무게[^"]*"/, "")));
}

// ---------- the whole relay (tier 1, the nearest box full) ----------
{
  const st = opening(1, [0]);
  const clock = { t: 0 };
  // shift 1: the walking aid fetches the box and sets it on the plate
  const tall = L.newPlayer();
  const r1 = route(() => W(st), tall, "tall", [[6 * T + 8, 16 * T]], clock);
  tall.face = -1;
  const picked = r1.ok && press(st, tall, "tall");
  const r1b = route(() => W(st), tall, "tall", [[8 * T + 8, FLOOR]], clock);
  tall.face = 1;
  const dropped = r1b.ok && press(st, tall, "tall");
  check("walking aid: climbs the shelf, lifts the box, sets it on the plate", r1.ok && picked === "picked" && dropped === "dropped" && core.gateOpen(st), `${fmt(r1)}, ${picked}, ${dropped}, load ${core.plateLoad(st)}`);
  check("...within one shift", clock.t < 40, `${clock.t.toFixed(1)} s`);
  // shift 2: the card through the gate to the crane terminal, button 3 (under the lever)
  const key = L.newPlayer(), c2 = { t: 100 }, crane = st.crane;
  const r2 = route(() => W(st), key, "key", [[L.BUTTONS[2].x, FLOOR]], c2);
  const craned = r2.ok && press(st, key, "key");
  check("card: through the open gate to button ③, the crane drops its box under the lever", craned === "craned" && st.boxes[crane].col === core.CRANE_SLOTS[2], `${fmt(r2)}, ${craned}`);
  // shift 3: the walking aid up the box to the lever
  const t3 = L.newPlayer(), c3 = { t: 200 };
  const b = st.boxes[crane];
  const r3 = route(() => W(st), t3, "tall", [[b.col * T - 24, FLOOR], [b.col * T + 8, b.row * T], [L.LEVER.x, L.LEVER.y]], c3);
  check("walking aid: from the box up to the lever", r3.ok && L.nearLever(t3) && press(st, t3, "tall") === "lever", fmt(r3));
}

// ---------- who cannot ----------
{
  const st = core.newState(1), clock = { t: 0 };
  const r = route(() => W(st), L.newPlayer(), "key", [[18 * T, FLOOR]], clock, 6);
  check("gate shut: nobody gets into the crane hall", !r.ok);
  const onPlate = { ...L.newPlayer(), x: 9 * T + 8, y: FLOOR };
  check("standing on the plate opens the gate only for the one standing there", L.solidAt(W(st), 15, 18, null) && !L.solidAt(W(st), 15, 18, onPlate));
  for (const c of ["key", "light"]) {
    const r2 = route(() => W(st), L.newPlayer(), c, [[6 * T + 8, 16 * T]], { t: 0 }, 6);
    check(`${c}: cannot climb the storage shelf`, !r2.ok);
  }
  const open = opening(1, [0]);
  open.boxes[0] = { col: 9, row: 19 }; // already on the plate
  const t = { ...L.newPlayer(), x: 30 * T, y: FLOOR };
  const r3 = route(() => W(open), t, "tall", [[L.LEVER.x, L.LEVER.y]], { t: 0 }, 8);
  check("no box under the lever: the walking aid cannot reach it (5 tiles)", !r3.ok);
  check("the walking aid tops out under 5 tiles", jumpHeight("tall") < 5 * T && jumpHeight("tall") > 4 * T + 8, `${jumpHeight("tall").toFixed(1)} px`);
}

// ---------- the light's sensor ----------
{
  const st = opening(1, [0]);
  st.boxes[0] = { col: 9, row: 19 };
  const crane = st.crane;
  const light = { ...L.newPlayer(), x: 21 * T + 8, y: FLOOR };
  check("light: the sensor drops the crane's box at the far default spot", press(st, light, "light") === "craned" && st.boxes[crane].col === core.CRANE_SLOTS[core.CRANE_DEFAULT]);
  // the next walking aid carries it under the lever, climbs, pulls
  const clock = { t: 0 }, t = { ...L.newPlayer(), x: 18 * T, y: FLOOR };
  const r = route(() => W(st), t, "tall", [[core.CRANE_SLOTS[0] * T + 8 + 14, FLOOR]], clock);
  t.face = -1;
  const picked = press(st, t, "tall");
  const r2 = route(() => W(st), t, "tall", [[30 * T + 8, FLOOR]], clock);
  t.face = 1;
  const dropped = press(st, t, "tall");
  const r3 = route(() => W(st), t, "tall", [[st.boxes[crane].col * T - 24, FLOOR], [st.boxes[crane].col * T + 8, 19 * T], [L.LEVER.x, L.LEVER.y]], clock);
  check("walking aid: moves the sensor's box under the lever and climbs, in one shift", r.ok && picked === "picked" && r2.ok && dropped === "dropped" && r3.ok && clock.t < 60, `${fmt(r)} ${picked} ${fmt(r2)} ${dropped} ${fmt(r3)} total ${clock.t.toFixed(1)} s`);
  check("the crane's box is full (setting it on the plate never seals it)", core.weightOf(st, crane) === 1);
}

// ---------- the crane's wiring ----------
/** Every order of n buttons. */
const orders = (n) => (n <= 1 ? [[0]] : orders(n - 1).flatMap((o) => Array.from({ length: n }, (_, i) => [...o.slice(0, i), n - 1, ...o.slice(i)])));
const WIRINGS = orders(core.CRANE_SLOTS.length);
const UNDER = core.CRANE_SLOTS.length - 1; // the spot under the lever
{
  check("this room teaches: wired straight at every tier, in solo mode too", [1, 2, 3].every((tier) => String(core.newState(tier).wiring) === "0,1,2" && !core.newState(tier).shuffled) && String(L.local.newState(2).wiring) === "0,1,2");
  // the rules take any wiring (2-2 shuffles them): every one, and every button, still clears
  let cleared = 0, runs = 0;
  const bad = [];
  for (const wiring of WIRINGS) {
    for (let k = 0; k < L.BUTTONS.length; k++) {
      runs++;
      const st = opening(1, [0]);
      st.wiring = wiring.slice();
      st.boxes[0] = { col: 9, row: 19 }; // the plate's box: gate open
      const crane = st.crane;
      const key = { ...L.newPlayer(), x: L.BUTTONS[k].x };
      const res = press(st, key, "key"), box = st.boxes[crane];
      if (res !== "craned" || box.col !== core.CRANE_SLOTS[wiring[k]]) { bad.push(`${wiring} b${k + 1}: ${res}`); continue; }
      const clock = { t: 0 }, t = { ...L.newPlayer(), x: 18 * T, y: FLOOR };
      let ok = true;
      if (wiring[k] !== UNDER) { // not under the lever: the walking aid carries it there first
        const r = route(() => W(st), t, "tall", [[box.col * T + 8 + 14, FLOOR]], clock);
        t.face = -1;
        const picked = r.ok && press(st, t, "tall");
        const r2 = route(() => W(st), t, "tall", [[30 * T + 8, FLOOR]], clock);
        t.face = 1;
        const dropped = r2.ok && press(st, t, "tall");
        ok = picked === "picked" && dropped === "dropped";
        if (!ok) bad.push(`${wiring} b${k + 1}: carry ${fmt(r)} ${picked} ${fmt(r2)} ${dropped}`);
      }
      const b = st.boxes[crane];
      const r3 = ok && route(() => W(st), t, "tall", [[b.col * T - 24, FLOOR], [b.col * T + 8, b.row * T], [L.LEVER.x, L.LEVER.y]], clock);
      if (ok && r3.ok && press(st, t, "tall") === "lever" && clock.t < 60) cleared++;
      else if (ok) bad.push(`${wiring} b${k + 1}: climb ${fmt(r3)} ${clock.t.toFixed(1)} s`);
    }
  }
  check("every wiring, any button: the walking aid gets the box under the lever and climbs, in one shift", cleared === runs, `${cleared}/${runs} ${bad.slice(0, 3).join(" | ")}`);

  const sheets = new Set(), full = new Set(), walls = new Set();
  let wired = 0;
  for (const wiring of WIRINGS) {
    const st = opening(1, [0]);
    st.wiring = wiring.slice();
    const sch = L.schematic({ world: W(st) });
    sheets.add(pub(sch));
    full.add(JSON.stringify(sch));
    const wires = sch.map.filter((it) => it.kind === "wire");
    if (wires.length === 4 && wires.every((w) => w.ctrl) && wires.slice(0, 3).findIndex((w) => w.on) === wiring.indexOf(UNDER)) wired++;
    // if this room were ever shuffled, the wall would not tell either
    walls.add(drawLog({ ...W(st), shuffled: true }) + L.BUTTONS.map((b) => L.hint({ ...W(st), shuffled: true }, { ...L.newPlayer(), x: b.x }, "key")).join("|"));
  }
  const straight = L.schematic({ world: W(core.newState(1)) });
  check("the control desk's sheet shows the wiring: a ctrl wire from each button (the live one under the lever) and the sensor's", full.size === WIRINGS.length && wired === WIRINGS.length);
  check("everyone else's sheet is the same for all six wirings: the wiring is ctrl-only", sheets.size === 1);
  check("...including where the sensor drops: no public item names a button or a default", !pub(straight).includes("①") && !pub(straight).includes("기본") && straight.status.some((r) => r.ctrl));
  check("shuffled, the rail and the button hints would not tell the wiring either", walls.size === 1);
}

// ---------- the rules ----------
{
  check("boxes per tier: 3 / 4 / 4 (three on the shelf, one by the gate from tier 2), always one more than the plate wants or more", [1, 2, 3].every((tier) => {
    const st = core.newState(tier);
    return st.boxes.length - 1 === [3, 4, 4][tier - 1] && st.needed === tier && st.boxes.slice(0, 3).every((b) => b.row === 15) && (tier < 2 || (st.boxes[3].col === 12 && st.boxes[3].row === 19));
  }));
  check("each opening deals exactly as many full boxes as the plate wants (the crane's box full too)", [1, 2, 3].every((tier) => Array.from({ length: 50 }, () => core.newState(tier)).every((st) => st.weights.length === st.boxes.length && st.weights.slice(0, -1).filter((w) => w === 1).length === st.needed && st.weights.at(-1) === 1 && st.jam === false)));
  const seen = [0, 0, 0];
  for (let n = 0; n < 3000; n++) core.newState(1).weights.slice(0, 3).forEach((w, i) => { seen[i] += w; });
  check("tier 1: each shelf box is the full one about a third of the time (the nearest is no better a guess)", seen.every((n) => n > 850 && n < 1150), seen.join("/"));
  check("offline solo mode deals the weights too", Array.isArray(L.local.newState(1).weights) && L.local.newState(1).weights.length === 4);
  const st = opening(3, [0, 1, 2]);
  st.boxes[0] = { col: 9, row: 19 }; st.boxes[1] = { col: 10, row: 19 };
  check("two full boxes: not enough weight yet", core.plateLoad(st) === 2 && !core.gateOpen(st));
  check("a box is set on top of another (stacking)", core.act(st, "tall", "pick:2") === "picked" && core.act(st, "tall", "drop:2:9:18") === "dropped" && st.boxes[2].row === 18);
  check("stacks count: three full on the plate opens the gate", core.plateLoad(st) === 3 && core.gateOpen(st));
  check("a box with another on top cannot be lifted", core.act(st, "tall", "pick:0") === "buried");
  check("only the walking aid lifts boxes", core.act(st, "key", "pick:1") === "bad");
  check("a box cannot be set inside a wall or the gate", core.act(st, "tall", "pick:1") === "picked" && core.act(st, "tall", "drop:1:15:19") === "blocked" && core.act(st, "tall", "drop:1:0:19") === "blocked");
  check("a shift that ends while carrying puts the box back", core.shiftEnded(st) && st.held === -1 && st.boxes[1].col === 10 && core.plateLoad(st) === 3);
  check("a shift with nothing to tidy changes nothing", !core.shiftEnded(st));
  check("the crane drops once", core.act(st, "key", "crane:1") === "craned" && core.act(st, "key", "crane:2") === "empty");
  check("only the card chooses, only the light trips the sensor", core.act(core.newState(1), "tall", "crane:0") === "bad" && core.act(core.newState(1), "key", "sensor") === "bad");
  const locked = core.newState(1);
  check("the lever is locked until the crane has dropped its box", core.publicWorld({ lab: 2, lever: true }, locked).lever === false && !core.canClear(locked, { lever: true }));
  const valve = opening(1, [2]);
  check("the admin valve stores more boxes when it asks for more weight, full, and enough of them", core.retier(valve, 3) && valve.needed === 3 && valve.boxes.length === 5 && valve.crane === 4 && valve.weights.length === 5 && valve.weights.slice(0, 4).filter((w) => w === 1).length >= 3 && valve.weights[2] === 1);
  const old = core.newState(1);
  delete old.weights; delete old.jam;
  old.boxes[0] = { col: 9, row: 19 };
  check("a room saved before weights existed: every box weighs 1, nothing seals", core.gateOpen(old) && core.publicWorld({ lab: 2 }, old).weights.every((w) => w === 1) && core.act(old, "tall", "pick:1") === "picked" && core.act(old, "tall", "drop:1:10:19") === "dropped" && !old.jam);
  check("a world without weights (an old checkpoint) draws every box as full on the desk's sheet", L.schematic({ world: { lab: 2, boxes: [{ col: 5, row: 15 }, { col: null, row: null }], crane: 1, held: -1 } }).status.find((r) => /무게/.test(r.label)).state === "●");
}

// ---------- room 2-2 shares these rules and must not weigh anything ----------
{
  const r = core.room12;
  const st = r.newState(2), w = r.publicWorld({ lab: 12 }, st);
  check("2-2: no weights and no seal in its state or its world", !("weights" in st) && !("jam" in st) && !("weights" in w) && !("jam" in w));
  st.boxes[0] = { col: 9, row: 19 };
  check("2-2: any box on its plate weighs 1, and dropping one there never seals", r.plateLoad(st) === 1 && r.act(st, "tall", "pick:1") === "picked" && r.act(st, "tall", "drop:1:10:19") === "dropped" && r.plateLoad(st) === 2 && r.weightOf(st, 1) === 1);
  check("2-2: still shuffled every opening, one box per working press and one for the lever", r.newState(1).shuffled === true && r.newState(1).boxes.length === 3 && r.newState(2).boxes.length === 4);
}

// ---------- the server's copy (src/lab2.ts), where this Node can load TypeScript ----------
{
  let S = null;
  try { S = await import("../src/lab2.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab2.ts parity (run with node --experimental-strip-types to include it)");
  else {
    const fresh = S.newState(1);
    check("src/lab2.ts deals weights each opening like public/lab2core.js", Array.isArray(fresh.weights) && fresh.weights.slice(0, -1).filter((w) => w === 1).length === 1 && fresh.jam === false);
    const results = (rules) => {
      const s = rules.newState(1);
      s.weights = [0, 1, 0, 1];
      const out = [rules.act(s, "tall", "pick:0"), rules.act(s, "tall", "drop:0:9:19"), rules.act(s, "tall", "pick:0"), String(rules.publicWorld({ lab: 2 }, s).jam), String(rules.shiftEnded(s)), rules.act(s, "tall", "pick:1"), rules.act(s, "tall", "drop:1:10:19"), String(rules.publicWorld({ lab: 2 }, s).gate)];
      return out.join(" ");
    };
    const a = results(S), b = results(core);
    check("src/lab2.ts seals, refuses, unseals and opens like public/lab2core.js", a === b && a === "picked jammed sealed true true picked dropped true", a);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
