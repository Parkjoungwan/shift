// Checks room 2-2 "Safety mat": the card opens the gate with the crane's box (the button wired to
// the plate this opening), no timing gets anyone under a working press, a box on the mat stops it,
// and the walking aid can stock the mat and climb to the lever. Every one of the crane's six
// wirings is solvable in every order of guesses: a wrong button loses the box down a hatch and
// costs that shift, the crane re-arms at the shift's end (at most two wasted, never locked). The
// wiring shows on the control sheet only as ctrl items, never on the wall.
// Runs the real step() at 60 fps with the shared rules.
// Usage: node test/lab12.test.mjs

import * as L from "../public/lab12.js";
import { room12 as core } from "../public/lab2core.js";

const DT = 1 / 60, T = L.T, FLOOR = 20 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller through waypoints [x, feetY]; stops on a trap. */
function route(getWorld, p, character, waypoints, clock, limit = 40) {
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
        if (Math.abs(dx) < 48 && input.jumpPressed) input.left = input.right = false; // a short hop: straight up first
      }
      // like a player: on a short hop, rise clear of the ledge before steering onto it
      if (!p.ground && up && p.vy < 0 && Math.abs(dx) < 48 && p.y - 8 > ty) input.left = input.right = false;
      if (held && p.vy > 0) held = false;
      L.step(getWorld(), p, input, character, DT, clock.t * 1000);
      clock.t += DT;
      const trap = L.trapHit(L, p, clock.t * 1000, getWorld());
      if (trap) return { ok: false, trap, t: clock.t - t0, at: [Math.round(p.x), Math.round(p.y)] };
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t: clock.t - t0, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t: clock.t - t0 };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : r.trap ? `${r.trap.kind} at ${r.at}` : `stuck at ${r.at} going to ${r.target}`);
const W = (state) => core.publicWorld({ lab: 12 }, state);
function press(state, p, character) {
  let asked = null;
  L.use({ world: W(state), p, character, say: () => {}, act: (w) => { asked = w; }, pullLever: () => { asked = "lever"; } });
  return asked === null ? null : asked === "lever" ? "lever" : core.act(state, character, asked);
}

/** Every order of n buttons. */
const orders = (n) => (n <= 1 ? [[0]] : orders(n - 1).flatMap((o) => Array.from({ length: n }, (_, i) => [...o.slice(0, i), n - 1, ...o.slice(i)])));
const WIRINGS = orders(core.CRANE_SLOTS.length);
const PLATE_SLOT = core.CRANE_SLOTS.findIndex((c) => c >= core.PLATE.c0 && c <= core.PLATE.c1);

/** The walking aid's hall shift: stock the working mats from the hall shelf, the last box under the lever, climb, pull. */
function hall(st, p, clock, log) {
  const shelf = st.boxes.filter((b) => b.col >= 16 && b.col <= 20 && b.row === 15).map((b) => b.col).sort((a, b) => b - a);
  const spots = [...core.MATS.slice(0, st.presses).map(([c0]) => c0 - 1), 32]; // stand left of each mat, then left of the lever's box spot
  let ok = true;
  for (let k = 0; k < shelf.length && ok; k++) {
    const col = shelf[k];
    const r = route(() => W(st), p, "tall", [[22 * T + 8, FLOOR], [20 * T + 8, 16 * T], [(col + 1) * T + 8, 16 * T]], clock);
    p.face = -1;
    const picked = r.ok && press(st, p, "tall");
    const r2 = route(() => W(st), p, "tall", [[spots[k] * T + 8, FLOOR]], clock);
    p.face = 1;
    const dropped = r2.ok && press(st, p, "tall");
    log.push(`${picked}/${dropped}`);
    ok = r.ok && r2.ok && picked === "picked" && dropped === "dropped";
    if (!ok) log.push(fmt(r), fmt(r2));
  }
  const last = st.boxes.find((b) => b.col === 33);
  const r3 = ok && route(() => W(st), p, "tall", [[31 * T + 8, FLOOR], [33 * T + 8, 19 * T], [L.LEVER.x, L.LEVER.y]], clock);
  if (r3) log.push(fmt(r3));
  return ok && !!last && r3?.ok && press(st, p, "tall") === "lever";
}

