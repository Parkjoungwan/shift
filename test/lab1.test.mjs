// Checks lab 1 "Joining": each piece of equipment reaches its own stamp in good time and not
// the others', the card door keeps the card's stamp and the lever shut until it is opened, and
// the stamps obey the approval order: drawn every opening at every tier (never ①②③, never the
// run's exit order), legible on the board only to a body in front of it at tier 1, on the control
// desk's sheet only (ctrl) at every tier, and found without either by trying (public refusals).
// Runs the real step() at 60 fps (traps: traps.test.mjs).
// Usage: node test/lab1.test.mjs (node --experimental-strip-types also checks src/lab1.ts)

import * as L from "../public/lab1.js";

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
const fmt = (r) => (r.ok ? `${r.t.toFixed(1)} s` : `stuck at ${r.at} going to ${r.target}`);
const [S1, S2, S3] = L.STAMPS;

// the ways up: the walking aid's shelves, the light's bridges
const SHELVES = [[11 * T, FLOOR], [7 * T + 8, 16 * T], [11 * T + 8, 12 * T], [S2.x, S2.y]];
const BRIDGES = [[22 * T, FLOOR], [26 * T + 8, 17 * T], [29 * T + 8, 14 * T], [26 * T + 8, 11 * T], [29 * T + 8, 8 * T], [S3.x, S3.y]];

// ---------- each to its own stamp ----------
{
  const w = L.fresh(), p = L.newPlayer();
  const r = route(w, p, "key", [[L.READER.x, FLOOR]]);
  check("card: walks to the card reader", r.ok && L.nearReader(p), fmt(r));
  const shut = route(w, { ...p }, "key", [[S1.x, FLOOR]], 4);
  check("card: the shut card door keeps everyone from stamp ①", !shut.ok);
  w.door = true;
  const r2 = route(w, p, "key", [[S1.x, FLOOR], [L.LEVER.x, FLOOR]], 30);
  check("card: through the open door to stamp ① and the lever", r2.ok && L.nearLever(p), fmt(r2));
}
{
  const p = L.newPlayer();
  const r = route(L.fresh(), p, "tall", SHELVES);
  check("walking aid: climbs the three shelves to stamp ② in time", r.ok && L.nearStamp(p) === 1 && r.t < 25, fmt(r));
}
{
  const p = L.newPlayer();
  const r = route(L.fresh(), p, "light", BRIDGES);
  check("light: crosses the lit bridges to stamp ③ in time", r.ok && L.nearStamp(p) === 2 && r.t < 25, fmt(r));
}
{
  // the board is on the hall floor, on the way in: reading it costs a few steps, not a climb
  const p = L.newPlayer();
  const r = route(L.fresh(), p, "tall", [[L.BOARD.x, FLOOR]]);
  check("anyone walks up to the approval-order board by the entrance", r.ok && L.nearBoard(p) && r.t < 3, fmt(r));
}

// ---------- and not to the others' ----------
for (const c of ["key", "light"]) {
  const r = route(L.fresh(), L.newPlayer(), c, SHELVES.slice(0, 2), 8);
  check(`${c}: cannot climb the 4-tile shelves`, !r.ok);
}
for (const c of ["key", "tall"]) {
  const r = route(L.fresh(), L.newPlayer(), c, BRIDGES.slice(0, 3), 8);
  check(`${c}: cannot use the bridges without the light`, !r.ok);
}
check("stamp ② is out of everyone else's reach (4 tiles over the top shelf below)", S2.y === 8 * T && L.tileAt(5, 8) === L.TILE.SOLID);

// ---------- the rules ----------
const WHO = ["key", "tall", "light"];
const TIERS = [1, 2, 3];
{
  const st = { ...L.newState(1), order: [2, 1, 0] };
  check("only the card opens the card door", L.act(st, "tall", "door") === "bad" && L.act(st, "key", "door") === "open" && st.door);
  check("an open door stays open", L.act(st, "key", "door") === "already");
  check("each equipment stamps its own station", L.act(st, "light", "stamp") === "stamped" && st.seq.join() === "2");
  check("a stamp is made once", L.act(st, "light", "stamp") === "already");
  check("no stamp for the console", L.act(st, "control", "stamp") === "bad");
  const half = L.publicWorld({ lab: 1, lever: true }, st);
  check("the lever stays locked until all three are in", half.lever === false && !L.canClear(st, half));
  L.act(st, "tall", "stamp"); L.act(st, "key", "stamp");
  const done = L.publicWorld({ lab: 1, lever: true }, st);
  check("all three in: the lever can be pulled and the lab clears", done.lever === true && L.canClear(st, done));
}

