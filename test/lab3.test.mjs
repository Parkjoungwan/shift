// Checks that each piece of lab 3 can be done with the right equipment, in about
// a minute, and cannot be done with the wrong one. Runs the real step() at 60 fps.
// Usage: node test/lab3.test.mjs

import * as L from "../public/lab3.js";

const DT = 1 / 60;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller: walk and jump through waypoints [x, feetY, oneWay]. oneWay targets can be jumped through from below. */
function route(world, character, waypoints, limit = 30) {
  const p = L.newPlayer();
  let t = 0, held = false;
  for (const [tx, ty, oneWay] of waypoints) {
    let done = false;
    while (t < limit) {
      const dx = tx - p.x;
      const up = ty < p.y - 4;
      const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
      if (up && p.ground) {
        if (Math.abs(dx) < 20 && !oneWay) { // right under a solid target: step back out first
          const away = dx >= 0 ? -1 : 1;
          input.left = away < 0; input.right = away > 0;
        } else if (Math.abs(dx) < 90) { input.jumpPressed = true; held = true; input.jumpHeld = true; }
      }
      if (held && p.vy > 0) held = false;
      L.step(world, p, input, character, DT);
      t += DT;
      if (p.ground && Math.abs(p.y - ty) < 1 && Math.abs(dx) < 4) { done = true; break; }
    }
    if (!done) return { ok: false, t, at: [Math.round(p.x), Math.round(p.y)], target: [tx, ty] };
  }
  return { ok: true, t, p };
}

/** Highest point the feet reach from a standing jump on the floor. */
function jumpRise(character) {
  const world = L.fresh();
  const p = L.newPlayer();
  p.x = 26 * L.T + 8; // high room: nothing overhead
  const start = p.y;
  let top = p.y;
  L.step(world, p, { jumpPressed: true, jumpHeld: true }, character, DT);
  for (let i = 0; i < 120; i++) {
    L.step(world, p, { jumpHeld: true }, character, DT);
    top = Math.min(top, p.y);
  }
  return start - top;
}

const T = L.T;
const floor = 20 * T;
const shaft = [ // bridges, then the glyph ledge
  [5 * T + 8, 17 * T, 1], [8 * T + 8, 14 * T, 1], [5 * T + 8, 11 * T, 1], [8 * T + 8, 8 * T, 1], [7 * T + 8, 5 * T, 1], [10 * T + 8, 4 * T],
];
const climb = [[29 * T + 8, 16 * T], [34 * T + 8, 12 * T], [L.LEVER.x, L.LEVER.y]];

// jump heights
const normal = jumpRise("key"), tall = jumpRise("tall");
check("normal jump clears a 3-tile bridge step but not a 4-tile ledge", normal > 48 && normal < 64, `${normal.toFixed(1)} px`);
check("walking aid clears a 4-tile ledge", tall > 64 + 6, `${tall.toFixed(1)} px`);

// shift 1: the light climbs the shaft and reads the glyphs
{
  const world = L.fresh();
  const r = route(world, "light", shaft);
  check("the shared world never carries the code", !("code" in L.fresh()));
check("light climbs the dark shaft to the glyph wall", r.ok, r.ok ? `${r.t.toFixed(1)} s` : JSON.stringify(r));
  check("light can read the glyphs there", r.ok && L.readsGlyphs(r.p, "light"));
  for (const other of ["key", "tall"]) {
    const o = route(L.fresh(), other, shaft.slice(0, 1), 8);
    check(`${other} cannot use the light bridges`, !o.ok);
  }
}

