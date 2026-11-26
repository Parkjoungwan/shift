// Checks room 5-2 "Phase drop": switching the phase drops the boxes ledge by ledge onto the plate,
// the order matters (anchor red too early and the box is stuck), the red bridge over the live
// trench needs red solid, and the walking aid gets from the entrance to the lever once it all
// holds; the overseer's forgery is signed with a non-control shift and its "anchor first" is
// always a lie; the true phase is ctrl on the console. Runs the real step() at 60 fps with the
// shared rules. Usage: node test/lab15.test.mjs

import * as L from "../public/lab15.js";
import * as core from "../public/lab15core.js";
import { ALL_WORDS, TEMPLATES, cleanPhrase } from "../public/directives.js";

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
        if (Math.abs(dx) < 48 && input.jumpPressed) input.left = input.right = false;
        // like a player: no jump into a laser that fires in the next moment
        const inWay = L.traps.filter((tr) => tr.kind === "laser" && Math.min(p.x, tx) < tr.x1 && Math.max(p.x, tx) > tr.x0);
        if (input.jumpPressed && inWay.some((tr) => [0, 200, 400, 600, 800].some((d) => L.trapState(tr, t * 1000 + d).active))) {
          input.jumpPressed = input.left = input.right = false; held = false; input.jumpHeld = false;
        }
      }
      if (!p.ground && up && p.vy < 0 && Math.abs(dx) < 48 && p.y - 8 > ty) input.left = input.right = false;
      if (held && p.vy > 0) held = false;
      L.step(world, p, input, character, DT, t * 1000);
      t += DT;
      const trap = L.trapHit(L, p, t * 1000, world);
      if (trap) return { ok: false, trap, t, at: [Math.round(p.x), Math.round(p.y)] };
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : r.trap ? `${r.trap.kind} at ${r.at}` : `stuck at ${r.at} going to ${r.target}`);
const W = (s) => core.publicWorld({ lab: 15 }, s);
const CROSS = [[15 * T + 8, FLOOR]];
const CLIMB = [[23 * T, FLOOR], [25 * T + 8, 16 * T], [29 * T + 8, 12 * T], [31 * T + 8, 8 * T], [L.LEVER.x, L.LEVER.y]];

// ---------- the order ----------
{
  const s = core.newState(1);
  check("the room opens blue, the box up on its blue ledge, the gate shut", s.phase === "blue" && s.boxes[0].row === 8 && !core.gateOpen(s));
  check("blue: no red bridge, the trench is live", !route(W(s), L.newPlayer(), "tall", CROSS).ok);
  const steps = [core.act(s, "phase", "switch", 1), s.boxes[0].row, core.act(s, "phase", "switch", 1), s.boxes[0].row, core.act(s, "phase", "anchor:red", 1)];
  check("red drops the box onto the red ledge, blue drops it onto the plate, then anchor red", steps.join() === "switched,12,switched,19,anchored" && core.gateOpen(s), steps.join());
  const p = L.newPlayer();
  const r = route(W(s), p, "tall", [...CROSS, ...CLIMB]);
  check("walking aid: over the anchored red bridge, through the gate, up to the lever", r.ok && L.nearLever(p) && r.t < 30, fmt(r));
}
{
  const s = core.newState(1);
  core.act(s, "phase", "anchor:red", 1);
  core.act(s, "phase", "switch", 1); core.act(s, "phase", "switch", 1);
  check("anchor red first: the box stops on the red ledge and stays there", s.boxes[0].row === 12 && !core.gateOpen(s));
  core.act(s, "phase", "anchor:red", 2); // pulling the anchor out again
  check("...until the anchor comes out in blue: then it drops", s.phase === "blue" && s.boxes[0].row === 19 && core.gateOpen(s));
}

// ---------- more staff ----------
{
  const s = core.newState(2);
  check("tier 2: a second box, stacked blue, red, blue", s.boxes.length === 2 && s.needed === 2);
  const a = [core.act(s, "phase", "switch", 1), core.act(s, "phase", "switch", 1), core.act(s, "phase", "switch", 1)];
  check("two switches a shift: the third has to wait for the next phase shifter", a.join() === "switched,switched,limit" && !core.gateOpen(s));
  check("...whose one switch (red) drops box B the rest of the way", core.act(s, "phase", "switch", 2) === "switched" && core.gateOpen(s) && s.phase === "red");
  check("red at the end: the bridge is there without an anchor", L.solidAt(W(s), 8, 20) && route(W(s), L.newPlayer(), "tall", CROSS).ok);
}