// ---------- the order: drawn every opening, at every tier, never ①②③ (nor the run's exit order) ----------
/** A seeded stand-in for Math.random. */
function seeded(n) {
  let x = (n * 2654435761) % 2147483648 || 1;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}
const ORDERS = L.PERMS.filter((o) => o.join() !== "0,1,2");
for (const tier of TIERS) {
  const seen = new Set();
  for (let n = 0; n < 400; n++) seen.add(L.newState(tier, seeded(n + 1)).order.join());
  check(`tier ${tier}: the order is drawn per opening, from all five orders but ①②③`, seen.size === 5 && !seen.has("0,1,2"), [...seen].join(" "));
  const st = L.newState(tier);
  check(`tier ${tier}: ${tier === 1 ? "posted on the board (not blind)" : "posted on the desk only (blind)"}`, st.blind === (tier >= 2) && st.refused.length === 0 && st.seq.length === 0);
  for (const avoid of ORDERS) {
    const got = new Set();
    for (let n = 0; n < 200; n++) got.add(L.newState(tier, seeded(n + 7), avoid).order.join());
    check(`tier ${tier}: never the run's exit order ${avoid}`, !got.has(avoid.join()) && !got.has("0,1,2") && got.size === 4);
  }
}
{
  const drawn = L.local.newState(1).order.join(); // draw once, then look it up
  check("offline: the solo rules draw an order too", ORDERS.some((o) => o.join() === drawn));
}
{
  const st = { ...L.newState(1), order: [1, 0, 2] };
  L.avoidOrder(st, [1, 0, 2], seeded(3));
  check("avoidOrder: an order equal to the exit order is drawn again", st.order.join() !== "1,0,2" && st.order.join() !== "0,1,2" && st.avoid.join() === "1,0,2");
  const kept = { ...L.newState(1), order: [2, 0, 1] };
  L.avoidOrder(kept, [1, 0, 2]);
  check("...and any other order stays as it was", kept.order.join() === "2,0,1");
  check("the exit order to avoid never reaches the clients", !("avoid" in L.publicWorld(L.fresh(), st)));
}
{
  const mid = { ...L.newState(1, seeded(5)), order: [1, 2, 0] };
  L.act(mid, "tall", "stamp");
  L.retier(mid, 3, seeded(9));
  check("the admin valve keeps stamps already made at the head of the new order", mid.order[0] === 1 && mid.blind && mid.order.join() !== "0,1,2");
  L.retier(mid, 1);
  check("...and tier 1 moves the order back onto the board (an order is always set)", Array.isArray(mid.order) && mid.order[0] === 1 && !mid.blind);
  const r = { ...L.newState(2), order: [2, 0, 1] };
  L.act(r, "key", "stamp");
  check("a refusal is public until the right stamp goes in", r.refused.join() === "0" && L.publicWorld(L.fresh(), r).refused.join() === "0");
  L.retier(r, 3);
  check("the admin valve clears refusals", r.refused.length === 0);
}
{
  const w = { ...L.fresh(), seq: [1], order: [1, 2, 0] };
  check("a worker whose stamp is in has nothing to do", L.useless(w, "tall") && !L.useless(w, "key"));
  check("with all three in, anyone can pull the lever", !L.useless({ ...w, seq: [0, 1, 2] }, "tall"));
  check("a refused station's worker has nothing to do until the next stamp", L.useless({ ...w, refused: [0] }, "key") && !L.useless(w, "light"));
}