// shift 2: the card types the code at the terminal
{
  const world = L.freshSecret();
  const r = route(world, "key", [[L.TERMINAL.x, floor]]);
  check("card reaches the terminal", r.ok && L.nearTerminal(r.p), r.ok ? `${r.t.toFixed(1)} s` : "");
  check("the card at the terminal reads this issue's tag there", r.ok && L.readsIssue(r.p, "key") && !L.readsIssue(r.p, "light") && !L.readsIssue(r.p, "tall"));
  check("door blocks the way before the code", !route(world, "key", [[25 * T, floor]], 8).ok);
  const code = L.answer(world);
  check("wrong code is refused", L.enterCode(world, code.map((g) => (g + 1) % L.GLYPH_COUNT)) === "wrong");
  check("right code opens the door", L.enterCode(world, code) === "open" && world.door);
  check("door is passable once open", route(world, "key", [[25 * T, floor]], 8).ok);
}

// ---------- the wall: two rows, two tags, one of them this issue's ----------

const rand = (seed) => () => { // mulberry32: repeatable openings
  let a = (seed += 0x6d2b79f5);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
};
const pub = (st, now) => L.local.publicWorld(L.fresh(), st, now);
/** Two shifts of the same card: what shiftEnded does between them. */
const nextShift = (st) => { L.shiftEnded(st); };

{
  const st = L.freshSecret(rand(1));
  const seen = L.local.read(st, "light");
  const rows = L.wallRows(seen.code);
  check("the light reads two rows of four, each with a pip tag", seen.code.length === L.WALL_LENGTH && rows.length === 2 && rows.every((r) => r.glyphs.length === L.CODE_LENGTH && r.tag >= 1 && r.tag <= L.TAGS));
  check("the two tags differ", rows[0].tag !== rows[1].tag);
  check("the two rows differ", rows[0].glyphs.join() !== rows[1].glyphs.join());
  check("the card and the walking aid read nothing at the wall", L.local.read(st, "key") === null && L.local.read(st, "tall") === null);
  check("this issue's tag (the terminal's) picks the code out of the wall", L.codeFrom(seen.code, pub(st).issue)?.join() === L.answer(st).join());
  check("an older server's bare code still draws as one row", L.wallRows([1, 2, 3, 4]).length === 1 && L.wallRows([1, 2, 3, 4])[0].glyphs.join() === "1,2,3,4");
}

// every opening, every tier: the light's wall and the terminal's tag together always open the door
{
  let runs = 0, opened = 0, rows = new Set(), tags = new Set();
  const bad = [];
  for (let seed = 0; seed < 3000; seed++) {
    const r = rand(seed), st = L.freshSecret(r, 1 + (seed % 3));
    runs++;
    for (let round = 0; round < 3 && !st.door; round++) {
      const wall = L.local.read(st, "light").code;
      const w = pub(st);
      rows.add(w.row); tags.add(w.issue);
      const res = L.enterCode(st, L.codeFrom(wall, w.issue), r);
      if (res !== (round + 1 === st.needed ? "open" : "pass")) { bad.push(`${seed}:${round}:${res}`); break; }
      nextShift(st);
    }
    if (st.door) opened++;
  }
  check(`every opening is solvable with the wall and the terminal's tag (${runs} openings, tiers 1-3)`, opened === runs && !bad.length, bad.slice(0, 3).join(" "));
  check("this issue's row is sometimes the top, sometimes the bottom", rows.size === 2);
  check(`every tag 1-${L.TAGS} turns up as this issue's`, tags.size === L.TAGS);
}

// the field path, without the control desk: a note of both rows WITHOUT tags costs at most one card shift
{
  let worst = 0, wasted = 0, runs = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const st = L.freshSecret(rand(seed));
    const note = L.wallRows(L.local.read(st, "light").code).map((r) => r.glyphs); // no tags copied
    let shifts = 0;
    for (const guess of note) { // one card shift per row, top first
      shifts++;
      const res = L.enterCode(st, guess);
      if (res === "open") break;
      if (res !== "stale" || !pub(st).locked) { shifts = 99; break; }
      nextShift(st);
    }
    runs++;
    worst = Math.max(worst, st.door ? shifts : 99);
    if (shifts > 1) wasted++;
  }
  check("both rows without tags: the door opens within two card shifts, every opening", worst === 2, `worst ${worst}`);
  check("...and about half the openings spend the extra shift (a coin toss, not a lock)", wasted > runs * 0.4 && wasted < runs * 0.6, `${wasted}/${runs}`);
  // with the tags copied, never
  let first = 0;
  for (let seed = 0; seed < 500; seed++) {
    const st = L.freshSecret(rand(seed));
    const wall = L.local.read(st, "light").code;
    if (L.enterCode(st, L.codeFrom(wall, pub(st).issue)) === "open") first++;
  }
  check("both rows with their tags: the first entry opens, every opening", first === 500);
}

