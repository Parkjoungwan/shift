// Checks lab 6 "Night shift" and room 6-2 "Scheduled maintenance": the drop grates (a stepped
// grate drops 0.6 s later, a cracked one at once, onto the shock floor), that the card can cross
// any dealt set by hopping the cracked grates if it knows them, that a blind run or a stop on the
// bridge ends on the shock floor, that the light reads every grate from its bridge without
// touching one, that a crossing leaves the bridge unusable until it is re-hung, the winches and
// the slip, door D, the walking aid's shelves, and room 6-2's clock: re-hung at every :00, the
// cracked set moved by the step, readable from two minutes. Runs the real step() at 60 fps.
// Usage: node test/lab6.test.mjs

import * as L6 from "../public/lab6.js";
import * as L16 from "../public/lab16.js";
import * as core from "../public/lab6core.js";
import * as E from "../public/engine.js";

const DT = 1 / 60, T = 16, FLOOR = 20 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

// a fixed random source, so a failure can be replayed
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const BASE = Date.UTC(2026, 11, 1, 3, 0, 0); // a server time at a minute's :00

/** One frame: move, let the room see the feet (falls), check the traps. */
function frame(L, world, p, input, character, now) {
  L.step(world, p, input, character, DT, now);
  L.tick({ world, p, now, character, change: (fn) => fn(world), act: () => {}, say: () => {} });
  return L.trapHit(L, p, now, world);
}

/**
 * Walks to (tx, ty) along floors and shelves (the lab tests' usual autopilot). Returns { ok, t }.
 * Traps are not checked here (lasers are checked for every lab in test/traps.test.mjs).
 */
function route(L, world, p, character, waypoints, t0 = BASE, limit = 25) {
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
      L.step(world, p, input, character, DT, t0 + t * 1000);
      t += DT;
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t };
}

/** How far a jump at full speed carries, by how many frames the jump key is held (flat ground). */
const HOPS = {};
for (const c of ["key", "tall", "light"]) {
  HOPS[c] = [];
  for (let h = 0; h <= 30; h++) {
    const lab = { solidAt: (_w, _tx, ty) => ty >= 20, tileAt: () => 0 };
    const p = { x: 100, y: FLOOR, vx: 140, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
    for (let f = 0; f < 200; f++) {
      E.step(lab, {}, p, { right: true, jumpPressed: f === 0, jumpHeld: f < h }, c, DT, 0);
      if (f > 2 && p.ground) break;
    }
    HOPS[c].push(p.x - 100);
  }
}

/**
 * Runs across the grate row to the far bank. knows(now): the cracked grates this worker believes
 * in (null: runs blind). Like a player, it times each hop to land on the next grate it trusts;
 * it does not react to a grate dropping under it. Returns { ok, t, hit, at }.
 */
function cross(L, world, p, character, knows, t0, limit = 12, react = false) {
  const room = L.id;
  const far = (L.X1 + 1) * T;
  const downAtStart = new Set([...Array(core.N).keys()].filter((i) => core.isDown(world, i, t0)));
  let t = 0, hold = 0, f = 0;
  while (t < limit) {
    const now = t0 + t * 1000;
    // react: also hop any grate seen gone, with no reaction delay at all (better than any person)
    const seen = react ? [...Array(core.N).keys()].filter((i) => core.isDown(world, i, now)) : [];
    const bad = new Set([...(knows ? knows(now) : []), ...downAtStart, ...seen]);
    const front = p.x + 5;
    let jump = false;
    if (p.ground && hold <= 0) {
      for (let i = 0; i < core.N; i++) {
        const g = core.grateSpan(room, i);
        const gap = g.x0 - front;
        if (!(gap >= -2 && gap < 5 && bad.has(i))) continue;
        // the run of grates to clear, and the middle of the first one after it
        let k = i;
        while (k < core.N && bad.has(k)) k++;
        const target = k < core.N ? (core.grateSpan(room, k).x0 + core.grateSpan(room, k).x1) / 2 : far + 8;
        const want = target - p.x;
        const hops = HOPS[character];
        let best = 0;
        for (let h = 0; h < hops.length; h++) if (Math.abs(hops[h] - want) < Math.abs(hops[best] - want) || (k >= core.N && hops[h] > hops[best])) best = h;
        hold = best + 1;
        jump = true;
        break;
      }
    }
    const input = { right: p.x < far, left: false, jumpPressed: jump, jumpHeld: hold > 0 && (jump || hold > 0) };
    const hit = frame(L, world, p, input, character, now);
    if (hold > 0) hold--;
    t += DT; f++;
    if (hit) return { ok: false, t, hit: hit.kind, at: Math.round(p.x) };
    if (p.ground && p.x >= far && Math.abs(p.y - FLOOR) < 1) return { ok: true, t };
  }
  return { ok: false, t, hit: null, at: Math.round(p.x) };
}
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : `${r.hit ? "hit " + r.hit : "stuck"} at x ${r.at ?? r.target}`);