// ---------- every order x tier: where the order is (and is not) ----------
/** A canvas that only remembers the text drawn on it. */
function textCtx() {
  const said = [];
  return new Proxy({ said }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "fillText") return (s) => said.push(String(s));
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; },
  });
}
const publicText = (sch) => JSON.stringify([...sch.map.filter((m) => !m.ctrl), ...sch.status.filter((r) => !r.ctrl)]);
/** What the overlay draws: all its text, and the digits on the board (the three station badges come first). */
function boardDigits(w, actor, cctv) {
  const ctx = textCtx();
  L.drawOverlay(ctx, { world: w, actor, cctv, noDarkness: true });
  const digits = ctx.said.filter((x) => /^[123]$/.test(x));
  return { said: ctx.said, stations: digits.slice(0, 3).join(""), board: digits.slice(3).join("") };
}
const atBoard = (character) => ({ ...L.newPlayer(), x: L.BOARD.x, y: FLOOR, character });
const MARKS = /[①②③]/;
for (const tier of TIERS) {
  for (const order of L.PERMS) {
    const st = { ...L.newState(tier), order: [...order] };
    const w = L.publicWorld(L.fresh(), st);
    const sch = L.schematic({ world: w });
    const tag = `tier ${tier} ${order.map((i) => i + 1).join("")}`;
    const row = sch.status.find((r) => r.state === L.orderText(order));
    const nextRows = sch.status.filter((r) => /다음 차례/.test(r.state));
    check(`${tag}: the desk sheet has the order and "next", both ctrl`, row?.ctrl === true && nextRows.length === 1 && nextRows.every((r) => r.ctrl));
    check(`${tag}: nothing public on the sheet tells the order`, !publicText(sch).includes("→") && !publicText(sch).includes("다음 차례"));
    check(`${tag}: the public sheet says where the order lives`, sch.map.some((m) => !m.ctrl && m.kind === "label" && m.text === (tier === 1 ? "결재 순서판 · 가까이서만 읽힘" : "결재 순서판 · 관제실 문의")));
    // the CCTV (and every tape) films the board but cannot read it
    const cam = boardDigits(w, atBoard("key"), true);
    check(`${tag}: the CCTV never reads the order off the board`, cam.stations === "123" && cam.board === "" && cam.said.includes("결재 순서") && cam.said.includes("관제실 문의") === (tier >= 2));
    // a body in front of the board
    const want = order.map((i) => i + 1).join("");
    for (const c of WHO) {
      const body = boardDigits(w, atBoard(c), false);
      const hint = L.hint(w, atBoard(c), c);
      if (tier === 1) check(`${tag}: ${c} reads the order up close (board and hint)`, body.board === want && hint === `결재 순서 ${L.orderText(order)}`, `${body.board} / ${hint}`);
      else check(`${tag}: ${c} in front of the board reads only "관제실 문의"`, body.board === "" && body.said.includes("관제실 문의") && !MARKS.test(hint));
    }
    const far = { ...atBoard("light"), x: L.BOARD.x + 3 * T };
    check(`${tag}: a step away, the board is three blank slips`, boardDigits(w, far, false).board === "" && !MARKS.test(L.hint(w, far, "light")));
    check(`${tag}: the overseer's drone has no body: it does not read the board`, boardDigits(w, atBoard("control"), false).board === "");
    check(`${tag}: picking equipment does not give the order away`, WHO.every((c) => !L.useless(w, c)));
    // a refusal never names the next stamp
    const said = L.acted("stamp", "order", w);
    check(`${tag}: a refusal points to ${tier === 1 ? "the board" : "the desk"}, never to the next stamp`, !MARKS.test(said) && said.includes(tier === 1 ? "게시판" : "관제실"));
    // the veteran: stamps in number order ①②③, one shift each; refused at least once, never locked
    {
      const v = { ...L.newState(tier), order: [...order] };
      let shifts = 0, refusals = 0, ok = true;
      while (v.seq.length < 3 && shifts < 12) {
        const seen = L.publicWorld(L.fresh(), v);
        const c = WHO.find((k) => !L.useless(seen, k)); // number order among those still worth a shift
        if (!c) { ok = false; break; }
        const r = L.act(v, c, "stamp");
        shifts++;
        if (r === "order") {
          refusals++;
          const after = L.publicWorld(L.fresh(), v);
          // recovery: the refusal is public (lamp, sheet); the station takes its stamp in its turn
          ok = ok && after.refused.includes(L.STAMP_OF[c]) && L.schematic({ world: after }).status.some((x) => x.state === "반려" && !x.ctrl);
        } else ok = ok && r === "stamped" && v.refused.length === 0;
      }
      const plain = order.join() === "0,1,2";
      check(`${tag}: number order ${plain ? "works only for ①②③ (never drawn)" : "is refused at least once"}, then the red lamps lead to all three within 6 shifts`,
        ok && v.seq.join() === order.join() && shifts <= 6 && (plain ? refusals === 0 : refusals >= 1), `${shifts} shifts, ${refusals} refused`);
    }
    // whoever read it (tier 1: the board, carried by note; 2-3: the desk): three shifts, no refusal
    {
      const v = { ...L.newState(tier), order: [...order] };
      check(`${tag}: in the posted order, three shifts and no refusal`, order.every((i) => L.act(v, WHO[i], "stamp") === "stamped") && v.refused.length === 0);
    }
  }
}