// the veteran's mistake: last issue's row is a thinking mistake and spends the shift; a typo is not
{
  const now = 1_000_000;
  const st = L.freshSecret(rand(7));
  const good = L.answer(st), old = L.staleCode(st);
  check("typing last issue's row: 'stale', and the terminal locks for the shift at once", L.enterCode(st, old, Math.random, now) === "stale" && L.locked(st, now) && pub(st, now).locked && pub(st, now).stale === 1 && st.tries === 1);
  check("while locked even the right code is refused, at no cost", L.enterCode(st, good, Math.random, now + 1000) === "locked" && !st.door && st.tries === 1);
  check("the overseer says it was last issue's", /지난 발급분/.test(L.narrate(pub({ ...st, stale: 0, shiftWrong: 0 }, now), pub(st, now)) ?? ""));
  check("the hint at the terminal says it is locked", L.hint(pub(st, now), { ...L.newPlayer(), x: L.TERMINAL.x }, "key") !== L.hint(L.fresh(), { ...L.newPlayer(), x: L.TERMINAL.x }, "key"));
  nextShift(st);
  check("the next shift gets the terminal back, and the same wall still holds", !L.locked(st, now + 2000) && L.enterCode(st, good, Math.random, now + 2000) === "open");

  const st2 = L.freshSecret(rand(8));
  const typo = L.answer(st2).map((g, i) => (i === 3 ? (g + 1) % L.GLYPH_COUNT : g));
  const typo2 = typo.join() === L.staleCode(st2).join() ? typo.map((g, i) => (i === 3 ? (g + 1) % L.GLYPH_COUNT : g)) : typo;
  check("a typo is a plain 'wrong' and does not lock", L.enterCode(st2, typo2, Math.random, now) === "wrong" && !L.locked(st2, now));
  check("...a second typo in the same shift does", L.enterCode(st2, [5, 5, 5, 5].join() === L.answer(st2).join() || [5, 5, 5, 5].join() === L.staleCode(st2).join() ? [4, 4, 4, 4] : [5, 5, 5, 5], Math.random, now + 1) === "wrong" && L.locked(st2, now + 1));
  check("no shift end heard: the lock lapses after a shift's length anyway", L.enterCode(st2, L.answer(st2), Math.random, now + 1 + L.LOCK_MS) === "open");
  check("wrong length and bad glyphs are refused without cost", L.enterCode(L.freshSecret(), [0, 1, 2]) === "bad" && L.enterCode(L.freshSecret(), [9, 9, 9, 9]) === "bad");
}

