// Checks room 3-2 "Split code": the walking aid reads the plaque (an ORDER: six glyphs and a drawn
// path) and nobody else; the light reads the ultraviolet wall (a SET: four glyphs, no order) and
// nobody else; every plaque layout and path is drawable without words, unambiguous and solvable;
// one note alone fixes no position; the answer never reaches the public world; wrong entries lock
// the terminal for the shift and the third replaces both surfaces (gen / genAt / genWhy record it);
// the walking aid climbs to the lever behind door D.
// Runs the real step() at 60 fps. Usage: node test/lab13.test.mjs
// (node --experimental-strip-types test/lab13.test.mjs also checks src/lab13.ts against it)

import { readFileSync } from "node:fs";
import * as L from "../public/lab13.js";

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
      }
      if (!p.ground && up && p.vy < 0 && Math.abs(dx) < 48 && p.y - 8 > ty) input.left = input.right = false;
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
const PLAQUE_SPOT = [[10 * T, FLOOR], [6 * T + 8, 16 * T]];
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
const subsets = (xs, k) => (k === 0 ? [[]] : xs.length < k ? [] : [...subsets(xs.slice(1), k - 1).map((r) => [xs[0], ...r]), ...subsets(xs.slice(1), k)]);
const ALL = [0, 1, 2, 3, 4, 5];

// ---------- who can read what ----------
{
  const tall = L.newPlayer();
  const r = route(W(), tall, "tall", PLAQUE_SPOT);
  check("walking aid: climbs to the plaque's ledge and reads it", r.ok && L.readsPlaque(tall, "tall"), fmt(r));
  for (const c of ["key", "light"]) check(`${c}: cannot reach the plaque's ledge`, !route(W(), L.newPlayer(), c, PLAQUE_SPOT, 8).ok);
  const light = L.newPlayer();
  const r2 = route(W(), light, "light", [[L.UV.x, FLOOR]]);
  check("light: walks into the alcove and reads the ultraviolet wall", r2.ok && L.readsUV(light, "light"), fmt(r2));
  check("nobody else reads the wall, even standing there", !L.readsUV(light, "tall") && !L.readsUV(light, "key"));
  const st = L.newState(1);
  const hi = L.read(st, "tall"), uv = L.read(st, "light");
  check("the plaque is an order: layout, path, all six glyphs once", hi.part === "high" && hi.code.length === 8 && [...hi.code.slice(2)].sort().join() === ALL.join());
  check("the wall is a set: four different glyphs, ascending (no order to copy)", uv.part === "uv" && uv.code.length === L.SET_SIZE && uv.code.every((g, i) => !i || g > uv.code[i - 1]));
  check("the card reads nothing", L.read(st, "key") === null);
}