/** The world everyone sees for a fresh opening of the room. */
function opening(L, tier, state = L.local.newState(tier)) {
  return { state, world: L.local.publicWorld(L.fresh(), state) };
}
const toBank = (L) => [[(L.X0 - 1) * T, FLOOR]];

// ---------- the cracked sets ----------
for (const tier of [1, 2, 3]) {
  let runs = 0, wrongCount = 0, sym = 0;
  for (let k = 0; k < 300; k++) {
    const s6 = core.dealCracks(tier, rand);
    const s16 = core.dealCracks(tier, rand, true);
    if (s6.length !== core.crackCount(tier) || s16.length !== core.crackCount(tier)) wrongCount++;
    const run3 = (s, cyc) => [...Array(core.N).keys()].some((i) => (cyc || i + 2 < core.N) && [0, 1, 2].every((d) => s.includes((i + d) % core.N)));
    if (run3(s6, false) || run3(s16, true)) runs++;
    for (let r = 1; r < core.N; r++) if (core.rotate(s16, r).join() === s16.join()) sym++;
  }
  check(`tier ${tier}: ${core.crackCount(tier)} cracked grates a time`, !wrongCount);
  check(`tier ${tier}: never three cracked in a row (a 6-tile gap is the walking aid's only)`, !runs);
  check(`tier ${tier}: room 6-2 never deals a set that looks the same after a move (the step can be read)`, !sym);
}