// three misses paint over the older row: the code that was current becomes the decoy
{
  for (let seed = 0; seed < 300; seed++) {
    const st = L.freshSecret(rand(seed));
    st.seen = true;
    const before = { answer: L.answer(st).join(), issue: L.issueOf(st), row: st.row, stale: L.staleCode(st).join(), staleTag: L.wallRow(st.code, 1 - st.row).tag };
    const bad = [0, 1, 2, 3, 4, 5].map((g) => [g, g, g, g]).filter((c) => c.join() !== before.answer && c.join() !== before.stale);
    const res = [];
    for (let i = 0; i < 3; i++) { res.push(L.enterCode(st, bad[i])); nextShift(st); }
    const ok = res.join() === "wrong,wrong,reset" && st.gen === 2 && st.genWhy === "reset" && !st.seen && st.tries === 0 &&
      st.row === 1 - before.row && L.staleCode(st).join() === before.answer && L.wallRow(st.code, 1 - st.row).tag === before.issue &&
      L.issueOf(st) !== before.issue && L.issueOf(st) !== before.staleTag && L.answer(st).join() !== before.answer;
    if (!ok) { check(`reset ${seed}: the older row is painted over, the old code stays as the decoy, a new tag`, false, JSON.stringify({ res, before, st })); break; }
    if (seed === 299) check("the third miss paints over the older row: the old code stays as the decoy under its old tag, a new tag unlike the last two", true);
  }
  const st = L.freshSecret(rand(3));
  const oldNote = L.answer(st);
  for (const c of [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4, 4]]) {
    if (st.gen > 1) break;
    if (c.join() === L.answer(st).join() || c.join() === L.staleCode(st).join()) continue;
    L.enterCode(st, c); nextShift(st);
  }
  check("a note from before the reset now matches last issue's row: typing it is 'stale'", st.gen === 2 && L.enterCode(st, oldNote) === "stale");
  const p = pub(st);
  check("the change is public: gen, genAt, genWhy (no wall)", p.gen === 2 && p.genWhy === "reset" && p.genAt > 0 && !("code" in p));
}

// a verification round paints over the older row too, and says so
{
  const st = L.freshSecret(rand(11), 2);
  const before = st.genAt, used = L.answer(st).join();
  const r = L.enterCode(st, L.answer(st));
  const p = pub(st);
  check("a passed round re-issues the glyphs on the public record", r === "pass" && p.gen === 2 && p.genWhy === "pass" && p.genAt >= before);
  check("...and the code just used is now the decoy", L.staleCode(st).join() === used && L.answer(st).join() !== used);
  check("a fresh world says the first glyphs came with the opening", L.fresh().genWhy === "open" && pub(L.local.newState(1)).gen === 1);
  check("an old saved state (one bare row) gets a fresh two-row wall", (() => { const old = { code: [1, 2, 3, 4], gen: 3, tries: 0, seen: true, door: false, passes: 0, needed: 1 }; const w = pub(old); return old.code.length === L.WALL_LENGTH && w.gen === 4 && !old.seen && w.issue >= 1; })());
}

// ---------- what everyone else sees: no glyph, and nothing that says which row ----------

/** Records every drawing call. */
function recorder() {
  const log = [];
  const ctx = new Proxy({}, { get: (_, k) => (k in Object.prototype ? undefined : k === "measureText" ? () => ({ width: 8 }) : (...a) => { log.push(`${String(k)}(${a.map((x) => (typeof x === "number" ? x.toFixed(2) : x)).join(",")})`); return { addColorStop() {} }; }), set: (_, k, v) => { log.push(`${String(k)}=${v}`); return true; } });
  return { ctx, log };
}
const drawn = (opts) => { const r = recorder(); L.drawOverlay(r.ctx, opts); L.drawBase(r.ctx, opts); return r.log.join(";"); };
// what everyone but the control desk sees: console.js drops ctrl wires and labels, redacts ctrl devices and rows
const cleared = (sch) => ({
  map: sch.map.filter((it) => !it.ctrl || it.kind === "device" || it.kind === "zone" || it.kind === "box").map((it) => (it.ctrl ? { ...it, state: "#", label: it.kind === "device" ? it.label : "#" } : it)),
  status: sch.status.map((r) => (r.ctrl ? { label: r.label, state: "#" } : r)),
});