// ---------- every layout and path: drawable, unambiguous, solvable ----------
{
  let paths = 0, bad = [];
  L.LAYOUTS.forEach((layout, li) => {
    const keys = new Set(layout.paths.map(String));
    if (keys.size !== layout.paths.length) bad.push(`layout ${li}: two paths alike`);
    layout.paths.forEach((path, pi) => {
      paths++;
      if ([...path].sort().join() !== ALL.join()) bad.push(`${li}/${pi}: not a path through all six`);
      const rule = [li, pi, ...ALL];
      const { slots, dot } = L.plaqueLayout(rule);
      // a step never runs through a glyph it does not join
      for (let i = 1; i < 6; i++) {
        const a = slots[path[i - 1]], b = slots[path[i]];
        for (let s = 0; s < 6; s++) {
          if (s === path[i] || s === path[i - 1]) continue;
          const c = slots[s], len = Math.hypot(b.x - a.x, b.y - a.y);
          const tt = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / len ** 2));
          if (Math.hypot(a.x + (b.x - a.x) * tt - c.x, a.y + (b.y - a.y) * tt - c.y) < 5) bad.push(`${li}/${pi}: step ${i} crosses a glyph`);
        }
      }
      // the start dot belongs to the first glyph: closer to it than to any other, and on the plate
      const dist = slots.map((s) => Math.hypot(s.x - dot.x, s.y - dot.y));
      if (dist.some((d, s) => s !== path[0] && d <= dist[path[0]] + 2)) bad.push(`${li}/${pi}: start dot ambiguous`);
      if (Math.abs(dot.x) > L.PLAQUE.w / 2 - 2 || Math.abs(dot.y) > L.PLAQUE.h / 2 - 2) bad.push(`${li}/${pi}: start dot off the plate`);
      if (slots.some((s) => Math.abs(s.x) > L.PLAQUE.w / 2 - 4 || Math.abs(s.y) > L.PLAQUE.h / 2 - 4)) bad.push(`${li}/${pi}: glyph off the plate`);
      // solvable: for many orders and every set, reading the picture (dot, then along the path)
      // and typing the wall's glyphs in that order opens the door
      const rand = seeded(li * 100 + pi + 1);
      for (let k = 0; k < 6; k++) {
        const order = [...ALL].sort(() => rand() - 0.5);
        const r = [li, pi, ...order];
        const pic = L.plaqueLayout(r);
        const read = pic.path.map((s) => pic.slots[s].glyph);
        if (read.join() !== order.join()) bad.push(`${li}/${pi}: the picture does not read as the rule`);
        for (const set of subsets(ALL, L.SET_SIZE)) {
          const st = { ...L.newState(1), rule: r, set };
          const typed = [...set].sort((a, b) => read.indexOf(a) - read.indexOf(b));
          if (L.enter(st, typed, 0) !== "open") bad.push(`${li}/${pi}: ${order} x ${set} does not open`);
        }
      }
    });
  });
  check(`all ${paths} reading paths (row ${L.LAYOUTS[0].paths.length}, grid ${L.LAYOUTS[1].paths.length}, ring ${L.LAYOUTS[2].paths.length}) are clear and solvable with every set`, !bad.length, bad.slice(0, 3).join("; "));
  check("the start dot is never at the same end of a row both ways", (() => {
    const a = L.plaqueLayout([0, 0, ...ALL]).dot, b = L.plaqueLayout([0, 1, ...ALL]).dot;
    return a.x < 0 && b.x > 0;
  })());
  // the plaque never draws a letter or a number: it reads the same in every language
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k in Object.prototype ? undefined : (...args) => { calls.push(k); return { addColorStop() {} }; }), set: () => true });
  for (let li = 0; li < L.LAYOUTS.length; li++) for (let pi = 0; pi < L.LAYOUTS[li].paths.length; pi++) L.drawPlaque(ctx, [li, pi, ...ALL]);
  L.drawPlaque(ctx, null);
  check("the plaque is pictures only (no text drawn, any rule)", calls.length > 0 && !calls.includes("fillText") && !calls.includes("strokeText"));
  check("off the ledge the plaque looks the same whatever the rule", (() => {
    const draw = (rule) => { const c = []; L.drawOverlay(new Proxy({}, { get: (_, k) => (k in Object.prototype ? undefined : (...a) => { c.push(k + JSON.stringify(a)); return { addColorStop() {} }; }), set: () => true }), { world: W(), actor: { x: 50, y: FLOOR, character: "tall" }, cctv: false, code: rule, codePart: "uv" }); return c.join(); };
    return draw([0, 0, ...ALL]) === draw([2, 7, 5, 4, 3, 2, 1, 0]);
  })());
}

