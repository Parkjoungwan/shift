// Checks lab 5 "Signature": the bridge and the steps answer to the phase and the anchor, the
// shock floor catches whoever the bridge drops, the walking aid needs both colours at once, the
// phase shifter can arrange that within its two switches from either starting phase, the
// overseer's forged directive is always disproved by the shift log (signed with a non-control
// shift) while telling the truth a third of the time, and the true phase is ctrl on the console.
// Runs the real step() at 60 fps.
// Usage: node test/lab5.test.mjs

import * as L from "../public/lab5.js";
import { ALL_WORDS, TEMPLATES, phraseText } from "../public/directives.js";

const DT = 1 / 60, T = L.T, FLOOR = 20 * T, LEDGE = 11 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller through waypoints [x, feetY]; jumps when the target is above. Stops on a trap. */
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
      const trap = L.trapHit(L, p, t * 1000);
      if (trap) return { ok: false, trap, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : r.trap ? `${r.trap.kind} at ${r.at}` : `stuck at ${r.at} going to ${r.target}`);
const world = (extra) => ({ ...L.fresh(), ...extra });

const ACROSS = [[19 * T + 8, FLOOR]];
const UP = [[24 * T + 8, 17 * T], [26 * T + 8, 14 * T], [31 * T, LEDGE]];
const TO_LEVER = [[37 * T + 8, LEDGE], [35 * T + 8, 7 * T], [L.LEVER.x, L.LEVER.y]];

// ---------- the bridge and the shock floor ----------
{
  const p = L.newPlayer();
  const r = route(world({ phase: "blue" }), p, "key", [...ACROSS, [L.TERMINAL.x, FLOOR]]);
  check("blue phase: the card crosses the bridge to the terminal", r.ok && L.nearTerminal(p), fmt(r));
  const r2 = route(world({ phase: "red" }), L.newPlayer(), "key", ACROSS);
  check("red phase, no anchor: the bridge is gone and the shock floor catches you", !r2.ok && r2.trap?.kind === "shock", fmt(r2));
  const r3 = route(world({ phase: "red", anchor: "blue" }), L.newPlayer(), "key", ACROSS);
  check("red phase with the blue anchor: the bridge stays", r3.ok, fmt(r3));
}

// ---------- both colours at once ----------
{
  const p = L.newPlayer();
  const r = route(world({ phase: "red", anchor: "blue" }), p, "tall", [...ACROSS, ...UP]);
  check("blue anchored, red phase: the walking aid crosses and climbs to door D", r.ok, fmt(r));
  const shut = route(world({ phase: "red", anchor: "blue" }), { ...p }, "tall", TO_LEVER.slice(0, 1), 4);
  check("door D shut: no way past", !shut.ok);
  const p2 = { ...p }, w = world({ phase: "red", anchor: "blue", door: true });
  const r2 = route(w, p2, "tall", TO_LEVER, 40);
  check("door D open: the walking aid climbs the shelves to the lever", r2.ok && L.nearLever(p2), fmt(r2));
  const total = route(world({ phase: "red", anchor: "blue", door: true }), L.newPlayer(), "tall", [...ACROSS, ...UP, ...TO_LEVER]);
  check("the walking aid's whole shift fits in 60 s", total.ok && total.t < 30, fmt(total));
  const key = { ...p };
  const r3 = route(world({ phase: "red", anchor: "blue", door: true }), key, "key", TO_LEVER, 8);
  check("the card cannot climb the 4-tile shelves", !r3.ok);
}
{
  const r = route(world({ phase: "blue" }), L.newPlayer(), "tall", [...ACROSS, ...UP], 10);
  check("blue phase, no anchor: no red steps, no way up", !r.ok);
  const r2 = route(world({ phase: "red", anchor: "red" }), L.newPlayer(), "tall", ACROSS);
  check("red anchored, red phase: still no bridge", !r2.ok && r2.trap?.kind === "shock");
}

// ---------- the phase shifter can set it up from either start ----------
for (const start of ["blue", "red"]) {
  const s = L.newState(1, () => (start === "blue" ? 0.1 : 0.9));
  const ID = 7;
  const w = () => L.publicWorld({ lab: 5 }, s);
  const p = L.newPlayer();
  const steps = [];
  if (!L.bridgeUp(w())) steps.push(L.act(s, "phase", "switch", ID)); // make the bridge to cross
  const r = route(w(), p, "phase", [[L.SOCKETS.blue.x, FLOOR]]);
  steps.push(L.act(s, "phase", "anchor:blue", ID));
  if (!L.stepsUp(w())) steps.push(L.act(s, "phase", "switch", ID));
  const ok = r.ok && steps.every((x) => x !== "limit" && x !== "bad") && L.bridgeUp(w()) && L.stepsUp(w());
  check(`starting ${start}: the phase shifter leaves both colours solid within 2 switches`, ok, `${steps.join(", ")}; ${fmt(r)}`);
}