{
  let leak = null;
  for (let i = 0; i < 300 && !leak; i++) {
    const s = L.local.newState(1 + (i % 3));
    L.local.read(s, "light");
    const w = L.local.publicWorld({ code: [1, 2, 3, 4], wall: 1 }, s);
    const text = JSON.stringify(w);
    if ("code" in w || Object.values(w).some(Array.isArray) || text.includes(L.answer(s).join(",")) || text.includes(L.staleCode(s).join(","))) leak = text;
  }
  check("the public world never carries a glyph or the wall", !leak, leak ?? "");

  // the same wall, this issue's row on top or at the bottom: nobody but the light, the card at
  // the terminal and the control desk can tell them apart
  const a = L.freshSecret(rand(21));
  const b = structuredClone(a);
  b.row = 1 - a.row; // same wall, the other row is this issue's
  const wa = pub(a), wb = pub(b);
  check("the two openings differ in this issue's tag and row", wa.issue !== wb.issue && wa.row !== wb.row);
  const sa = L.schematic({ world: wa }), sb = L.schematic({ world: wb });
  check("the public sheet is identical either way (ctrl redacted)", JSON.stringify(cleared(sa)) === JSON.stringify(cleared(sb)));
  check("the desk's sheet tells them apart, only in ctrl items", JSON.stringify(sa) !== JSON.stringify(sb) &&
    JSON.stringify({ ...sa, map: sa.map.filter((x) => !x.ctrl), status: sa.status.filter((x) => !x.ctrl) }) === JSON.stringify({ ...sb, map: sb.map.filter((x) => !x.ctrl), status: sb.status.filter((x) => !x.ctrl) }));
  check("the desk's sheet names this issue's tag and row", JSON.stringify(sa.status.filter((x) => x.ctrl)).includes(String(wa.issue)) && sa.map.some((x) => x.ctrl && x.kind === "wire"));
  check("the public sheet shows eight unreadable glyphs, never a tag", JSON.stringify(cleared(sa)).includes("판독 불가 8건") && !JSON.stringify(cleared(sa)).includes("점 "));
  const wall = L.local.read(a, "light").code;
  const atTerm = { ...L.newPlayer(), x: L.TERMINAL.x, character: "key", nick: "n" };
  const onLedge = { x: 10 * T + 8, y: 4 * T, face: 1, character: "light", nick: "n" };
  for (const [what, opts] of [
    ["the CCTV of the light at the wall", { actor: onLedge, cctv: true, code: null }],
    ["the CCTV of the card at the terminal", { actor: atTerm, cctv: true, code: null }],
    ["the light's own view at the wall", { actor: onLedge, cctv: false, code: wall }],
    ["the light's own view at the terminal", { actor: { ...atTerm, character: "light" }, cctv: false, code: wall }],
    ["the walking aid at the terminal", { actor: { ...atTerm, character: "tall" }, cctv: false, code: null }],
    ["the card away from the terminal", { actor: { ...L.newPlayer(), character: "key" }, cctv: false, code: null }],
  ]) {
    check(`${what} looks the same whichever row is this issue's`, drawn({ ...opts, world: wa, time: 0 }) === drawn({ ...opts, world: wb, time: 0 }));
  }
  check("the card at the terminal sees this issue's tag on its screen", drawn({ actor: atTerm, cctv: false, world: wa, time: 0 }) !== drawn({ actor: atTerm, cctv: false, world: wb, time: 0 }));
  check("the light's view draws both rows and both tags", (() => { const r = recorder(); L.drawOverlay(r.ctx, { actor: onLedge, cctv: false, code: wall, world: wa, time: 0, noDarkness: true }); return r.log.filter((x) => x.startsWith("strokeRect")).length === 2 && r.log.filter((x) => x.startsWith("stroke(")).length === 8; })());
  check("the CCTV never draws a glyph or a tag, even with the wall at hand", (() => { const r = recorder(); L.drawOverlay(r.ctx, { actor: onLedge, cctv: true, code: wall, world: wa, time: 0, noDarkness: true }); L.drawOverlay(r.ctx, { actor: atTerm, cctv: true, code: wall, world: wa, time: 0, noDarkness: true }); return !r.log.some((x) => x.startsWith("strokeRect") || x.startsWith("stroke(")); })());
  check("the pad's tries line says when the shift is spent", L.padTries({ locked: true, tries: 1 }) !== L.padTries({ locked: false, tries: 1 }));
}

