// Checks room 4-2 "Echo choreography": the catch (a badge plate does not count the echo, who has
// clocked out), shown first by the training echo where it costs nothing; that a worker alone gets
// past the badge door but never the weight door; that for every opening (which plate reads badges)
// and every tier, an echo left on the weight plate lets a plain walk through both doors and up to
// the lever, while the veteran's echo on the badge plate does not; and that the plate types, wiring
// and delays are ctrl on the console. Runs the real step() at 60 fps with the shared echo rules.
// Usage: node test/lab14.test.mjs

import { readFileSync } from "node:fs";
import * as L from "../public/lab14.js";
import { recordEcho, onPlate } from "../public/lab4core.js";

const DT = 1 / 60, T = L.T, FLOOR = L.FLOOR, STEP = 1000 / 60;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}
const mid = (pl) => (pl.x0 + pl.x1) / 2;
const world = (badge, tier, echo = null) => L.publicWorld({ ...L.fresh(), echo }, { tier, badge, delays: L.delaysFor(tier, badge) });
const shut = (w, door, now) => L.solidAt(w, door, 18, null, undefined, now);

/** The echo recorder's shift: walk right from the entrance to plate `target` and stand there; its last 8 s become the echo. */
function record(w, target, start = 100_000) {
  const p = L.newPlayer(), samples = [];
  let t = start;
  for (let f = 0; f < 60 * 20; f++, t += STEP) {
    L.step(w, p, { right: p.x < mid(L.PLATES[target]) - 2 }, "echo", DT, t);
    samples.push({ t, x: p.x, y: p.y, f: 1 });
  }
  return { echo: recordEcho(samples, t), on: onPlate(p, L.PLATES[target]) };
}

/** A plain walk right from the entrance (no waiting, no timing); true if it got past door 2. */
function walk(w, start, character = "tall") {
  const p = L.newPlayer();
  let t = start;
  for (let f = 0; f < 60 * 15; f++, t += STEP) {
    L.step(w, p, { right: true }, character, DT, t);
    if (p.x > 26 * T + 8) return { ok: true, p, t };
  }
  return { ok: false, p, t };
}

// ---------- the rules of a room opening ----------
{
  const drawn = new Set([0, 0.3, 0.49, 0.5, 0.7, 0.999].map((r) => L.newState(1, () => r).badge));
  check("which plate reads badges is drawn per opening: either can", drawn.has(0) && drawn.has(1));
  for (const tier of [1, 2, 3]) {
    for (const badge of [0, 1]) {
      const st = L.newState(tier, () => (badge ? 0.9 : 0.1));
      const w = L.publicWorld(L.fresh(), st);
      if (w.badge !== badge || w.delays[badge] !== L.BADGE_DELAY[tier - 1] || w.delays[1 - badge] !== L.WEIGHT_DELAY[tier - 1]) check(`tier ${tier}, badge plate ${badge + 1}: the world carries the server's plate types and delays`, false);
    }
  }
  const st = L.newState(1, () => 0.1);
  L.retier(st, 3);
  check("a new tier keeps the opening's badge plate and shortens both delays", st.badge === 0 && st.delays[0] === L.BADGE_DELAY[2] && st.delays[1] === L.WEIGHT_DELAY[2]);
  const forged = L.publicWorld({ ...L.fresh(), badge: 0, delays: [9000, 9000] }, { tier: 1, badge: 1, delays: L.delaysFor(1, 1) });
  check("a worker cannot rewrite the plate types or the delays", forged.badge === 1 && forged.delays[0] === L.WEIGHT_DELAY[0]);
  check("more staff: the doors close sooner", L.BADGE_DELAY.every((d, i) => !i || d < L.BADGE_DELAY[i - 1]) && L.WEIGHT_DELAY.every((d, i) => !i || d < L.WEIGHT_DELAY[i - 1]));
  const server = readFileSync(new URL("../src/lab14.ts", import.meta.url), "utf8");
  check("the server keeps the same delays", server.includes(`BADGE_DELAY = ${JSON.stringify(L.BADGE_DELAY).replace(/,/g, ", ")}`) && server.includes(`WEIGHT_DELAY = ${JSON.stringify(L.WEIGHT_DELAY).replace(/,/g, ", ")}`));
}

