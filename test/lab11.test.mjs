// Checks room 1-2 "Shift order": the card reaches the reader; the light climbs to the ledge and up
// the dark shaft to the sensor, which it charges by holding still; the walking aid goes along the
// corridor and, through an open hall door, up to the lever. The hall door opens only when the
// reader and the sensor are both approved in this opening's order (wire). Every wire needs all
// three tools, no pair of tools can clear it, a device used out of turn is refused publicly and
// recoverable, the order is only on ctrl items of the blueprint, and nothing public (sheet, room
// drawing, advice) differs between wires until someone tries. Runs the real step() at 60 fps.
// Usage: node test/lab11.test.mjs (node --experimental-strip-types also checks src/lab11.ts)

import * as L from "../public/lab11.js";

const DT = 1 / 60, T = L.T, FLOOR = 20 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

function route(world, p, character, waypoints, limit = 25) {
  let t = 0, held = false;
  for (const [tx, ty] of waypoints) {
    let done = false;
    while (t < limit) {
      const dx = tx - p.x, up = ty < p.y - 4;
      const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
      if (up && p.ground) {
        if (Math.abs(dx) < 20) { input.left = dx >= 0; input.right = dx < 0; }
        else if (Math.abs(dx) < 90) { input.jumpPressed = true; held = true; input.jumpHeld = true; }
      }
      if (held && p.vy > 0) held = false;
      L.step(world, p, input, character, DT, t * 1000);
      t += DT;
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : `stuck at ${r.at} going to ${r.target}`);
const W = (extra) => ({ ...L.fresh(), ...extra });

const LEDGE = [[3 * T, FLOOR], [6 * T + 8, 17 * T], [9 * T, 15 * T]];
const SHAFT = [...LEDGE, [12 * T, 15 * T], [15 * T + 8, 12 * T], [12 * T + 8, 9 * T], [15 * T + 8, 6 * T]];
const SHELVES = [[21 * T, FLOOR], [23 * T + 8, 16 * T], [27 * T + 8, 12 * T], [31 * T + 8, 8 * T], [L.LEVER.x, L.LEVER.y]];

// ---------- movement: who reaches what ----------
const reach = {}; // what each tool can get to on its own, with the hall door shut or open
{
  const p = L.newPlayer();
  const r = route(W(), p, "key", [[L.READER.x, FLOOR]]);
  check("card: walks to the card reader", r.ok && L.nearReader(p), fmt(r));
}
{
  const p = L.newPlayer();
  const r = route(W(), p, "light", SHAFT);
  check("light: up the bridge to the ledge and up the shaft to the sensor, with nothing approved", r.ok && L.onSensor(p, "light"), `${fmt(r)} at ${Math.round(p.x)},${Math.round(p.y)}`);
  let asked = null;
  const world = W({ dwell: 6 });
  p.vx = 0; // standing still
  for (let f = 0; f < 60 * 7 && !asked; f++) L.tick({ world, p, character: "light", act: (w) => { asked = { w, t: f / 60 }; } });
  check("...holding still charges the sensor in its exposure time", asked?.w === "sensor" && Math.abs(asked.t - 6) < 0.1, JSON.stringify(asked));
  const moving = { ...p, beam: 0, sent: false, vx: 50 };
  let asked2 = null;
  for (let f = 0; f < 60 * 7; f++) L.tick({ world, p: moving, character: "light", act: () => { asked2 = true; } });
  check("...moving does not", asked2 === null);
  let asked3 = null;
  const still = { ...p, beam: 0, sent: false, vx: 0 };
  for (let f = 0; f < 60 * 9; f++) L.tick({ world: W({ dwell: 6, refused: ["sensor"] }), p: still, character: "light", act: () => { asked3 = true; } });
  check("...and a refused sensor is not asked again", asked3 === null);
}
for (const c of ["key", "tall"]) check(`${c}: cannot reach the ledge, so never the sensor`, !route(W(), L.newPlayer(), c, [[7 * T, FLOOR], [9 * T, 15 * T]], 8).ok);
{
  const p = L.newPlayer();
  const r = route(W({ doorB: true }), p, "tall", SHELVES);
  check("walking aid: along the corridor, through the hall door and up four shelves to the lever, in time", r.ok && L.nearLever(p) && r.t < 30, fmt(r));
  check("hall door shut: no way into the shelf hall", !route(W(), L.newPlayer(), "tall", [[21 * T, FLOOR]], 6).ok);
  for (const c of ["key", "light"]) check(`${c}: cannot climb the shelves to the lever`, !route(W({ doorB: true }), L.newPlayer(), c, SHELVES.slice(0, 2), 8).ok);
}
// so: only the card approves the reader, only the light the sensor, only the walking aid pulls the lever
const ACTS = { key: "door", light: "sensor" };

// ---------- the rules, for every wire ----------
check("both wires exist", JSON.stringify(L.WIRINGS) === "[0,1]");
check("a fresh opening picks either wire", new Set([L.newState(1, () => 0.1).wire, L.newState(1, () => 0.9).wire]).size === 2);
/** A canvas that writes down every call made on it, to compare two drawings. */
function recCtx() {
  const calls = [];
  return new Proxy({ calls }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "measureText") return () => ({ width: 10 });
      return (...args) => calls.push([k, ...args]);
    },
    set(o, k, v) { calls.push(["=" + String(k), v]); return true; },
  });
}
const publicSheet = (world) => {
  const sch = L.schematic({ world });
  return JSON.stringify([...sch.map.filter((m) => !m.ctrl), ...sch.status.filter((r) => !r.ctrl)]);
};
const drawing = (world, cctv) => {
  const ctx = recCtx();
  L.drawOverlay(ctx, { world, actor: null, cctv, noDarkness: false });
  return JSON.stringify(ctx.calls);
};
{
  const [w0, w1] = L.WIRINGS.map((wire) => L.publicWorld(L.fresh(), { ...L.newState(1), wire }));
  check("before anyone tries, the public sheet is the same for both wires", publicSheet(w0) === publicSheet(w1));
  check("...and so is the room on the CCTV and in the field", drawing(w0, true) === drawing(w1, true) && drawing(w0, false) === drawing(w1, false));
  check("...and so are the hints and the advice on picking equipment", ["key", "light", "tall"].every((c) => L.useless(w0, c) === L.useless(w1, c)) &&
    L.hint(w0, { ...L.newPlayer(), x: L.READER.x }, "key") === L.hint(w1, { ...L.newPlayer(), x: L.READER.x }, "key"));
}
for (const wire of L.WIRINGS) {
  const first = wire ? "light" : "key", second = wire ? "key" : "light";
  const name = `wire ${wire} (${first} first)`;
  const sch = L.schematic({ world: L.publicWorld(L.fresh(), { ...L.newState(1), wire }) });
  const ctrlText = JSON.stringify([...sch.map.filter((m) => m.ctrl), ...sch.status.filter((r) => r.ctrl)]);
  const want = wire ? "감광기 → 카드 리더" : "카드 리더 → 감광기";
  check(`${name}: the order is on the blueprint only as ctrl`, ctrlText.includes(want) && !publicSheet(L.publicWorld(L.fresh(), { ...L.newState(1), wire })).includes("→"));

  // the intended run: all three tools
  {
    const st = { ...L.newState(1), wire };
    const r1 = L.act(st, first, ACTS[first]), r2 = L.act(st, second, ACTS[second]);
    check(`${name}: ${first} then ${second} opens the hall door, then the walking aid clears it`, r1 === "accepted" && r2 === "open" && st.doorB && L.canClear(st, L.publicWorld({ ...L.fresh(), lever: true }, st)));
  }
  // the veteran's guess (card first) or its mirror: refused, public, recoverable, one shift lost
  {
    const st = { ...L.newState(1), wire };
    const r = L.act(st, second, ACTS[second]);
    const dev = second === "key" ? "reader" : "sensor";
    const w = L.publicWorld(L.fresh(), st);
    const said = L.narrate(L.publicWorld(L.fresh(), { ...L.newState(1), wire }), w);
    check(`${name}: ${second} out of turn is refused, and everyone sees it (lamp, sheet, overseer)`,
      r === "order" && !st.doorB && L.refused(w, dev) && publicSheet(w).includes("반려") && /반려/.test(said ?? "") &&
      drawing(w, true).includes("#e06060") && L.useless(w, second));
    check(`${name}: ...it stays refused until ${first} is approved`, L.act(st, second, ACTS[second]) === "order");
    check(`${name}: ${first} is approved; the refusal is lifted`, L.act(st, first, ACTS[first]) === "accepted" && st.refused.length === 0 && !L.useless(L.publicWorld(L.fresh(), st), second));
    check(`${name}: ...and ${second} again opens the door (one shift lost)`, L.act(st, second, ACTS[second]) === "open" && st.doorB);
    check(`${name}: an approved device stays approved`, L.act(st, first, ACTS[first]) === "already");
  }
  // no two tools can clear it: try every pair, every sequence of their actions
  for (const pair of [["key", "light"], ["key", "tall"], ["light", "tall"]]) {
    let cleared = false;
    const seqs = [[]];
    for (let n = 0; n < 4; n++) for (const s of [...seqs]) if (s.length === n) for (const c of pair) seqs.push([...s, c]);
    for (const seq of seqs) {
      const st = { ...L.newState(1), wire };
      for (const c of seq) if (ACTS[c]) L.act(st, c, ACTS[c]);
      // the lever is the walking aid's (movement above); the door is the card's and the light's
      if (st.doorB && pair.includes("tall")) cleared = true;
    }
    check(`${name}: ${pair.join(" + ")} alone never clears the room`, !cleared);
  }
  // the field without the control desk: each shift sends the first tool that is not useless
  {
    const st = { ...L.newState(1), wire };
    const used = [];
    let lever = false;
    for (let shift = 0; shift < 8 && !lever; shift++) {
      const seen = L.publicWorld(L.fresh(), st);
      const c = ["key", "light", "tall"].find((k) => !L.useless(seen, k));
      used.push(c);
      if (ACTS[c]) L.act(st, c, ACTS[c]);
      else lever = L.canClear(st, L.publicWorld({ ...L.fresh(), lever: true }, st));
    }
    const want = wire ? "key,light,key,tall" : "key,light,tall";
    check(`${name}: without the desk, card-first costs at most one shift (${want})`, lever && used.join() === want, used.join());
  }
}
{
  check("only the card uses the reader", L.act(L.newState(1), "light", "door") === "bad" && L.act(L.newState(1), "tall", "door") === "bad");
  check("only the light charges the sensor", L.act(L.newState(1), "key", "sensor") === "bad");
  check("more staff: a longer exposure", L.newState(1).dwell === 4 && L.newState(3).dwell === 8);
  check("the lever stays locked until the hall door opens", L.publicWorld({ lab: 11, lever: true }, { ...L.newState(1), swiped: true }).lever === false);
  const ch = { ...L.newState(1), wire: 1 };
  L.act(ch, "light", "sensor");
  check("a charged sensor keeps its exposure time when the valve moves", L.retier(ch, 3) === false && ch.dwell === 4);
}

