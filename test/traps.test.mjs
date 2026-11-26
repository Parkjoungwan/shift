// Checks the traps every lab declares (public/engine.js): they fire and rest on schedule, catch a
// body that stands in them only while firing, give enough time to pass, and keep away from the
// entrance. Usage: node test/traps.test.mjs
import { LABS } from "../public/labs.js";
import { P, T, TILE, trapHit, trapState, WARN_MS } from "../public/engine.js";

let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
  if (!ok) failed++;
}

for (const [id, lab] of Object.entries(LABS)) {
  for (const [i, trap] of (lab.traps ?? []).entries()) {
    const name = `lab ${id} trap ${i + 1} (${trap.kind})`;
    if (trap.kind === "shock") {
      // a live floor in a pit: always on and always shown, reached only by falling (lab 5's trench)
      const mid = (trap.x0 + trap.x1) / 2;
      check(`${name} is shown`, !trap.hidden);
      check(`${name} catches someone standing on it`, !!trapHit({ traps: [trap] }, { x: mid, y: trap.y }, 0));
      check(`${name} spares someone above it`, !trapHit({ traps: [trap] }, { x: mid, y: trap.y - T }, 0));
      check(`${name} lies below the entrance floor (you only reach it by falling)`, trap.y > lab.SPAWN.y);
      continue;
    }
    if (trap.kind === "plate") {
      // a hidden pressure plate: standing on it is an accident, passing over it is not
      const mid = (trap.x0 + trap.x1) / 2;
      check(`${name} is hidden`, trap.hidden === true);
      check(`${name} catches someone standing on it`, !!trapHit({ traps: [trap] }, { x: mid, y: trap.y }, 0));
      check(`${name} lets a jump pass over it`, !trapHit({ traps: [trap] }, { x: mid, y: trap.y - 20 }, 0));
      check(`${name} is narrow enough to jump (≤ 2 tiles)`, trap.x1 - trap.x0 <= 2 * T);
      // there is floor on both sides to jump from and land on, and the plate itself is on a floor
      const row = trap.y / T, solid = (tx) => lab.tileAt(tx, row) === TILE.SOLID, open = (tx) => lab.tileAt(tx, row - 1) !== TILE.SOLID;
      const left = trap.x0 / T - 1, right = trap.x1 / T;
      check(`${name} sits on a floor`, solid(trap.x0 / T) && open(trap.x0 / T));
      // safe floor beside it to land on (a plate may sit on a ledge's edge: land past it)
      check(`${name} leaves safe floor beside it`, (solid(left) && open(left)) || (solid(right) && open(right)));
      const gap = Math.max(trap.x0 - lab.SPAWN.x, lab.SPAWN.x - trap.x1);
      check(`${name} is not within reach of the entrance`, gap > P.run * 1.0 || Math.abs(trap.y - lab.SPAWN.y) > 3 * T, `${gap} px`);
      // Knowing where it is must be enough: a plain jump gets past it from a wide range of takeoff
      // points (no pixel-perfect timing). Walk up on the same floor with the card (the lowest jump),
      // or climb up from the floor below with the walking aid; from either side.
      const window = hopWindow(lab, trap);
      check(`${name} is easy to avoid once known (takeoff window ≥ one tile)`, window >= T, `${window} px`);
      continue;
    }
    if (trap.mat !== undefined) {
      // a press made to be stopped (room 2-2): too quick to run under, still with a box on its mat
      const c0 = Math.floor(trap.x0 / T), c1 = Math.floor((trap.x1 - 1) / T);
      const mid = { x: (trap.x0 + trap.x1) / 2, y: trap.bottom };
      const live = { presses: 9, boxes: [], held: -1 }, held = { presses: 9, boxes: [{ col: c0, row: 19 }], held: -1 };
      check(`${name} has a working mat under it`, typeof lab.trapStopped === "function" && lab.tileAt(c0, 20) === TILE.SOLID && lab.tileAt(c1, 20) === TILE.SOLID);
      let gap = 0, longest = 0;
      for (let now = 0; now < 20_000; now += 10) { if (trapHit(lab, mid, now, live)) gap = 0; else longest = Math.max(longest, gap += 10); }
      check(`${name} never rests long enough to run under (< 0.5 s)`, longest < 500, `${longest} ms`);
      check(`${name} stops dead with a box on its mat`, Array.from({ length: 200 }, (_, k) => !trapHit(lab, mid, k * 100, held)).every(Boolean));
      check(`${name} is not within reach of the entrance`, trap.x0 - lab.SPAWN.x > P.run);
      continue;
    }
    // a body standing in the middle of the trap, feet on its lower edge
    const x = (trap.x0 + trap.x1) / 2;
    const y = trap.kind === "press" ? trap.bottom : trap.y1;
    const body = { x, y };
    let fired = 0, rested = 0, wrong = 0, longestRest = 0, rest = 0;
    for (let now = 0; now < 20_000; now += 10) {
      const s = trapState(trap, now), hit = !!trapHit({ traps: [trap] }, body, now);
      if (s.active) { fired++; rest = 0; } else { rested++; rest += 10; longestRest = Math.max(longestRest, rest); }
      if (hit !== s.active) wrong++;
    }
    check(`${name} fires and rests`, fired > 0 && rested > 0);
    check(`${name} catches a body only while it fires`, wrong === 0, `${wrong} mismatches`);
    check(`${name} rests long enough to pass (≥ 1.2 s)`, longestRest >= 1200, `${longestRest} ms`);
    // it warns before it fires
    const cycle = trap.kind === "laser" ? trap.on + trap.off : trap.period;
    const beforeFire = cycle - (trap.phase ?? 0) - WARN_MS / 2;
    check(`${name} warns before it fires`, trapState(trap, beforeFire).warn === true);
    // nowhere near the entrance: at least 2 s of running away
    const spawn = lab.SPAWN, gap = Math.max(trap.x0 - spawn.x, spawn.x - trap.x1);
    check(`${name} is not within reach of the entrance`, gap > P.run * 1.0 || Math.abs((trap.kind === "press" ? trap.bottom : trap.y1) - spawn.y) > 3 * 16, `${gap} px`);
  }
}