for (const L of [L6, L16]) {
  const tag = L.id === 6 ? "lab 6" : "6-2";
  check(`${tag}: the entrance is clear of the grates`, L.SPAWN.x < L.X0 * T);

  // ---------- the grates ----------
  {
    const { world } = opening(L, 1);
    const sound = [...Array(core.N).keys()].find((i) => !core.crackedNow(world, BASE).includes(i));
    const g = core.grateSpan(L.id, sound);
    const p = { ...L.newPlayer(), x: (g.x0 + g.x1) / 2, y: FLOOR };
    let hit = null, t = 0;
    for (; t < 3 && !hit; t += DT) hit = frame(L, world, p, {}, "key", BASE + 1000 + t * 1000);
    check(`${tag}: standing still on a sound grate drops you onto the shock floor in about 1.2 s`, hit?.kind === "shock" && t > 1.15 && t < 1.7, `${t.toFixed(2)} s`);
    check(`${tag}: ...and the grate stays down`, core.isDown(world, sound, BASE + 5000));
  }
  {
    const { world } = opening(L, 1);
    const bad = core.crackedNow(world, BASE + 1000)[0];
    const g = core.grateSpan(L.id, bad);
    const p = { ...L.newPlayer(), x: (g.x0 + g.x1) / 2, y: FLOOR };
    let hit = null, t = 0;
    for (; t < 1 && !hit; t += DT) hit = frame(L, world, p, {}, "key", BASE + 1000 + t * 1000);
    check(`${tag}: a cracked grate drops at once`, hit?.kind === "shock" && t < 0.4, `${t.toFixed(2)} s`);
  }

  // ---------- the card crosses, if it knows the cracks ----------
  for (const tier of [1, 2, 3]) {
    let ok = 0, worst = 0, fails = [];
    for (let k = 0; k < 120; k++) {
      const { world } = opening(L, tier, L.local.newState(tier));
      const p = L.newPlayer();
      const t0 = BASE + 2000 + Math.floor(rand() * 40) * 1000; // any second of the minute, well before the next :00
      const walk = route(L, world, p, "key", toBank(L), t0);
      const r = cross(L, world, p, "key", (now) => core.crackedNow(world, now), t0 + walk.t * 1000);
      if (r.ok) { ok++; worst = Math.max(worst, walk.t + r.t); } else if (fails.length < 3) fails.push(`${core.crackedNow(world, t0).join(",")}: ${fmt(r)}`);
    }
    check(`${tag} tier ${tier}: the card crosses every dealt set, hopping the cracked grates (120 sets)`, ok === 120, `${ok}/120, slowest ${worst.toFixed(1)} s ${fails.join(" | ")}`);
  }
  {
    // blind: just running across, someone lands on a crack sooner or later
    let died = 0;
    for (let k = 0; k < 60; k++) {
      const { world } = opening(L, 2);
      const p = L.newPlayer();
      route(L, world, p, "key", toBank(L), BASE + 2000);
      if (!cross(L, world, p, "key", null, BASE + 4000).ok) died++;
    }
    check(`${tag}: running blind ends on the shock floor (${died}/60 at tier 2)`, died === 60);
    // even hopping the instant a grate ahead drops does not save a blind runner: a grate counts as
    // stepped on only once the body's centre is over it, and then it is gone from under the body
    let survived = 0;
    for (let k = 0; k < 60; k++) {
      const { world } = opening(L, 1);
      const p = L.newPlayer();
      route(L, world, p, "key", toBank(L), BASE + 2000);
      if (cross(L, world, p, "key", null, BASE + 4000, 12, true).ok) survived++;
    }
    check(`${tag}: ...even reacting at once to a grate dropping ahead (${survived}/60 got over at tier 1)`, survived === 0);
  }
  {
    // toes over the next grate do not step on it
    const { world } = opening(L, 1);
    const g = core.grateSpan(L.id, 0);
    const p = { ...L.newPlayer(), x: g.x0 - 4, y: FLOOR }; // on the bank, toes over grate 1
    for (let f = 0; f < 120; f++) frame(L, world, p, {}, "key", BASE + 1000 + f * 1000 / 60);
    check(`${tag}: standing at the bank's edge, toes over grate 1, leaves it alone`, (world.fall ?? []).every((v) => v == null));
  }
  {
    // door D lets the bridge down
    const s = L.local.newState(1);
    L.local.act(s, "key", "door", 1, Math.random, BASE + 5000);
    const w = L.local.publicWorld(L.fresh(), s);
    check(`${tag}: opening door D lets every grate down (safety interlock)`, core.standing(w, BASE + 5100).every((u) => !u));
    if (L.id === 16) check("6-2: ...until the next :00", core.standing(w, BASE + 60000).every(Boolean));
  }
  {
    // the crossing uses the bridge up: the next worker finds a gap no one can jump
    const { world } = opening(L, 1);
    const p = L.newPlayer();
    const t0 = BASE + 3000;
    const walk = route(L, world, p, "key", toBank(L), t0);
    const r = cross(L, world, p, "key", (now) => core.crackedNow(world, now), t0 + walk.t * 1000);
    const after = t0 + (walk.t + r.t) * 1000 + 3000;
    const down = core.standing(world, after).filter((u) => !u).length;
    check(`${tag}: after one crossing much of the bridge is down (${down}/${core.N})`, r.ok && down >= core.N / 2);
    const q = L.newPlayer();
    const w2 = route(L, world, q, "tall", toBank(L), after);
    const r2 = cross(L, world, q, "tall", (now) => core.crackedNow(world, now), after + w2.t * 1000, 6);
    check(`${tag}: ...and the walking aid cannot get over it`, !r2.ok, fmt(r2));
  }

  // ---------- the light reads every grate from its bridge, and touches none ----------
  {
    const { world } = opening(L, 3);
    const p = L.newPlayer();
    const bridge = 17 * T;
    const r = route(L, world, p, "light", [[(L.X0 - 1) * T, FLOOR], [(L.X0 + 1) * T, bridge], [(L.X1 - 1) * T, bridge]], BASE + 1000);
    // replay the walk to see which grates came within the beam
    const seen = new Set();
    const q = L.newPlayer();
    route(L, world, q, "light", [[(L.X0 - 1) * T, FLOOR], [(L.X0 + 1) * T, bridge]], BASE + 1000);
    for (let x = q.x; x <= (L.X1 - 1) * T; x += 4) {
      const c = { x, y: bridge - L.P.h / 2 };
      for (let i = 0; i < core.N; i++) {
        const g = core.grateSpan(L.id, i);
        if (Math.hypot((g.x0 + g.x1) / 2 - c.x, g.y - c.y) <= L.LIGHT_R) seen.add(i);
      }
    }
    check(`${tag}: the light gets onto its bridge and walks it to the far end`, r.ok, fmt(r));
    check(`${tag}: ...every grate comes within its beam on the way`, seen.size === core.N, [...seen].join(","));
    check(`${tag}: ...and no grate was touched`, core.standing(world, BASE + 20000).every(Boolean) && (world.fall ?? []).every((v) => v == null));
    const k = L.newPlayer();
    const rk = route(L, world, k, "key", [[(L.X0 - 1) * T, FLOOR], [(L.X0 + 1) * T, bridge]], BASE + 1000, 4);
    check(`${tag}: nobody but the light stands on the light's bridge`, !rk.ok);
  }

  // ---------- door D and the lever ----------
  {
    const { world } = opening(L, 1);
    const p = L.newPlayer();
    p.x = (L.X1 + 1) * T; // on the far bank
    const shelves = L.id === 6
      ? [[35 * T, 16 * T], [37 * T + 8, 12 * T], [35 * T, 8 * T], [L.LEVER.x, L.LEVER.y]]
      : [[33 * T, 16 * T], [36 * T + 8, 12 * T], [33 * T, 8 * T], [L.LEVER.x, L.LEVER.y]];
    check(`${tag}: door D shut: no way to the shelves`, !route(L, world, { ...p }, "tall", [[(L.DOOR_X + 1) * T + 8, FLOOR]], BASE, 5).ok);
    world.door = true;
    const r = route(L, world, { ...p }, "tall", [[(L.DOOR_X + 1) * T + 8, FLOOR], ...shelves], BASE);
    check(`${tag}: door D open: the walking aid climbs four shelves to the lever, in time`, r.ok && r.t < 15, fmt(r));
    for (const c of ["key", "light"]) check(`${tag}: ${c} cannot climb the shelves`, !route(L, world, { ...p }, c, [[(L.DOOR_X + 1) * T + 8, FLOOR], ...shelves.slice(0, 2)], BASE, 8).ok);
    const q = L.newPlayer(); q.x = L.PANEL.x; q.y = FLOOR;
    check(`${tag}: the card at door D's panel opens it`, /문 D/.test(L.hint(L.fresh(), q, "key")) || /D/.test(L.hint(L.fresh(), q, "key")));
  }

  // ---------- the rules ----------
  {
    const s = L.local.newState(1);
    check(`${tag}: only the card opens door D`, L.local.act(s, "tall", "door") === "bad" && L.local.act(s, "key", "door") === "open" && L.local.act(s, "key", "door") === "already");
    const w = L.local.publicWorld({ lab: L.id, door: false, cracked: [], base: [], step: 0, gen: 9, lever: true }, s);
    check(`${tag}: the world's door, cracks and step come from the server`, w.door === true && (L.id === 6 ? w.cracked.join() === s.cracked.join() && w.gen === s.gen : w.base.join() === s.base.join() && w.step === s.step));
    const s2 = L.local.newState(1);
    check(`${tag}: the lever counts only behind an open door`, L.local.publicWorld({ lever: true }, s2).lever === false && !L.local.canClear(s2, { lever: true }));
  }
}