// ---------- the geometry behind the delays ----------
{
  // from the last moment on a plate to the body inside its door, at full run speed
  const runMs = (pl) => (((pl.door * T) - 5) - (pl.x1 + 5)) / L.P.run * 1000;
  const runs = L.PLATES.map(runMs);
  check("every plate is well back from its door", runs.every((ms) => ms > Math.max(...L.WEIGHT_DELAY) + 80), runs.map((ms) => ms.toFixed(0)).join(", ") + " ms");
  check("...and a badge door waits well past that run (no fast hands needed)", runs.every((ms) => Math.min(...L.BADGE_DELAY) > ms + 500));
}

// ---------- the catch, and the training echo that shows it first ----------
for (const badge of [0, 1]) {
  const weight = 1 - badge, B = L.PLATES[badge], Wp = L.PLATES[weight];
  const still = (pl) => recordEcho([{ t: 0, x: mid(pl), y: FLOOR, f: 1 }], 50_000);
  const tag = `badge plate ${badge + 1}`;
  {
    const w = world(badge, 1, still(Wp));
    check(`${tag}: an echo on the weight plate holds its door, for everyone`, [0, 3000, 7999, 20000].every((dt) => !shut(w, Wp.door, 50_000 + dt)));
  }
  {
    const w = world(badge, 1, still(B));
    check(`${tag}: an echo on the badge plate holds nothing (it has clocked out)`, [0, 3000, 7999, 20000].every((dt) => shut(w, B.door, 50_000 + dt)));
    check(`${tag}: ...and the Supervisor says why when that echo is recorded`, /판독기/.test(L.narrate(world(badge, 1), w) ?? ""));
  }
  {
    // the training echo: on the badge plate from the start, its door never moves; gone with the first real echo
    const w = world(badge, 1);
    let onIt = 0, open = 0;
    for (let t = 0; t < 8000; t += 100) { onIt += onPlate(L.demoAt(w, t), B); open += !shut(w, B.door, t); }
    check(`${tag}: a fresh room shows the training echo standing on the badge plate while its door stays shut`, onIt > 50 && open === 0, `${onIt * 100} ms on the plate`);
    check(`${tag}: ...it opens nothing anywhere`, [0, 1].every((i) => [0, 2000, 6000].every((t) => shut(w, L.PLATES[i].door, t))));
    check(`${tag}: ...and gives way to the first real echo`, L.demoAt(world(badge, 1, still(Wp)), 0) === null);
  }
  {
    // a live worker on the plates
    const w = world(badge, 1);
    const on = (pl) => ({ ...L.newPlayer(), x: mid(pl), y: FLOOR });
    check(`${tag}: a worker standing on either plate opens its door`, !L.solidAt(w, B.door, 18, on(B), undefined, 0) && !L.solidAt(w, Wp.door, 18, on(Wp), undefined, 0));
    const hint = L.hint(w, on(B), "echo");
    check(`${tag}: standing on the badge plate, the field is told it reads only workers on shift`, /사번/.test(hint), hint);
  }
}