// ---------- the server's copy (src/lab1.ts), where this Node can load TypeScript ----------
{
  let S = null;
  try { S = await import("../src/lab1.ts"); } catch { /* needs --experimental-strip-types before Node 22.18 */ }
  if (!S) console.log("SKIP  src/lab1.ts parity (run with node --experimental-strip-types to include it)");
  else {
    const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
    for (const tier of TIERS) {
      const seen = new Set();
      for (let n = 0; n < 300; n++) seen.add(S.newState(tier).order.join());
      check(`src/lab1.ts tier ${tier}: draws all five orders but ①②③, blind like public/lab1.js`, seen.size === 5 && !seen.has("0,1,2") && S.newState(tier).blind === L.newState(tier).blind, [...seen].join(" "));
      for (const avoid of ORDERS) {
        let bad = false;
        for (let n = 0; n < 100; n++) {
          const a = S.newState(tier);
          S.avoidOrder(a, avoid);
          bad ||= a.order.join() === avoid.join() || a.order.join() === "0,1,2" || a.avoid.join() !== avoid.join() || "avoid" in S.publicWorld({}, a);
        }
        check(`src/lab1.ts tier ${tier}: avoidOrder never leaves the exit order ${avoid}, and never publishes it`, !bad);
      }
      for (const order of L.PERMS) {
        const a = { ...S.newState(tier), order: [...order] }, b = { ...L.newState(tier), order: [...order] };
        const ra = [], rb = [];
        for (const c of [...WHO, ...WHO, ...WHO]) {
          ra.push(S.act(a, c, "stamp"), sorted(S.publicWorld({}, a)));
          rb.push(L.act(b, c, "stamp"), sorted(L.publicWorld({}, b)));
        }
        check(`src/lab1.ts tier ${tier} ${order}: refuses, recovers and publishes like public/lab1.js`, ra.join() === rb.join() && a.seq.join() === order.join(), ra.filter((_, k) => k % 2 === 0).join(" "));
      }
    }
    const m = { ...S.newState(1), order: [1, 2, 0] };
    S.act(m, "tall", "stamp");
    S.retier(m, 3);
    check("src/lab1.ts: the admin valve keeps the head and blinds tiers 2-3", m.order[0] === 1 && m.blind && m.refused.length === 0);
    S.retier(m, 1);
    check("src/lab1.ts: ...and tier 1 keeps an order, on the board", Array.isArray(m.order) && m.order[0] === 1 && !m.blind);
    // S5: the practice tape (exit order) is the archive's; the drone never reads the board
    for (const order of ORDERS) {
      const tape = S.practiceTape(order, 0);
      const last = tape.worlds.at(-1)[1];
      const sch = L.schematic({ world: last });
      check(`practice tape ${order}: stamps in the exit order; on the archive sheet (ctrl), never readable off the board`,
        last.seq.join() === order.join() && sch.status.some((r) => r.ctrl && r.state === L.orderText(order)) && boardDigits(tape.worlds[0][1], atBoard("control"), false).board === "" && tape.character === "control");
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