// ---------- the rules ----------
{
  const s = L.newState(1, () => 0.1);
  check("only the phase shifter switches", L.act(s, "key", "switch", 1) === "bad");
  check("two switches a shift", L.act(s, "phase", "switch", 1) === "switched" && L.act(s, "phase", "switch", 1) === "switched" && L.act(s, "phase", "switch", 1) === "limit");
  check("...and two more for the next phase-shifter shift", L.act(s, "phase", "switch", 2) === "switched");
  check("one anchor: planting it elsewhere moves it, planting it again pulls it", L.act(s, "phase", "anchor:blue", 2) === "anchored" && L.act(s, "phase", "anchor:red", 2) === "anchored" && s.anchor === "red" && L.act(s, "phase", "anchor:red", 2) === "released" && s.anchor === null);
  check("tier 1: one card signature opens door D", L.act(s, "key", "sign", 3) === "open" && L.publicWorld({}, s).door);
  const t3 = L.newState(3);
  check("tier 3: three signatures from three different card shifts", L.act(t3, "key", "sign", 1) === "signed" && L.act(t3, "key", "sign", 1) === "already" && L.act(t3, "key", "sign", 2) === "signed" && L.act(t3, "key", "sign", 3) === "open");
  const locked = L.newState(1);
  check("the lever is locked while door D is", L.publicWorld({ lab: 5, lever: true }, locked).lever === false && !L.canClear(locked, { lever: true }));
}

// ---------- the overseer's forgery (S4): checkable against the record, not at a glance ----------
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); // small LCG, repeatable
const PHASE_WORDS = { blue: ALL_WORDS.indexOf("청 위상"), red: ALL_WORDS.indexOf("적 위상") };
const EQUIP_IDX = Object.fromEntries(Object.entries(L.EQUIP_WORD).map(([c, w]) => [ALL_WORDS.indexOf(w), c]));
/** What a forged directive claims, and whether that is true of the state. */
function claim(state, msg) {
  if (msg[0] === TEMPLATES.indexOf("{} 있음")) {
    const says = msg[1] === PHASE_WORDS.blue ? "blue" : msg[1] === PHASE_WORDS.red ? "red" : null;
    return { kind: "phase", ok: !!says, truth: says === state.phase };
  }
  if (msg[0] === TEMPLATES.indexOf("다음 근무자는 {}")) {
    const c = EQUIP_IDX[msg[1]];
    return { kind: "equip", ok: !!c, c, truth: c === L.neededNext(state) };
  }
  return { kind: "?", ok: false };
}
{
  // a day's log at this room: shift numbers and equipment, the control desk among them
  const r = rng(5);
  const CHARS = ["phase", "key", "tall", "light", "control"];
  let bad = 0, unsignedLate = 0, truths = 0, n = 0, controlSigned = 0, wastedOk = true, neededOk = true, kinds = new Set(), sameTruth = new Set();
  for (let run = 0; run < 400; run++) {
    const s = L.newState(1 + (run % 3), r);
    const log = {};
    for (let id = 1; id <= 12; id++) {
      const character = CHARS[Math.floor(r() * CHARS.length)];
      log[id] = character;
      // what the shift does here, if it can: the server records it through act()
      if (character === "phase") L.act(s, "phase", r() < 0.5 ? "switch" : r() < 0.5 ? "anchor:blue" : "anchor:red", id);
      if (character === "key") L.act(s, "key", "sign", id);
      if (character === "control") L.act(s, "control", "switch", id); // "bad": a control shift never counts
      const f = L.forge(s, { logId: id, character }, r);
      const c = claim(s, f.msg);
      n++;
      if (!c.ok || f.x !== L.FORGE_AT.x || f.y !== L.FORGE_AT.y) bad++;
      if (f.logId && log[f.logId] === "control") controlSigned++;
      if (f.logId && !log[f.logId]) bad++; // a number that is not in the log at all
      if (!f.logId && L.forgers(s, { logId: id, character }).length) unsignedLate++;
      if (c.truth) truths++;
      kinds.add(c.kind);
      sameTruth.add(`${c.kind}:${c.truth}`);
      const w = L.publicWorld({ lab: 5 }, s);
      if (c.kind === "equip" && !c.truth && !L.useless(w, c.c)) wastedOk = false;
      if (c.kind === "equip" && c.truth && L.useless(w, c.c)) neededOk = false;
    }
  }
  check("every forgery is a valid directive from the fixed lists, by the entrance", bad === 0, `${bad} bad of ${n}`);
  check("no forgery is ever signed with a control-desk shift's number: the log disproves every signature", controlSigned === 0, `${controlSigned}`);
  check("a forgery is unsigned only while nobody of this opening has done anything", unsignedLate === 0);
  check("about a third of the forgeries tell the truth: contradicting the lamp is no rule", truths / n > 0.25 && truths / n < 0.42, `${(100 * truths / n).toFixed(0)} %`);
  check("forgeries claim the phase and the next equipment, each both truthfully and falsely", ["phase:true", "phase:false", "equip:true", "equip:false"].every((k) => sameTruth.has(k)), [...sameTruth].join(" "));
  check("a lying forgery sends the next worker with equipment that cannot move the room", wastedOk);
  check("a truthful one names equipment that can", neededOk);
}
{
  const s = L.newState(1, () => 0.1);
  check("a fresh opening: the first forgery has nobody to impersonate but the shift that just ended", L.forge(s, { logId: 4, character: "tall" }, () => 0).logId === 4 && L.forge(s, { logId: 4, character: "control" }, () => 0).logId === 0);
  L.act(s, "phase", "switch", 9);
  check("once a phase shifter has acted, every forgery is signed (the same paper as a controller's)", [0, 0.3, 0.7, 0.99].every((x) => L.forge(s, null, () => x).logId === 9));
  check("a refused act leaves no name to sign with", L.act(s, "key", "switch", 11) === "bad" && !L.forgers(s).includes(11));
  for (let id = 20; id < 30; id++) L.act(s, "key", "sign", id);
  check("the overseer remembers only the last few shifts", L.forgers(s).length === L.SEEN_MAX && L.forgers(s).every((x) => x >= 30 - L.SEEN_MAX));
  check("the remembered shifts never reach the clients", !("seen" in L.publicWorld({ lab: 5 }, s)));
  const old = { phase: "red", anchor: null, signs: [], needed: 1, used: { logId: 0, n: 0 } }; // a state saved before this change
  check("a state saved before forgeries were signed still works", L.forge(old, null, () => 0.9).logId === 0 && L.act(old, "phase", "switch", 3) === "switched" && L.forgers(old)[0] === 3);
}