// ---------- the card and the crane: every wiring, every order of guesses ----------
{
  let runs = 0, cleared = 0, worstWasted = 0, lostOk = 0, lostRuns = 0;
  const bad = [];
  for (const wiring of WIRINGS) {
    for (const guesses of WIRINGS) { // the order the card workers try the buttons, one shift each
      runs++;
      const st = core.newState(1);
      st.wiring = wiring.slice();
      let wasted = 0, opened = false;
      for (const k of guesses) {
        const clock = { t: 0 }, key = L.newPlayer();
        const r = route(() => W(st), key, "key", [[L.BUTTONS[k].x, FLOOR]], clock);
        const before = W(st);
        const res = r.ok && press(st, key, "key");
        const right = wiring[k] === PLATE_SLOT;
        if (res !== (right ? "craned" : "lost")) { bad.push(`${wiring} b${k + 1}: ${res} ${fmt(r)}`); break; }
        if (right) { opened = core.gateOpen(st); break; }
        // a wrong button: the box is gone down the hatch, the crane is spent for this shift
        lostRuns++;
        const w = W(st);
        const gone = !core.gateOpen(st) && w.lost === wiring[k] && w.pressed === k && st.boxes.every((b) => b.col === null || b.row === 15) // nothing on the storeroom floor to fetch
          && core.act(st, "key", `crane:${guesses.find((g) => g !== k)}`) === "empty" // one drop per shift
          && L.useless(w, "tall") && L.useless(w, "key")
          && /폐기/.test(L.narrate(before, w) ?? "") && L.narrate(before, w).includes(String(k + 1));
        wasted++;
        const ended = core.shiftEnded(st); // the shift ends: a fresh box, the same wiring
        const w2 = W(st);
        if (gone && ended && w2.crane >= 0 && w2.lost === -1 && w2.pressed === -1 && String(w2.wiring) === String(wiring) && !L.useless(w2, "key") && /새 상자/.test(L.narrate(w, w2) ?? "")) lostOk++;
        else bad.push(`${wiring} b${k + 1}: lost/rearm ${gone} ${ended}`);
      }
      worstWasted = Math.max(worstWasted, wasted);
      if (!opened) { bad.push(`${wiring} ${guesses}: never opened`); continue; }
      core.shiftEnded(st); // the card's shift ends: nothing to re-arm (the box is on the plate)
      if (st.crane !== -1 || !core.gateOpen(st)) { bad.push(`${wiring}: re-armed after a good drop`); continue; }
      const tall = L.newPlayer(), log = [];
      if (hall(st, tall, { t: 0 }, log)) cleared++;
      else bad.push(`${wiring} ${guesses}: hall ${log.join(" ")}`);
    }
  }
  check("every wiring, every order of guesses: the gate opens and the room clears (never locked)", cleared === runs && !bad.length, `${cleared}/${runs} ${bad.slice(0, 3).join(" | ")}`);
  check("a wrong button loses the box down the hatch, spends the crane for the shift, says which button; the shift's end hangs a fresh box, same wiring", lostOk === lostRuns && lostRuns === WIRINGS.length * 6, `${lostOk}/${lostRuns}`);
  check("three buttons: at most two shifts wasted", worstWasted === 2);
  check("the walking aid cannot fetch a lost box (no hard lock either: the crane re-arms)", (() => {
    const st = core.newState(1);
    st.wiring = WIRINGS.find((w) => w[0] !== PLATE_SLOT).slice();
    core.act(st, "key", "crane:0");
    return core.act(st, "tall", `pick:${st.boxes.length - 1}`) === "bad" && core.shiftEnded(st) && core.act(st, "key", `crane:${L.plateButton(W(st))}`) === "craned" && core.gateOpen(st);
  })());
  check("gate shut: nobody gets into the hall", !route(() => W(core.newState(1)), L.newPlayer(), "tall", [[18 * T, FLOOR]], { t: 0 }, 6).ok);
  // offline solo mode re-arms too; a carried box still goes back; retier mid-way keeps it all
  const st = L.local.newState(2), wrong = st.wiring.findIndex((s) => s !== PLATE_SLOT);
  L.local.act(st, "key", `crane:${wrong}`);
  check("offline: the shift's end re-arms the crane", st.crane < 0 && L.local.shiftEnded(st) && st.crane >= 0);
  L.local.act(st, "key", `crane:${st.wiring.findIndex((s, k) => s !== PLATE_SLOT && k !== wrong)}`);
  const kept = String(st.wiring);
  check("more staff between a lost box and the shift's end: the crane still re-arms, same wiring", core.retier(st, 3) && core.shiftEnded(st) && st.crane === st.boxes.length - 1 && String(st.wiring) === kept && core.act(st, "key", `crane:${L.plateButton(W(st))}`) === "craned" && core.gateOpen(st));
  check("a shift with nothing to tidy changes nothing", !core.shiftEnded(core.newState(1)));
}