// ---------- neither note alone ----------
{
  // the plaque alone: every set of four is possible, so no position is fixed
  let ruleAlone = true;
  for (let li = 0; li < L.LAYOUTS.length; li++) {
    const order = [3, 0, 5, 1, 4, 2];
    const cands = subsets(ALL, L.SET_SIZE).map((set) => L.solve([li, 0, ...order], set));
    for (let i = 0; i < L.SET_SIZE; i++) if (new Set(cands.map((c) => c[i])).size < 2) ruleAlone = false;
    if (cands.length < 15) ruleAlone = false;
  }
  check("the plaque alone fixes no position (15 candidate codes)", ruleAlone);
  // the wall alone: some rule puts any of its glyphs anywhere, so every order is possible
  const set = [0, 2, 3, 5];
  const orders = new Set(perms(ALL).map((order) => L.solve([0, 0, ...order], set).join()));
  check("the wall alone fixes no position (all 24 orders possible)", orders.size === 24);
  check("the wall's spots come from the generation, not the order", JSON.stringify(L.uvSpots(4, 4)) === JSON.stringify(L.uvSpots(4, 4)) && JSON.stringify(L.uvSpots(4, 4)) !== JSON.stringify(L.uvSpots(5, 4)));
  // the old reading (plaque first, then wall) does not open it
  const st = { ...L.newState(1), rule: [0, 0, 0, 1, 2, 3, 4, 5], set: [1, 3, 4, 5] };
  check("typing the plaque's first four glyphs does not open it", L.enter({ ...st }, [0, 1, 2, 3], 0) !== "open");
}

// ---------- per tier ----------
{
  for (let tier = 1; tier <= 3; tier++) {
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(L.newState(tier).rule[0]);
    check(`tier ${tier}: plaque layouts ${[...seen].sort()}`, [...seen].sort().join() === L.layoutsFor(tier).join());
  }
  const st = L.newState(1, () => 0); // layout 0 (row)
  const gen = st.gen;
  check("more staff: a row plaque is re-issued as a grid or ring", L.retier(st, 3) && st.gen === gen + 1 && st.genWhy === "tier" && st.rule[0] !== 0);
  const st2 = L.newState(2, () => 0.5); // layout 1 (grid)
  check("more staff: a grid plaque stays (it is allowed at tier 3)", L.retier(st2, 3) && st2.gen === 1 && st2.rule[0] === 1);
  const src = readFileSync(new URL("../src/lab13.ts", import.meta.url), "utf8");
  const paths = JSON.parse(/export const PATHS = (\[[^\]]*\]);/.exec(src)?.[1] ?? "null");
  check("the server knows as many paths per layout as the plaque draws", JSON.stringify(paths) === JSON.stringify(L.LAYOUTS.map((l) => l.paths.length)), JSON.stringify(paths));
}

// ---------- the terminal: thinking mistakes cost a shift ----------
{
  const st = L.newState(1, seeded(7));
  const good = L.answer(st);
  const wrong = [...good].reverse();
  let now = 1_000_000;
  check("first miss: wrong", L.enter(st, wrong, now) === "wrong");
  check("second miss in the same shift: wrong, and the terminal locks", L.enter(st, wrong, now + 1000) === "wrong" && L.locked(st, now + 1000) && L.publicWorld({}, st, now + 1000).locked === true);
  check("while locked even the right code is refused", L.enter(st, good, now + 2000) === "locked" && !st.door && st.tries === 2);
  check("the shift ends: the terminal comes back", L.shiftEnded(st) && !L.locked(st, now + 3000) && L.publicWorld({}, st, now + 3000).locked === false);
  const st2 = L.newState(1, seeded(9));
  L.enter(st2, [...L.answer(st2)].reverse(), now); L.enter(st2, [...L.answer(st2)].reverse(), now);
  check("no shift end heard: the lock lapses after a shift's length anyway", L.enter(st2, L.answer(st2), now + L.LOCK_MS) === "open");
  // three misses over two shifts: both surfaces change
  const st3 = L.newState(1, seeded(11));
  const old = { rule: [...st3.rule], set: [...st3.set], answer: L.answer(st3) };
  L.read(st3, "tall"); L.read(st3, "light");
  const bad = [...old.answer].reverse();
  const results = [L.enter(st3, bad, now), L.enter(st3, bad, now)];
  L.shiftEnded(st3);
  results.push(L.enter(st3, bad, now + 5000, seeded(99)));
  check("third miss replaces the plaque and the wall", results.join() === "wrong,wrong,reset" && st3.gen === 2 && st3.genWhy === "reset" && st3.tries === 0 && !st3.seenHigh && !st3.seenUV);
  check("after the reset the old notes are lies", (st3.rule.join() !== old.rule.join() || st3.set.join() !== old.set.join()));
  const pub = L.publicWorld(L.fresh(), st3);
  check("the change is on the public record: gen, genAt, genWhy", pub.gen === 2 && pub.genWhy === "reset" && typeof pub.genAt === "number" && pub.genAt > 0);
  check("wrong length is refused without cost", L.enter(st3, [0, 1, 2], now) === "bad" && st3.tries === 0);
}