// ---------- the server's copy (src/lab5.ts) agrees, where this Node can load TypeScript ----------
{
  let S = null;
  try { S = await import("../src/lab5.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab5.ts parity (run with node --experimental-strip-types to include it)");
  else {
    const r1 = rng(77), r2 = rng(77);
    let same = true;
    for (let i = 0; i < 300 && same; i++) {
      const st = { phase: i % 2 ? "blue" : "red", anchor: [null, "blue", "red"][i % 3], signs: i % 4 ? [] : [1], needed: 1, used: { logId: 0, n: 0 }, seen: i % 5 ? [{ logId: 3, character: "key" }, { logId: 8, character: "phase" }] : [] };
      const ended = { logId: 10 + i, character: ["phase", "key", "tall", "light", "control"][i % 5] };
      const a = L.forge(structuredClone(st), ended, r1), b = S.forge(structuredClone(st), ended, r2);
      same = JSON.stringify(a) === JSON.stringify(b);
      const sa = structuredClone(st), sb = structuredClone(st);
      same &&= L.act(sa, "phase", "switch", 40 + i) === S.act(sb, "phase", "switch", 40 + i) && JSON.stringify(sa) === JSON.stringify(sb);
    }
    check("src/lab5.ts forges and remembers exactly like public/lab5.js", same);
  }
}

// ---------- clearance: the true phase is the control desk's ----------
{
  let leaks = [];
  for (const anchor of [null, "blue", "red"]) for (const door of [false, true]) {
    const a = L.schematic({ world: world({ phase: "blue", anchor, door, signs: door ? 1 : 0 }) });
    const b = L.schematic({ world: world({ phase: "red", anchor, door, signs: door ? 1 : 0 }) });
    a.map.forEach((it, i) => { if (!it.ctrl && JSON.stringify(it) !== JSON.stringify(b.map[i])) leaks.push(it.text ?? it.label); });
    a.status.forEach((row, i) => { if (!row.ctrl && JSON.stringify(row) !== JSON.stringify(b.status[i])) leaks.push(row.label); });
  }
  check("nothing that differs between the two phases is on the public console (all of it is ctrl)", leaks.length === 0, leaks.join(", "));
  const sch = L.schematic({ world: world({ phase: "blue" }) });
  check("...and the room's phase row is there for the control desk", sch.status.some((r) => r.ctrl && r.label.includes("위상")));
  const n1 = L.narrate(world({ phase: "blue" }), world({ phase: "red" })), n2 = L.narrate(world({ phase: "red" }), world({ phase: "blue" }));
  check("the overseer's line about a switch, which everyone hears, does not say which phase", n1 && n1 === n2);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