// ---------- lab 6: the winches and the slip ----------
{
  const s = core.rules6.newState(2, rand);
  const before = s.cracked.join();
  const r = core.rules6.act(s, "key", "fix", 1, rand);
  const slip = r.startsWith("fixed:") ? r.split(":")[2].split(",").map(Number) : null;
  check("lab 6: the far winch re-hangs the grates with a new cracked set", s.gen === 1 && slip && slip.length === core.crackCount(2));
  check("lab 6: ...and its slip lists exactly the new cracked grates (1-based) with the re-hang number", slip?.join() === s.cracked.map((i) => i + 1).join() && r.split(":")[1] === "1", `${r} vs ${s.cracked}`);
  const keptSet = s.cracked.join();
  check("lab 6: the entrance winch hangs the same grates back (same cracks) and prints nothing", core.rules6.act(s, "key", "patch", 1, rand) === "patched" && s.gen === 2 && s.cracked.join() === keptSet);
  check("lab 6: only the card turns a winch", core.rules6.act(s, "light", "fix") === "bad" && core.rules6.act(s, "tall", "patch") === "bad");
  const line = L6.narrate({ lab: 6, gen: 0 }, { lab: 6, gen: 1 }) ?? "";
  check("lab 6: the slip is the card's own: the public line names the re-hang, never a grate", /1/.test(line) && !/·|불합격/.test(line), line);
  check("lab 6: the card reads the slip as a line of its own", /정비 2차/.test(L6.acted("fix", "fixed:2:1,4,7") ?? "") && /1·4·7/.test(L6.acted("fix", "fixed:2:1,4,7") ?? ""), L6.acted("fix", "fixed:2:1,4,7"));
  void before;
  // falls from before a re-hang do not count against the new grates
  const w = core.rules6.publicWorld({ lab: 6, fall: [5, 5, 5, null, null, null, null, null, null, null], fallGen: 0 }, s);
  check("lab 6: a re-hang clears the falls a client still carries", w.fall.every((v) => v == null) && w.fallGen === s.gen);
  const kept = core.rules6.publicWorld({ lab: 6, fall: [5, null, null, null, null, null, null, null, null, null], fallGen: s.gen }, s);
  check("lab 6: ...while falls on the current grates stay", kept.fall[0] === 5);
}
{
  // the whole relay: light reads (from the bridge), card crosses, opens D, re-hangs at the far winch,
  // the walking aid crosses with the slip and pulls the lever
  const L = L6;
  const state = L.local.newState(2);
  let world = L.local.publicWorld(L.fresh(), state);
  const read = core.crackedNow(world, BASE).slice();
  const p = L.newPlayer();
  let t0 = BASE + 20000;
  const walk = route(L, world, p, "key", toBank(L), t0);
  const r = cross(L, world, p, "key", () => read, t0 + walk.t * 1000);
  const toPanel = route(L, world, p, "key", [[L.PANEL.x, FLOOR], [L.WINCH.x, FLOOR]], t0 + (walk.t + r.t) * 1000);
  // door D first (it lets the bridge down), then the far winch
  L.local.act(state, "key", "door");
  const slip = L.local.act(state, "key", "fix");
  world = L.local.publicWorld(world, state);
  const cardTime = walk.t + r.t + toPanel.t;
  check("lab 6 relay: the card crosses with the light's note, opens D and re-hangs", r.ok && toPanel.ok && world.door && cardTime < 25, `${cardTime.toFixed(1)} s`);
  const fresh = slip.split(":")[2].split(",").map((n) => Number(n) - 1);
  check("lab 6 relay: the bridge is whole again", core.standing(world, BASE + 60000).every(Boolean));
  // the catch: the light's old note is wrong for the new grates
  const q = L.newPlayer();
  t0 = BASE + 70000;
  const w2 = route(L, world, q, "tall", toBank(L), t0);
  const r2 = cross(L, world, q, "tall", () => fresh, t0 + w2.t * 1000);
  const shelves = [[(L.DOOR_X + 1) * T + 8, FLOOR], [35 * T, 16 * T], [37 * T + 8, 12 * T], [35 * T, 8 * T], [L.LEVER.x, L.LEVER.y]];
  const up = route(L, world, q, "tall", shelves, t0 + (w2.t + r2.t) * 1000);
  check("lab 6 relay: the walking aid crosses with the card's slip and reaches the lever within a shift", r2.ok && up.ok && w2.t + r2.t + up.t < 40, `${(w2.t + r2.t + up.t).toFixed(1)} s`);
  // the other order: re-hang, then open D, and the interlock takes the new bridge down again
  {
    const s = L.local.newState(1);
    L.local.act(s, "key", "fix");
    L.local.act(s, "key", "door");
    const w = L.local.publicWorld(L.fresh(), s);
    check("lab 6: re-hanging before opening D is wasted (the interlock lets the new grates down)", core.standing(w, Date.now() + 100).every((u) => !u));
  }
  // with the light's note instead, sooner or later someone walks onto a new crack
  let died = 0;
  for (let k = 0; k < 40; k++) {
    const s = L.local.newState(2);
    const old = s.cracked.slice();
    L.local.act(s, "key", "fix");
    const w = L.local.publicWorld(L.fresh(), s);
    const z = L.newPlayer();
    route(L, w, z, "tall", toBank(L), BASE);
    if (!cross(L, w, z, "tall", () => old, BASE + 2000).ok) died++;
  }
  check(`lab 6: the light's note after a re-hang is a stale map (${died}/40 crossings with it end on the shock floor)`, died >= 16);
}