// ---------- the rules ----------
{
  const s = core.newState(1);
  check("only the phase shifter switches or anchors", core.act(s, "tall", "switch", 1) === "bad" && core.act(s, "key", "anchor:red", 1) === "bad");
  core.act(s, "phase", "switch", 1); core.act(s, "phase", "switch", 1);
  const before = s.boxes[0].row;
  core.act(s, "phase", "switch", 2); core.act(s, "phase", "switch", 2);
  check("a box that fell never goes back up", s.boxes[0].row === before);
  check("the lever is locked while the gate is", core.publicWorld({ lab: 15, lever: true }, core.newState(1)).lever === false);
  for (const c of ["key", "phase"]) check(`${c}: cannot climb the shelves`, !route(W(Object.assign(core.newState(1), { anchor: "red", boxes: [{ col: 16, row: 19 }] })), L.newPlayer(), c, [...CROSS, ...CLIMB.slice(0, 2)], 10).ok);
}

// ---------- the overseer's forgery (S4, as in lab 5) ----------
{
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const r = rng(15);
  const CHARS = ["phase", "tall", "key", "control"];
  const ANCHOR = ALL_WORDS.indexOf("위상 닻"), FIRST = TEMPLATES.indexOf("{} 먼저"), BAN = TEMPLATES.indexOf("{} 금지");
  let bad = 0, controlSigned = 0, n = 0, truths = 0, anchorFirst = 0, anchorFirstWhenOpen = 0;
  for (let run = 0; run < 300; run++) {
    const s = core.newState(1 + (run % 3));
    const log = {};
    for (let id = 1; id <= 10; id++) {
      const character = CHARS[Math.floor(r() * CHARS.length)];
      log[id] = character;
      if (character === "phase") core.act(s, "phase", r() < 0.7 ? "switch" : r() < 0.5 ? "anchor:red" : "anchor:blue", id);
      if (character === "control") core.act(s, "control", "switch", id);
      const f = core.forge(s, { logId: id, character }, r);
      n++;
      if (!cleanPhrase(f.msg) || f.x !== core.FORGE_AT.x) bad++;
      if (f.logId && log[f.logId] === "control") controlSigned++;
      if (f.logId && !log[f.logId]) bad++;
      if (f.msg[0] === FIRST && f.msg[1] === ANCHOR) { anchorFirst++; if (core.gateOpen(s)) anchorFirstWhenOpen++; }
      const phaseWord = ALL_WORDS[f.msg[1]];
      const truth = f.msg[0] === TEMPLATES.indexOf("{} 있음") ? phaseWord === (s.phase === "blue" ? "청 위상" : "적 위상")
        : f.msg[0] === BAN ? !core.gateOpen(s)
        : f.msg[0] === FIRST ? false
        : phaseWord === core.EQUIP_WORD[core.neededNext(s)];
      if (truth) truths++;
    }
  }
  check("every forgery is a valid directive by the entrance", bad === 0, `${bad} of ${n}`);
  check("no forgery is signed with a control-desk shift's number", controlSigned === 0);
  check("about a third tell the truth", truths / n > 0.25 && truths / n < 0.42, `${(100 * truths / n).toFixed(0)} %`);
  check("\"위상 닻 먼저\" turns up, and only while the gate is shut (it is the lie that snags the box)", anchorFirst > 0 && anchorFirstWhenOpen === 0, `${anchorFirst}`);
  // following it: anchor red, then the two switches; the box stays on its red ledge
  const s = core.newState(1);
  core.act(s, "phase", "anchor:red", 1); core.act(s, "phase", "switch", 1); core.act(s, "phase", "switch", 1);
  check("...and following it costs the shift: the gate stays shut", !core.gateOpen(s));
  check("the phase shifter who did that is now a name the overseer can sign with", core.forgers(s).includes(1) && !("seen" in core.publicWorld({ lab: 15 }, s)));
}

// ---------- clearance: the true phase is the control desk's ----------
{
  const leaks = [];
  for (const anchor of [null, "blue", "red"]) for (const tier of [1, 2]) {
    const st = core.newState(tier);
    const a = L.schematic({ world: W({ ...st, phase: "blue", anchor }) });
    const b = L.schematic({ world: W({ ...st, phase: "red", anchor }) });
    a.map.forEach((it, i) => { if (!it.ctrl && JSON.stringify(it) !== JSON.stringify(b.map[i])) leaks.push(it.text ?? it.label); });
    a.status.forEach((row, i) => { if (!row.ctrl && JSON.stringify(row) !== JSON.stringify(b.status[i])) leaks.push(row.label); });
  }
  check("with the boxes where they are, nothing that differs between the phases is on the public console", leaks.length === 0, leaks.join(", "));
  const w = (phase) => W({ ...core.newState(1), phase });
  const n1 = L.narrate(w("blue"), w("red")), n2 = L.narrate(w("red"), w("blue"));
  check("the overseer's line about a switch does not say which phase", n1 && n1 === n2);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
