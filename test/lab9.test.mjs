// Checks lab 9 "Clocking out": the fake wall lets everyone through to the exit terminal, the
// note's pieces are readable only from where they should be, the terminal takes the whole note
// in the order of lab 1's practice tape (S5: every order, every tier), a wrong entry locks the
// terminal for the shift, and nobody leaves through a shut door. Runs the real step() at 60 fps
// (traps: traps.test.mjs). Usage: node test/lab9.test.mjs
// (node --experimental-strip-types test/lab9.test.mjs also checks src/lab9.ts and lab 1's
// practice tape in src/lab1.ts)

import * as L from "../public/lab9.js";

const DT = 1 / 60, T = L.T, FLOOR = 20 * T;
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failed++;
}

/** Greedy controller through waypoints [x, feetY]; jumps when the target is above. */
function route(world, p, character, waypoints, limit = 20) {
  let t = 0, held = false;
  for (const [tx, ty] of waypoints) {
    let done = false;
    while (t < limit) {
      const dx = tx - p.x, up = ty < p.y - 4;
      const input = { left: dx < -2, right: dx > 2, jumpPressed: false, jumpHeld: held };
      if (up && p.ground) {
        if (Math.abs(dx) < 20) { input.left = dx >= 0; input.right = dx < 0; } // back off for a run-up
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
const fmt = (r) => r.ok ? `${r.t.toFixed(1)} s` : `stuck at ${r.at} going to ${r.target}`;

// ---------- the walk to the exit ----------
for (const c of L.characters) {
  const w = L.fresh(), p = L.newPlayer();
  const r = route(w, p, c, [[L.TERMINAL.x, FLOOR]]);
  check(`${c}: walks through the fake wall to the exit terminal`, r.ok && L.nearTerminal(p), fmt(r));
}
check("the fake wall looks like rock but is not solid", L.tileAt(31, 18) === L.TILE.FAKE && L.looksSolid(L.TILE.FAKE) && !L.solidAt(L.fresh(), 31, 18));

const shut = L.fresh(), p1 = L.newPlayer();
p1.x = L.TERMINAL.x;
route(shut, p1, "key", [[L.OUT_X + 8, FLOOR]], 4);
check("a shut exit door keeps everyone in", p1.x < L.OUT_X, `x ${Math.round(p1.x)}`);
const open = { ...L.fresh(), door: true }, p2 = L.newPlayer();
p2.x = L.TERMINAL.x;
const r2 = route(open, p2, "key", [[L.OUT_X + 4, FLOOR]], 4);
check("an open exit door lets them out", r2.ok && p2.x >= L.OUT_X, fmt(r2));

// ---------- reading the note ----------
const [floor, ledge, dark] = L.PIECES;
const stand = (x, y = FLOOR) => ({ ...L.newPlayer(), x, y, ground: true });
check("piece 1 reads from the floor in front of it", L.characters.every((c) => L.readsPiece(stand(floor.x), c, 0)));
check("piece 1 does not read from across the hall", !L.readsPiece(stand(floor.x + 60), "key", 0));
check("piece 1 does not read in mid-air", !L.readsPiece({ ...stand(floor.x), ground: false }, "key", 0));
check("piece 2 does not read from the floor below", !L.readsPiece(stand(ledge.x), "tall", 1));
const tall = L.newPlayer();
const rTall = route(L.fresh(), tall, "tall", [[10 * T, FLOOR], [ledge.x, 16 * T]]);
check("the walking aid climbs onto the ledge and reads piece 2", rTall.ok && L.readsPiece(tall, "tall", 1), fmt(rTall));
const key = L.newPlayer();
const rKey = route(L.fresh(), key, "key", [[10 * T, FLOOR], [ledge.x, 16 * T]], 6);
check("the card cannot reach the ledge", !rKey.ok);
check("piece 3 reads only in the light", L.readsPiece(stand(dark.x), "light", 2) && !["key", "tall", "echo"].some((c) => L.readsPiece(stand(dark.x), c, 2)));

// ---------- the terminal ----------
for (const tier of [1, 2, 3]) {
  const pieces = L.tornNote(tier);
  const want = tier === 1 ? [3] : Array(tier).fill(2);
  check(`tier ${tier}: the note is torn into ${tier} piece(s)`, JSON.stringify(pieces.map((g) => g.length)) === JSON.stringify(want));
}
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
check("the overseer practises every order of the three stamps but ①②③", L.ORDERS.length === 5 && PERMS.slice(1).every((p) => L.ORDERS.some((o) => o.join() === p.join())));
/** A note whose glyphs are all different, so an order shows in the code. */
const distinct = (tier) => (tier === 1 ? [[0, 1, 2]] : tier === 2 ? [[0, 1], [2, 3]] : [[0, 1], [2, 3], [4, 5]]);
for (const tier of [1, 2, 3]) {
  for (const order of L.ORDERS) {
    const st = { ...L.local.newState(tier), pieces: distinct(tier), order: [...order] };
    const flat = st.pieces.flat(), code = L.exitCode(st.pieces, order);
    const byMark = L.exitCode(st.pieces, [0, 1, 2]);
    const name = `tier ${tier}, order ${order.map((m) => m + 1).join("")}`;
    check(`${name}: the code is the note's glyphs mark by mark, never the reading order nor ①②③`,
      [...code].sort().join() === [...flat].sort().join() && code.join() !== flat.join() && code.join() !== byMark.join() &&
      L.markOf(flat.indexOf(code[0])) === order[0] && L.markOf(flat.indexOf(code.at(-1))) === order[2] &&
      flat.every((_, i) => L.markOf(i) === i % 3));
    const r1 = L.enter(st, flat, 1000);
    check(`${name}: the veteran's reading order is wrong and locks the terminal`, r1 === "wrong" && st.tries === 1 && L.isLocked(st, 2000) && L.locked({ ...L.local.publicWorld(L.fresh(), st), locked: true }, 2000));
    check(`${name}: locked, even the right code waits for the next shift`, L.enter(st, code, 2000) === "locked" && !st.door && st.tries === 1);
    check(`${name}: next shift, the practised order opens the exit`, L.shiftEnded(st) && !L.isLocked(st, 2000) && L.enter(st, code, 3000) === "open" && st.door);
  }
}
{
  const st = { ...L.local.newState(2), order: [2, 0, 1] };
  const code = L.exitCode(st.pieces, st.order);
  check("a short input is refused, not counted, not locked", L.enter(st, code.slice(1), 0) === "bad" && st.tries === 0 && !L.isLocked(st, 0));
  check("a wrong input is counted and locks", L.enter(st, code.map((g) => (g + 1) % L.GLYPH_COUNT), 0) === "wrong" && st.tries === 1 && L.isLocked(st, 10));
  check("one try per shift: the next ones are locked out, not counted", Array.from({ length: 20 }, (_, i) => L.enter(st, code, 100 + i)).every((r) => r === "locked") && st.tries === 1);
  check("a lock nobody cleared lapses after a shift's length", !L.isLocked(st, L.LOCK_MS + 1) && L.enter(st, code, L.LOCK_MS + 1) === "open" && st.door);
  check("an open door stays open", L.enter(st, code) === "already");
  check("the pad asks for the whole note", L.padLength({ pieces: st.pieces }) === code.length);
  check("a shift without a wrong entry has nothing to unlock", L.shiftEnded({ ...L.local.newState(1) }) === false);
}
// ---------- every second miss re-tears the note (the archive stays true) ----------
for (const tier of [1, 2, 3]) {
  for (const order of L.ORDERS) {
    const name = `tier ${tier}, order ${order.map((m) => m + 1).join("")}`;
    const st = { ...L.local.newState(tier), order: [...order] };
    const wrong = (s) => L.exitCode(s.pieces, order).map((g, i) => (i ? g : (g + 1) % L.GLYPH_COUNT)); // a blind guess, always wrong
    const before = JSON.stringify(st.pieces), shape = JSON.stringify(st.pieces.map((p) => p.length));
    const r1 = L.enter(st, wrong(st), 1000);
    check(`${name}: the first miss only locks`, r1 === "wrong" && JSON.stringify(st.pieces) === before && st.gen === 1);
    L.shiftEnded(st);
    const oldCode = L.exitCode(st.pieces, order);
    const r2 = L.enter(st, wrong(st), 2000);
    check(`${name}: the second miss re-tears the note: new glyphs, same pieces, same order, still locked`,
      r2 === "reset" && JSON.stringify(st.pieces) !== before && JSON.stringify(st.pieces.map((p) => p.length)) === shape &&
      st.order.join() === order.join() && st.gen === 2 && st.genWhy === "reset" && st.genAt === 2000 && L.isLocked(st, 2500));
    const w = L.local.publicWorld(L.fresh(), st);
    check(`${name}: everyone sees the re-tear (gen, genAt, genWhy) and the overseer says so`,
      w.gen === 2 && w.genAt === 2000 && w.genWhy === "reset" && /새것으로/.test(L.narrate({ ...w, gen: 1, tries: 1 }, w) ?? ""));
    L.shiftEnded(st);
    const stale = JSON.stringify(oldCode) !== JSON.stringify(L.exitCode(st.pieces, order));
    if (stale) check(`${name}: a drawing of the old pieces is now wrong`, L.enter({ ...st, pieces: st.pieces.map((p) => [...p]) }, oldCode, 3000) !== "open");
    check(`${name}: the archive's order on the new pieces still opens first try`, L.enter(st, L.exitCode(st.pieces, order), 3000) === "open" && st.door);
  }
}
{
  // no hard lock: miss after miss, one per shift, the note keeps changing and the order keeps opening it
  const st = { ...L.local.newState(3), order: [2, 1, 0] };
  const gens = [];
  for (let k = 0; k < 9; k++) { L.enter(st, L.exitCode(st.pieces, st.order).map((g, i) => (i ? g : (g + 1) % 6)), k * 100); gens.push(st.gen); L.shiftEnded(st); }
  check("no hard lock: nine misses, four re-tears, and the archive's order still opens", gens.join() === "1,2,2,3,3,4,4,5,5" && st.pieces.length === 3 && L.enter(st, L.exitCode(st.pieces, st.order), 1000) === "open");
  const sch = L.schematic({ world: L.local.publicWorld(L.fresh(), { ...L.local.newState(1), tries: 1, gen: 3 }) });
  check("the sheet counts down to the next re-tear for everyone", sch.status.some((r) => !r.ctrl && r.label === "쪽지 교체" && /3번째/.test(r.state) && /1회/.test(r.state)));
}

{
  const st = { ...L.local.newState(1), order: [1, 2, 0] };
  L.enter(st, L.exitCode(st.pieces, st.order).map((g) => (g + 1) % 6));
  const w = L.local.publicWorld(L.fresh(), st);
  check("the order never reaches the clients", !("order" in w) && !JSON.stringify(w).includes('"order"'));
  check("everyone sees the lock", w.locked === true && L.locked(w));
  const sch = L.schematic({ world: w });
  check("the sheet shows the lock to everyone, what was typed only to the control desk",
    sch.status.some((r) => !r.ctrl && /잠김/.test(r.state)) && sch.status.some((r) => r.ctrl && r.label === "마지막 오입력") && !sch.status.some((r) => !r.ctrl && r.label === "마지막 오입력"));
  check("the sheet knows the marks are lab 1's stamp form", sch.status.some((r) => !r.ctrl && r.label === "미분류 표시"));
  check("the pad says it is locked", /^0/.test(L.padTries(w)) && /^1/.test(L.padTries(L.fresh())));
  let opened = 0, said = "";
  L.use({ world: w, p: { x: L.TERMINAL.x, y: FLOOR }, character: "key", now: Date.now(), say: (s) => { said = s; }, openPad: () => opened++ });
  check("a locked terminal does not open the pad", opened === 0 && /잠겨/.test(said), said);
  L.use({ world: L.local.publicWorld(L.fresh(), L.local.newState(1)), p: { x: L.TERMINAL.x, y: FLOOR }, character: "key", now: Date.now(), say: () => {}, openPad: () => opened++ });
  check("an unlocked one does", opened === 1);
  check("the hint says locked", /잠김/.test(L.hint(w, { x: L.TERMINAL.x, y: FLOOR }, "key", Date.now())));
  check("the overseer asks about the marks when the room opens", /이 표시의 의미를 아는 근무자가 있습니까/.test(L.narrate(L.fresh(), L.local.publicWorld(L.fresh(), L.local.newState(1))) ?? ""));
  check("...and says a wrong entry locks the terminal", /잠급니다/.test(L.narrate({ ...w, tries: 0 }, w) ?? ""));
  check("solo play has no archive: its order is the reading order", L.local.newState(1).order.join() === "0,1,2");
}
{
  // up close, every glyph carries its stamp mark; from the CCTV, nothing
  const said = (cctv, pieces, at) => {
    const out = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === "fillText" ? (s) => out.push(String(s)) : k === "measureText" ? () => ({ width: 8 }) : () => {}), set: () => true });
    const actor = { ...L.newPlayer(), x: at.x, y: at.y, ground: true, character: "light" };
    L.drawOverlay(ctx, { world: { ...L.fresh(), pieces }, actor, cctv, noDarkness: true });
    return out.filter((s) => /^[123]$/.test(s)).join("");
  };
  check("tier 1: up close, the marks under the three glyphs read 1 2 3", said(false, [[4, 4, 4]], { x: L.PIECES[0].x, y: FLOOR }) === "123");
  check("tier 2: the marks run on across pieces (piece 1: 1 2; piece 2 from the ledge: 3 1)",
    said(false, [[4, 4], [5, 5]], { x: L.PIECES[0].x, y: FLOOR }) === "12" && said(false, [[4, 4], [5, 5]], { x: L.PIECES[1].x, y: 16 * T }) === "31");
  check("the CCTV cannot read the marks", said(true, [[4, 4, 4]], { x: L.PIECES[0].x, y: FLOOR }) === "");
}

// ---------- leaving ----------
const shutState = L.local.newState(1);
check("nobody is out while the door is shut", L.local.publicWorld({ ...L.fresh(), out: true }, shutState).out === false);
check("a shut door cannot clear", !L.local.canClear(shutState, { out: true }));
const openState = { ...shutState, door: true };
const outWorld = L.local.publicWorld({ ...L.fresh(), out: true }, openState);
check("out through the open door clears the building", outWorld.out && L.local.canClear(openState, outWorld) && L.finished(outWorld));
let left = 0;
const api = { world: { ...outWorld, out: false }, p: { x: L.OUT_X + 1 }, leave: () => left++ };
L.tick(api);
check("walking past the door is what ends it", left === 1);
L.tick({ ...api, world: { ...api.world, door: false } });
check("no leaving through a shut door", left === 1);

// ---------- the ghost ----------
const xs = Array.from({ length: 120 }, (_, i) => L.ghostAt(i * 100).x);
check("the ghost starts at the entrance", Math.abs(xs[0] - L.SPAWN.x) < 2);
check("the ghost walks through the fake wall", xs.some((x) => x > 31 * T && x < 33 * T));
check("the ghost stops at the terminal, then walks out", xs.some((x) => Math.abs(x - L.TERMINAL.x) < 1) && Math.max(...xs) >= L.OUT_X);
check("the ghost loops every 12 s", L.ghostAt(1234).x === L.ghostAt(1234 + 12000).x);

// ---------- the server's copies, where this Node can load TypeScript ----------
{
  let S9 = null, S1 = null;
  try { S9 = await import("../src/lab9.ts"); S1 = await import("../src/lab1.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S9 || !S1) console.log("SKIP  src/lab9.ts and src/lab1.ts practice tape (run with node --experimental-strip-types to include them)");
  else {
    check("src/lab9.ts practises the same orders", JSON.stringify(S9.ORDERS) === JSON.stringify(L.ORDERS));
    check("src/lab9.ts draws one of them", Array.from({ length: 50 }, () => S9.randomOrder().join()).every((o) => L.ORDERS.some((p) => p.join() === o)));
    const fresh9 = S9.newState(2);
    check("src/lab9.ts: a fresh terminal has an order and no lock", L.ORDERS.some((o) => o.join() === fresh9.order.join()) && fresh9.lockedAt === null && !("order" in S9.publicWorld(null, fresh9)));
    {
      const st = { ...S9.newState(2), order: [1, 0, 2] };
      const shape = JSON.stringify(st.pieces.map((p) => p.length)), before = JSON.stringify(st.pieces);
      const r = [S9.enter(st, S9.exitCode(st.pieces, st.order).map((g, i) => (i ? g : (g + 1) % 6)), 10)];
      S9.shiftEnded(st);
      r.push(S9.enter(st, S9.exitCode(st.pieces, st.order).map((g, i) => (i ? g : (g + 1) % 6)), 20));
      const w = S9.publicWorld(null, st);
      check("src/lab9.ts re-tears on the second miss like public/lab9.js, and says so in the world",
        r.join() === "wrong,reset" && JSON.stringify(st.pieces) !== before && JSON.stringify(st.pieces.map((p) => p.length)) === shape &&
        w.gen === 2 && w.genAt === 20 && w.genWhy === "reset" && !("order" in w) && S9.RETEAR_EVERY === L.RETEAR_EVERY);
      S9.shiftEnded(st);
      check("src/lab9.ts: after a re-tear the archive's order opens first try", S9.enter(st, S9.exitCode(st.pieces, st.order), 30) === "open");
    }
    const STATIONS = [[36 * T + 8, 20 * T], [5 * T + 8, 8 * T], [26 * T + 8, 5 * T]];
    for (const tier of [1, 2, 3]) {
      for (const order of L.ORDERS) {
        const name = `tier ${tier}, order ${order.map((m) => m + 1).join("")}`;
        // the server and the browser judge alike
        const a = { ...S9.newState(tier), pieces: distinct(tier), order: [...order] }, b = { ...L.local.newState(tier), pieces: distinct(tier), order: [...order] };
        const tries = [a.pieces.flat(), S9.exitCode(a.pieces, order), S9.exitCode(a.pieces, order)];
        const ra = [], rb = [];
        tries.forEach((input, k) => { if (k === 2) { S9.shiftEnded(a); L.shiftEnded(b); } ra.push(S9.enter(a, input, 10 + k)); rb.push(L.enter(b, input, 10 + k)); });
        check(`${name}: src/lab9.ts judges and locks like public/lab9.js`, ra.join() === rb.join() && ra.join() === "wrong,locked,open", ra.join());
        // the archive key: lab 1's practice tape for this order, read back, opens this note
        const tape = S1.practiceTape(order, 0);
        const seqs = tape.worlds.map(([, w]) => w.seq);
        const stamped = seqs.at(-1);
        const visits = order.map((i) => tape.frames.some(([, x, y]) => x === STATIONS[i][0] && y === STATIONS[i][1]));
        const firstAt = (i) => tape.frames.findIndex(([, x, y]) => x === STATIONS[i][0] && y === STATIONS[i][1]);
        const flown = order.map(firstAt);
        check(`${name}: lab 1's practice tape (#0, the overseer, no body) stamps the stations in that order, flying to each`,
          tape.logId === 0 && tape.character === "control" && tape.lab === 1 && tape.ms === 60000 &&
          stamped.join() === order.join() && seqs.every((s, k) => s.length === k) && visits.every(Boolean) && flown.every((f, k) => k === 0 || f > flown[k - 1]) &&
          tape.worlds.every(([, w]) => w.order.join() === order.join()) && tape.frames.at(-1)[1] === 21 * T + 8 && tape.frames.length <= 700);
        const st = { ...S9.newState(tier), pieces: distinct(tier), order: [...order] };
        check(`${name}: the order read off the tape opens the exit first time`, S9.enter(st, S9.exitCode(st.pieces, stamped)) === "open");
      }
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