// the server's copy (src/lab3.ts) judges the same way, where this Node can load TypeScript
{
  let S = null;
  try { S = await import("../src/lab3.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab3.ts parity (run with node --experimental-strip-types to include it)");
  else {
    check("src/lab3.ts: the same sizes and limits", S.GLYPH_COUNT === L.GLYPH_COUNT && S.CODE_LENGTH === L.CODE_LENGTH && S.MAX_TRIES === L.MAX_TRIES &&
      S.PER_SHIFT === L.PER_SHIFT && S.LOCK_MS === L.LOCK_MS && S.TAGS === L.TAGS && S.WALL_LENGTH === L.WALL_LENGTH);
    // the same wall on both sides, the same entries, the same answers
    const now = 5_000_000;
    let same = true;
    const why = [];
    for (let seed = 0; seed < 300 && same; seed++) {
      const js = L.freshSecret(rand(seed), 1 + (seed % 3));
      const ts = { ...S.newLab(js.needed), code: [...js.code], row: js.row };
      const script = [L.staleCode(js), [0, 0, 0, 0], L.answer(js), [1, 1, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3]];
      for (let i = 0; i < script.length; i++) {
        const t0 = now + i * 1000;
        const was = L.answer(js).join(), gen = js.gen;
        const a = L.enterCode(js, script[i], Math.random, t0), b = S.enter(ts, script[i], t0);
        const pa = L.local.publicWorld(L.fresh(), js, t0), pb = S.publicWorld({ lab: 3 }, ts, t0);
        const pick = (w) => JSON.stringify([w.gen, w.genWhy, w.tries, w.door, w.passes, w.locked, w.stale, w.row]);
        // a new issue is random on each side; both must keep the code that was current as the decoy
        const painted = js.gen !== gen && !(L.staleCode(js).join() === was && S.staleCode(ts).join() === was);
        if (a !== b || pick(pa) !== pick(pb) || painted) { same = false; why.push(`${seed}/${i}: ${a} vs ${b} ${pick(pa)} vs ${pick(pb)}`); break; }
        if (js.gen !== gen) { ts.code = [...js.code]; ts.row = js.row; } // same wall again for the next entry
        if (i % 2) { L.shiftEnded(js); S.shiftEnded(ts); }
      }
    }
    check("src/lab3.ts judges, locks and paints over exactly like public/lab3.js", same, why.join());
    const lab = S.newLab(2);
    const opened = S.publicWorld({ code: [1], shiftWrong: 9 }, lab);
    check("src/lab3.ts: the public world carries the tag and row but never the wall", !("code" in opened) && !("shiftWrong" in opened) && opened.issue === S.issueOf(lab) && opened.row === lab.row && opened.genWhy === "open");
    check("src/lab3.ts: only the light reads the wall, both rows", S.read(lab, "key") === null && S.read(lab, "light")?.code.length === S.WALL_LENGTH && lab.seen);
    const old = { code: [1, 2, 3, 4], gen: 2, tries: 1, seen: true, door: false, passes: 0, needed: 1 };
    check("src/lab3.ts: an old stored state gets a fresh two-row wall", S.enter(old, [0, 0, 0, 0]) !== "bad" && old.code.length === S.WALL_LENGTH && old.gen === 3);
    const tags = new Set(), rows = new Set();
    for (let i = 0; i < 400; i++) { const s = S.newLab(1); tags.add(S.issueOf(s)); rows.add(s.row); if (S.answer(s).join() === S.staleCode(s).join()) tags.add("dup"); }
    check("src/lab3.ts: openings use every tag and both rows, never two equal rows", tags.size === S.TAGS && rows.size === 2);
  }
}

// shift 3: the walking aid climbs to the lever
{
  const world = L.fresh();
  world.door = true;
  const r = route(world, "tall", [[25 * T, floor], ...climb]);
  check("walking aid climbs to the exit lever", r.ok && L.nearLever(r.p), r.ok ? `${r.t.toFixed(1)} s` : JSON.stringify(r));
  for (const other of ["key", "light"]) {
    const o = route(world, other, [[25 * T, floor], climb[0]], 8);
    check(`${other} cannot climb the ledges`, !o.ok);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