// ---------- the server's copy (src/lab11.ts), where this Node can load TypeScript ----------
{
  let S = null;
  try { S = await import("../src/lab11.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab11.ts parity (run with node --experimental-strip-types to include it)");
  else {
    const seen = new Set(Array.from({ length: 64 }, () => S.newState(1).wire));
    check("src/lab11.ts deals both wires", seen.size === 2 && [...seen].every((w) => w === 0 || w === 1));
    for (const wire of L.WIRINGS) {
      const a = { ...S.newState(2), wire }, b = { ...L.newState(2), wire };
      const steps = [["tall", "door"], ["key", "door"], ["light", "sensor"], ["key", "door"], ["light", "sensor"], ["key", "door"]];
      const ra = steps.map(([c, w]) => S.act(a, c, w) + JSON.stringify([a.swiped, a.charged, a.refused, a.doorB]));
      const rb = steps.map(([c, w]) => L.act(b, c, w) + JSON.stringify([b.swiped, b.charged, b.refused, b.doorB]));
      const wa = JSON.stringify(S.publicWorld({}, a)), wb = JSON.stringify({ ...L.publicWorld(L.fresh(), b) });
      check(`src/lab11.ts wire ${wire}: approves, refuses and opens like public/lab11.js`, ra.join() === rb.join() && JSON.parse(wa).doorB === JSON.parse(wb).doorB, ra.join(" "));
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