// ---------- the shuffle ----------
{
  const seen = new Map(), plate = [0, 0, 0];
  for (let i = 0; i < 1200; i++) {
    const st = i % 2 ? core.newState(1 + (i % 3)) : L.local.newState(1); // the server's rules and offline solo alike
    seen.set(String(st.wiring), (seen.get(String(st.wiring)) ?? 0) + 1);
    plate[st.wiring.indexOf(PLATE_SLOT)]++;
  }
  check("every opening is shuffled: all six wirings turn up", seen.size === 6 && [...seen.keys()].every((k) => WIRINGS.some((w) => String(w) === k)), [...seen.entries()].map(([k, v]) => `${k}:${v}`).join(" "));
  check("...and each button is the plate's about a third of the time (button 3 is no better a guess)", plate.every((n) => n > 300 && n < 500), plate.join("/"));
  check("offline solo mode shuffles too", L.local.newState(1).shuffled === true);
  const st = core.newState(1), before = st.wiring.slice();
  check("more staff: retier keeps this opening's wiring", core.retier(st, 3) && String(st.wiring) === String(before));
  const old = core.newState(1);
  delete old.wiring; delete old.shuffled;
  check("a room saved before wiring existed is wired straight", String(W(old).wiring) === "0,1,2" && core.act(old, "key", "crane:1") === "craned" && core.gateOpen(old));
  check("a button that is not there is refused", core.act(core.newState(1), "key", "crane:3") === "bad" && core.act(core.newState(1), "key", "crane:-1") === "bad");
}