// ---------- every opening, every tier: the plan, the veteran's plan, and a worker alone ----------
for (const tier of [1, 2, 3]) {
  for (const badge of [0, 1]) {
    const weight = 1 - badge, tag = `tier ${tier}, badge plate ${badge + 1}`;
    // the echo recorder can reach either plate (through the badge door on its own badge)
    const right = record(world(badge, tier), weight);
    const wrong = record(world(badge, tier), badge);
    check(`${tag}: the echo recorder reaches the weight plate and the badge plate`, right.on && wrong.on);
    // the walking aid just walks: both doors, no waiting
    let ok = 0;
    for (let s = 0; s < 8000; s += 500) ok += walk(world(badge, tier, right.echo), 500_000 + s).ok;
    check(`${tag}: echo on the weight plate -> a plain walk gets through both doors, whenever it starts`, ok === 16, `${ok}/16 starts`);
    let vet = 0;
    for (let s = 0; s < 8000; s += 500) vet += walk(world(badge, tier, wrong.echo), 500_000 + s).ok;
    check(`${tag}: the veteran's echo on the badge plate -> nobody gets past the weight door`, vet === 0, `${vet}/16 starts`);
    // nobody gets through with no echo at all: step on the weight plate, then run for it
    const w = world(badge, tier);
    let t = 900_000, through = false;
    const p = { ...L.newPlayer(), x: mid(L.PLATES[weight]) + 4, y: FLOOR };
    p.heldAt = []; p.heldAt[badge] = t; // the badge door is open too: the worker just stepped on its plate

    for (let f = 0; f < 60 * 4; f++, t += STEP) {
      L.step(w, p, { right: true }, "tall", DT, t);
      if (p.x > L.PLATES[weight].door * T + 16 + 6) { through = true; break; }
    }
    check(`${tag}: a worker alone cannot step off the weight plate and beat its door`, !through, `stopped at x ${Math.round(p.x)}`);
    let solo = 0;
    for (let s = 0; s < 8000; s += 1000) solo += walk(world(badge, tier), 700_000 + s).ok;
    check(`${tag}: with no echo at all, nobody walks through`, solo === 0);
  }
}

// ---------- the climb ----------
{
  const p = { ...L.newPlayer(), x: 26 * T + 8, y: FLOOR };
  let t = 0, held = false, i = 0;
  const way = [[27 * T, FLOOR], [29 * T + 8, 16 * T], [33 * T + 8, 12 * T], [L.LEVER.x, L.LEVER.y]];
  for (; t < 20 && i < way.length; t += DT) {
    const [tx, ty] = way[i], dx = tx - p.x, up = ty < p.y - 4;
    const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
    if (up && p.ground && Math.abs(dx) < 90 && Math.abs(dx) >= 20) { input.jumpPressed = held = input.jumpHeld = true; }
    if (up && p.ground && Math.abs(dx) < 20) { input.left = dx >= 0; input.right = dx < 0; }
    if (held && p.vy > 0) held = false;
    L.step(L.fresh(), p, input, "tall", DT, t * 1000);
    if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) i++;
  }
  check("walking aid: up the shelves to the lever", i === way.length && L.nearLever(p), `${t.toFixed(1)} s`);
  check("no echo, no clear", !L.canClear({}, { lever: true }) && L.canClear({}, { lever: true, echo: { at: 0 } }));
}

// ---------- who sees what ----------
{
  const leaks = [];
  for (const [a, b] of [[world(0, 1), world(1, 1)], [world(0, 1), world(0, 3)], [world(1, 3), world(0, 2)]]) {
    const sa = L.schematic({ world: a, now: 0, actor: null }), sb = L.schematic({ world: b, now: 0, actor: null });
    sa.map.forEach((it, i) => { if (!it.ctrl && JSON.stringify(it) !== JSON.stringify(sb.map[i])) leaks.push(it.text ?? it.label ?? it.kind); });
    sa.status.forEach((row, i) => { if (!row.ctrl && JSON.stringify(row) !== JSON.stringify(sb.status[i])) leaks.push(row.label); });
  }
  check("the plate types and the delays are not on the public console (all of it is ctrl)", leaks.length === 0, leaks.join(", "));
  const s = L.schematic({ world: world(0, 2), now: 0, actor: null });
  check("...the control desk reads which plate reads badges and both delays", s.status.some((r) => r.ctrl && r.state.includes("2.6")) && s.map.some((it) => it.ctrl && /사번/.test(it.text ?? "")));
  check("...and the wiring is ctrl", s.map.filter((it) => it.kind === "wire").every((it) => it.ctrl) && s.map.some((it) => it.kind === "wire"));
  check("...in no more than six status rows (the console shows six)", s.status.length <= 6);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