/**
 * The widest range (in px) of takeoff points from which one held jump carries a worker past the
 * plate onto safe floor, over every approach: same floor with the card, or the floor below with
 * the walking aid; from the left and from the right.
 */
function hopWindow(lab, trap) {
  let best = 0;
  const approaches = [{ character: "key", y: trap.y }, { character: "tall", y: trap.y + 4 * T }];
  for (const { character, y } of approaches) {
    for (const dir of [1, -1]) {
      let ok = 0;
      const edge = dir > 0 ? trap.x0 : trap.x1;
      for (let takeoff = edge - dir * 90; dir > 0 ? takeoff < edge : takeoff > edge; takeoff += dir) {
        const start = takeoff - dir * 40; // a short run-up
        if (!standable(lab, start, y) || !standable(lab, takeoff, y)) continue;
        if (attempt(lab, trap, character, start, y, takeoff, dir)) ok++;
      }
      best = Math.max(best, ok);
    }
  }
  return best;
}
function standable(lab, x, y) {
  const tx = Math.floor(x / T), row = y / T;
  return Number.isInteger(row) && lab.tileAt(tx, row) === TILE.SOLID && lab.tileAt(tx, row - 1) !== TILE.SOLID && lab.tileAt(tx, row - 2) !== TILE.SOLID;
}
/** Runs toward the plate, jumps at `takeoff` and holds the jump; true when it lands past the plate unharmed. */
function attempt(lab, trap, character, startX, y, takeoff, dir) {
  const world = lab.fresh(), p = { ...lab.newPlayer(), x: startX, y }, dt = 1 / 60;
  let jumped = false;
  for (let f = 0; f < 120; f++) {
    const now = f * 1000 * dt;
    const press = !jumped && (dir > 0 ? p.x >= takeoff : p.x <= takeoff);
    if (press) jumped = true;
    lab.step(world, p, { left: dir < 0, right: dir > 0, jumpPressed: press, jumpHeld: jumped }, character, dt, now);
    if (trapHit({ traps: [trap] }, p, now)) return false;
    const past = dir > 0 ? p.x - P.w / 2 > trap.x1 : p.x + P.w / 2 < trap.x0;
    // Same floor: it has to get across. From below: landing safely beside the plate is the point
    // (a plate on a ledge's edge is avoided by climbing on from the other side).
    const fromBelow = y !== trap.y;
    if (jumped && p.ground && Math.abs(p.y - trap.y) < 1 && (past || fromBelow)) return true;
  }
  return false;
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