// ---------- who sees the wiring ----------
{
  // what everyone but the control desk sees: console.js drops ctrl wires and labels, redacts ctrl devices and rows
  const cleared = (sch) => ({
    map: sch.map.filter((it) => !it.ctrl || it.kind === "device" || it.kind === "zone" || it.kind === "box").map((it) => (it.ctrl ? { ...it, state: "#", label: it.kind === "device" ? it.label : "#" } : it)),
    status: sch.status.map((r) => (r.ctrl ? { label: r.label, state: "#" } : r)),
  });
  const pub = new Set(), full = new Set(), overlay = new Set(), hints = new Set();
  let wiresRight = 0;
  for (const wiring of WIRINGS) {
    const st = core.newState(1);
    st.wiring = wiring.slice();
    const world = W(st), sch = L.schematic({ world });
    pub.add(JSON.stringify(cleared(sch)));
    full.add(JSON.stringify(sch));
    const wires = sch.map.filter((it) => it.kind === "wire");
    if (wires.length === 3 && wires.every((w) => w.ctrl) && wires.filter((w) => w.on).length === 1 && wires[L.plateButton(world)].on) wiresRight++;
    // the wall and the rail: record every mark drawOverlay paints
    const log = [];
    const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => log.push(`${String(k)}(${a.join(",")})`)), set: (o, k, v) => { log.push(`${String(k)}=${v}`); return true; } });
    L.drawOverlay(ctx, { world, actor: null });
    overlay.add(log.join(";"));
    hints.add(L.BUTTONS.map((b) => L.hint(world, { ...L.newPlayer(), x: b.x }, "key")).join("|"));
  }
  check("the control desk's sheet differs with the wiring (it is there)", full.size === WIRINGS.length);
  check("the wiring is drawn as ctrl wires, the plate's live", wiresRight === WIRINGS.length);
  check("everyone else's sheet is the same for all six wirings: the wiring is ctrl-only", pub.size === 1);
  check("the room itself (rail, buttons, crane) looks the same for all six wirings", overlay.size === 1);
  check("the button hints do not name a spot", hints.size === 1 && ![...hints][0].includes("위치"), [...hints][0]);
  const done = core.newState(1);
  core.act(done, "key", "crane:2");
  check("after the drop the sheet keeps no wiring, only the record", !L.schematic({ world: W(done) }).map.some((it) => it.kind === "wire") && L.schematic({ world: W(done) }).status.some((r) => String(r.state).includes("3")));
}

// ---------- the presses ----------
{
  const st = core.newState(3); // both presses working
  st.boxes[st.crane] = { col: 9, row: 19 }; st.crane = -1;
  let caught = 0, tries = 0;
  for (let phase = 0; phase < 1700; phase += 25) {
    tries++;
    const p = { ...L.newPlayer(), x: 21 * T + 8, y: FLOOR };
    const clock = { t: phase / 1000 };
    // run straight through press 1 at full speed, starting at every moment of its cycle
    let t = 0;
    for (; t < 3 && p.x < 28 * T; t += DT) {
      L.step(W(st), p, { right: true }, "tall", DT, clock.t * 1000);
      clock.t += DT;
      if (L.trapHit(L, p, clock.t * 1000, W(st))) { caught++; break; }
    }
  }
  check("no timing gets anyone under a working press", caught === tries, `${caught}/${tries}`);
  st.boxes[0] = { col: 23, row: 19 }; st.boxes[1] = { col: 29, row: 19 };
  const p = { ...L.newPlayer(), x: 21 * T + 8, y: FLOOR };
  const r = route(() => W(st), p, "tall", [[32 * T, FLOOR]], { t: 0 });
  check("a box on each mat: both presses stay up, the way is open", r.ok, fmt(r));
}

// ---------- the walking aid's shift ----------
for (const tier of [1, 2]) {
  const st = core.newState(tier);
  st.boxes[st.crane] = { col: 9, row: 19 }; st.crane = -1; // the card's shift is done
  const clock = { t: 0 }, p = L.newPlayer(), log = [];
  check(`tier ${tier}: the walking aid stocks ${st.presses} mat(s) and climbs to the lever`, hall(st, p, clock, log), `${log.join(" ")} total ${clock.t.toFixed(1)} s`);
  check(`tier ${tier}: ...within one or two shifts`, clock.t < 90, `${clock.t.toFixed(1)} s`);
}

// ---------- the rules ----------
{
  const st = core.newState(1);
  check("tier 1: one press works, the shelf holds two boxes", st.presses === 1 && st.boxes.length === 3);
  check("tier 2: both presses work, three boxes", core.newState(2).presses === 2 && core.newState(2).boxes.length === 4);
  check("a switched-off press stays up", L.trapStopped(L.traps[1], W(st)));
  check("the lever is locked while the gate is", core.publicWorld({ lab: 12, lever: true }, st).lever === false);
  check("no light sensor here", core.act(core.newState(1), "light", "sensor") === "bad");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