// ---------- nothing secret in the public world ----------
{
  let leak = "";
  for (let i = 0; i < 200 && !leak; i++) {
    const st = L.newState(1 + (i % 3));
    L.read(st, "tall"); L.read(st, "light");
    const pub = L.publicWorld({ code: [1, 2], rule: [0], set: [1], high: [1], uv: [2], lengths: [2, 2] }, st);
    const text = JSON.stringify(pub);
    if (Object.values(pub).some((v) => Array.isArray(v))) leak = "an array: " + text;
    else if (/"(rule|set|high|uv|code|lengths)"/.test(text)) leak = text;
    else if (text.includes(L.answer(st).join(","))) leak = "the answer: " + text;
  }
  check("the public world carries no glyph, no rule and no answer", !leak, leak);
  const sch = JSON.stringify(L.schematic({ world: L.publicWorld(L.fresh(), L.newState(1)) }));
  check("the console says only that the plaque and the wall exist", !/rule|set/.test(sch));
  check("the pad asks for the set's size", L.padLength(L.publicWorld({}, L.newState(3))) === L.SET_SIZE);
}

// ---------- the server's copy (src/lab13.ts), where this Node can load TypeScript ----------
{
  let S = null;
  try { S = await import("../src/lab13.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab13.ts parity (run with node --experimental-strip-types to include it)");
  else {
    let same = S.SET_SIZE === L.SET_SIZE && S.MAX_TRIES === L.MAX_TRIES && S.PER_SHIFT === L.PER_SHIFT && S.LOCK_MS === L.LOCK_MS;
    for (let tier = 1; tier <= 3; tier++) same &&= S.layoutsFor(tier).join() === L.layoutsFor(tier).join();
    for (let i = 0; i < 200 && same; i++) {
      const st = S.newState(1 + (i % 3));
      same &&= st.rule[1] < L.LAYOUTS[st.rule[0]].paths.length && S.answer(st).join() === L.solve(st.rule, st.set).join();
      const pub = S.publicWorld({ code: [1] }, st);
      same &&= !JSON.stringify(pub).includes("rule") && !Object.values(pub).some(Array.isArray);
    }
    const st = S.newState(1), bad = [...S.answer(st)].reverse();
    const r = [S.enter(st, bad, 0), S.enter(st, bad, 1), S.enter(st, S.answer(st), 2)];
    S.shiftEnded(st);
    r.push(S.enter(st, bad, 3));
    same &&= r.join() === "wrong,wrong,locked,reset" && st.gen === 2 && st.genWhy === "reset";
    check("src/lab13.ts judges, locks and re-issues exactly like public/lab13.js", same, r.join());
  }
}

// ---------- the climb ----------
{
  const p = L.newPlayer();
  const r = route(W({ door: true }), p, "tall", [[24 * T, FLOOR], [27 * T + 8, 16 * T], [31 * T + 8, 12 * T], [L.LEVER.x, L.LEVER.y]]);
  check("walking aid: through door D and up three shelves to the lever", r.ok && L.nearLever(p) && r.t < 25, fmt(r));
  check("door D shut: no way through", !route(W(), L.newPlayer(), "tall", [[24 * T, FLOOR]], 6).ok);
  const key = L.newPlayer();
  const rk = route(W(), key, "key", [[L.TERMINAL.x, FLOOR]]);
  check("card: walks to the terminal (through the dark)", rk.ok && L.nearTerminal(key), fmt(rk));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