// ---------- room 6-2: the building's clock ----------
{
  const s = core.rules16.newState(2, rand);
  const w = core.rules16.publicWorld({}, s);
  const m0 = core.crackedNow(w, BASE + 5000), m1 = core.crackedNow(w, BASE + 65000);
  check("6-2: at every :00 the cracked set moves along the row by the step", m1.join() === core.rotate(m0, s.step).join() && m0.join() !== m1.join(), `${m0} -> ${m1} step ${s.step}`);
  // two minutes are enough to read the step: only one move maps the one onto the other
  const fits = [...Array(core.N).keys()].filter((k) => core.rotate(m0, k).join() === m1.join());
  check("6-2: two minutes in a row give exactly one possible step", fits.length === 1 && fits[0] === s.step, fits.join(","));
  // a fall from the last minute is forgotten at :00
  const g = core.grateSpan(16, 0);
  const world = { ...w, fall: core.cleanFall(null) };
  world.fall[0] = BASE + 50000;
  check("6-2: a grate stepped on at :50 is down at :55", core.isDown(world, 0, BASE + 55000));
  check("6-2: ...and back at :00", !core.isDown(world, 0, BASE + 60000));
  void g;
  // whole relay inside one minute window each: card crosses late in a minute, walking aid after the next :00
  const p = L16.newPlayer();
  const t0 = BASE + 35000;
  const walk = route(L16, world, p, "key", toBank(L16), t0);
  const r = cross(L16, world, p, "key", (now) => core.crackedNow(world, now), t0 + walk.t * 1000);
  check("6-2: the card crosses knowing the set and the clock", r.ok, fmt(r));
  world.door = true;
  const q = L16.newPlayer();
  const t1 = BASE + 61000; // the walking aid clocks in after the :00
  const w2 = route(L16, world, q, "tall", toBank(L16), t1);
  const r2 = cross(L16, world, q, "tall", (now) => core.crackedNow(world, now), t1 + w2.t * 1000);
  const up = route(L16, world, q, "tall", [[(L16.DOOR_X + 1) * T + 8, FLOOR], [33 * T, 16 * T], [36 * T + 8, 12 * T], [33 * T, 8 * T], [L16.LEVER.x, L16.LEVER.y]], t1 + (w2.t + r2.t) * 1000);
  check("6-2: the re-hung bridge carries the walking aid over (with the moved set) to the lever", r2.ok && up.ok, `${fmt(r2)} / ${up.ok ? "lever" : "stuck"}`);
  // with last minute's map instead of the rule, someone dies
  let died = 0;
  for (let k = 0; k < 40; k++) {
    const st = core.rules16.newState(2, rand);
    const ww = core.rules16.publicWorld({}, st);
    const z = L16.newPlayer();
    route(L16, ww, z, "tall", toBank(L16), BASE + 61000);
    if (!cross(L16, ww, z, "tall", () => core.crackedNow(ww, BASE + 30000), BASE + 63000).ok) died++;
  }
  check(`6-2: last minute's map is a stale map (${died}/40 crossings with it end on the shock floor)`, died >= 16);
  const board = [];
  const ctx = new Proxy({}, { get: (o, k) => (k === "fillText" ? (s) => board.push(s) : k === "measureText" ? (s) => ({ width: s.length * 5 }) : () => {}), set: () => true });
  L16.drawOverlay(ctx, { world: w, actor: null, cctv: true, now: BASE + 42000 });
  check("6-2: the maintenance board shows the next :00 on the building clock, to everyone", board.some((s) => s.includes("03:01:00")), board.join(" | "));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
