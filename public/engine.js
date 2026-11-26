// Shared rules for every lab: room size, equipment, movement physics and a few drawing helpers.
// Each lab module (lab3.js, lab4.js, ...) supplies its map and devices and re-exports this file,
// so code that only needs the basics can keep using `Lab.T`, `Lab.P`, `Lab.W` and so on.
// Pure logic; no DOM access, so it runs under Node for tests and in the Worker.

import { t, FONT_FALLBACK } from "./i18n.js";

export const T = 16; // tile size in world pixels
export const COLS = 40;
export const ROWS = 22;
export const W = COLS * T; // 640
export const H = ROWS * T; // 352

export const EQUIP = {
  key: { name: t("출입 카드"), color: "#e0b83a", ability: t("단말기 · 문 · 차단기") },
  tall: { name: t("보행 보조 장치"), color: "#4a8fe0", ability: t("높은 점프 · 4칸 선반") },
  light: { name: t("조명"), color: "#b07cf0", ability: t("빛 발판 · 자외선 기호") },
  echo: { name: t("잔상 기록기"), color: "#46c98a", ability: t("마지막 8초가 남아 버튼을 누름") },
  phase: { name: t("위상 이동기"), color: "#f08a3a", ability: t("방 위상 청↔적 (근무당 2번) · 위상 닻") },
  // no body: a shift at the console (see directives.js)
  control: { name: t("관제"), color: "#3fd0ff", ability: t("도면 · 번호 핀 지시문 · 쪽지 도장") },
};

export const LIGHT_R = 88;

// Movement tuned from Celeste's Player.cs, doubled for 16 px tiles.
export const P = {
  w: 10, h: 22,
  run: 140, accel: 1400, airMul: 0.65,
  // tallVarJump: the walking aid tops out at 4.9 tiles (78 px): 4-tile shelves with room to spare,
  // and 5 tiles never (lab 2's lever is 5 up: only from a box). docs/level-design.md §2.3
  grav: 1800, jump: 210, varJump: 0.2, tallVarJump: 0.3,
  apex: 80, maxFall: 320, coyote: 0.1, buffer: 0.1,
};

// FAKE: a fake wall. Every view draws it as solid rock (the 3D room, the blueprint, the flat view),
// but nothing collides with it: you can walk straight through, if you know.
// BLUE / RED: phase blocks (lab 5). The room is always in one phase; a block is solid in its own
// phase, or always while a phase anchor holds its colour (world.phase, world.anchor).
export const TILE = { SOLID: 1, BRIDGE: 2, DOOR: 3, FAKE: 4, BLUE: 5, RED: 6 };
/** True for tiles that look like rock, whether or not they are. */
export const looksSolid = (v) => v === TILE.SOLID || v === TILE.FAKE;
export const PHASE_OF = { [TILE.BLUE]: "blue", [TILE.RED]: "red" };
export const PHASE_COLOR = { blue: "#3a7fd8", red: "#d8483a" };
export const PHASE_NAME = { blue: t("청"), red: t("적") };
/** Whether a phase block of this tile value is solid in this world. */
export function phaseSolid(world, v) {
  const c = PHASE_OF[v];
  return !!c && (world?.phase === c || world?.anchor === c);
}

/** A grid of SOLID with the listed rectangles carved or filled: [x0, y0, x1, y1, value]. */
export function makeGrid(fills) {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(TILE.SOLID));
  for (const [x0, y0, x1, y1, v] of fills) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = v;
  }
  return (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? TILE.SOLID : grid[ty][tx]);
}

export function center(p) {
  return { x: p.x, y: p.y - P.h / 2 };
}

/** True when this tile is inside the light carried by an actor with the given equipment. */
export function litBy(actor, tx, ty) {
  if (!actor || actor.character !== "light") return false;
  const c = center(actor);
  return Math.hypot(tx * T + T / 2 - c.x, ty * T + T / 2 - c.y) < LIGHT_R;
}

/** A standing spot: feet within 2 px of the floor height and the body overlapping [x0, x1]. */
export function standsIn(pos, x0, x1, y) {
  return !!pos && pos.x + P.w / 2 > x0 && pos.x - P.w / 2 < x1 && Math.abs(pos.y - y) < 2;
}

export function near(pos, spot, reach = 20) {
  return !!pos && Math.abs(pos.x - spot.x) < reach && Math.abs(pos.y - spot.y) < 2;
}

// ---------- physics ----------

/**
 * Solid test for the player's box at (x, y). feet: when given, the move is downward from that
 * height, and one-way surfaces (bridges, lifts) at or below it count as floor.
 */
function hits(lab, world, x, y, actor, feet, now, bodies) {
  const l = Math.floor((x - P.w / 2) / T), r = Math.floor((x + P.w / 2 - 0.001) / T);
  const t = Math.floor((y - P.h) / T), b = Math.floor((y - 0.001) / T);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (lab.solidAt(world, tx, ty, actor, feet, now)) return true;
  if (feet !== undefined) {
    for (const s of bodies) {
      if (s.y >= feet - 0.001 && y > s.y && x + P.w / 2 > s.x0 && x - P.w / 2 < s.x1) return true;
    }
  }
  return false;
}

function approach(v, target, amount) {
  return v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
}

/**
 * Advances the local player one frame in the given lab.
 * input: { left, right, jumpPressed, jumpHeld }; now: server time in ms (moving lifts depend on it).
 */
export function step(lab, world, p, input, character, dt, now = Date.now()) {
  const actor = { ...p, character };
  const bodies = lab.bodies ? lab.bodies(world, now) : [];

  // Ride a lift: stay on its surface as it moves.
  if (bodies.length && lab.bodies) {
    const before = lab.bodies(world, now - dt * 1000);
    for (let i = 0; i < bodies.length; i++) {
      const was = before[i], s = bodies[i];
      if (was && Math.abs(p.y - was.y) < 1.5 && p.x + P.w / 2 > was.x0 && p.x - P.w / 2 < was.x1 && p.vy >= 0) {
        p.y = s.y;
        p.vy = 0;
        break;
      }
    }
  }
  unstick(lab, world, p, actor, now, bodies);

  p.ground = hits(lab, world, p.x, p.y + 1, actor, p.y, now, bodies);
  p.coyote = p.ground ? P.coyote : p.coyote - dt;
  p.buffer = input.jumpPressed ? P.buffer : p.buffer - dt;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.face = dir;
  p.vx = approach(p.vx, dir * P.run, P.accel * (p.ground ? 1 : P.airMul) * dt);

  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -P.jump;
    p.varJump = character === "tall" ? P.tallVarJump : P.varJump;
    p.buffer = 0;
    p.coyote = 0;
    p.ground = false;
  }
  const half = Math.abs(p.vy) < P.apex && input.jumpHeld;
  p.vy = Math.min(P.maxFall, p.vy + P.grav * (half ? 0.5 : 1) * dt);
  if (p.varJump > 0) {
    if (input.jumpHeld) p.vy = Math.min(p.vy, -P.jump);
    else p.varJump = 0;
    p.varJump -= dt;
  }

  // Move one pixel at a time so nothing tunnels through a tile.
  let dx = p.vx * dt;
  while (dx !== 0) {
    const s = Math.abs(dx) < 1 ? dx : Math.sign(dx);
    if (hits(lab, world, p.x + s, p.y, actor, undefined, now, bodies)) { p.vx = 0; break; }
    p.x += s; dx -= s;
  }
  let dy = p.vy * dt;
  while (dy !== 0) {
    const s = Math.abs(dy) < 1 ? dy : Math.sign(dy);
    if (hits(lab, world, p.x, p.y + s, actor, s > 0 ? p.y : undefined, now, bodies)) {
      if (s > 0) p.ground = true;
      else p.varJump = 0;
      p.vy = 0;
      break;
    }
    p.y += s; dy -= s;
  }
}

/** A door that closed on the player pushes them out to the nearest free side instead of trapping them. */
function unstick(lab, world, p, actor, now, bodies) {
  if (!hits(lab, world, p.x, p.y, actor, undefined, now, bodies)) return;
  for (let d = 1; d <= T + P.w; d++) {
    for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d]]) {
      if (!hits(lab, world, p.x + ox, p.y + oy, actor, undefined, now, bodies)) { p.x += ox; p.y += oy; return; }
    }
  }
}

// ---------- traps (docs/campaign.md §3) ----------
// A lab lists its traps as data: `export const traps = [...]`. Touching an active trap ends the
// shift at once (산재, an industrial accident). A trap's state is a pure function of server time,
// so every screen, the blueprint and every tape replay agree without any messages.
//   laser: { kind: "laser", x0, y0, x1, y1, on, off, phase }   a beam in the rectangle, on for `on` ms
//          then off for `off` ms. It flickers for WARN_MS before it comes on.
//   press: { kind: "press", x0, x1, top, bottom, period, down, phase }   a head that slams from `top`
//          to `bottom` and stays down for `down` ms each `period`, then rises; it shakes before it drops.
//   plate: { kind: "plate", x0, x1, y, hidden: true }   a hidden pressure plate in the floor at height
//          `y`: standing on it is an accident. Nothing shows it, not the CCTV, not the blueprint, not
//          the field view: only the light's ultraviolet beam. People learn it by dying, by watching
//          the tape, or from a note. It is one tile wide: knowing where it is is enough to avoid it
//          (a plain hop clears it; test/traps.test.mjs checks the takeoff window from both sides).
//   shock: { kind: "shock", x0, x1, y }   an electrified floor at height `y`, always live and always
//          shown. Harmless while something solid lies over it (lab 5: the phase bridge); landing on it
//          is an accident.
// Rules: visible traps show on the CCTV; none within reach of the entrance; none blocks for good.

export const WARN_MS = 450;
const PRESS_RISE = 600;
const mod = (a, n) => ((a % n) + n) % n;

/** { active, warn, k } for a trap at a server time. k: how far the press head has come down (0-1). */
export function trapState(trap, now, world = null, lab = null) {
  // a lab may stop a trap by what lies in the room (room 2-2: a box on a press's safety mat)
  if (world && lab?.trapStopped?.(trap, world)) return { active: false, warn: false, k: 0, stopped: true };
  if (trap.kind === "laser") {
    const cycle = trap.on + trap.off, t = mod(now + (trap.phase ?? 0), cycle);
    return { active: t < trap.on, warn: t >= cycle - WARN_MS, k: t < trap.on ? 1 : 0 };
  }
  if (trap.kind === "press") {
    const t = mod(now + (trap.phase ?? 0), trap.period);
    if (t < trap.down) return { active: true, warn: false, k: 1 };
    if (t < trap.down + PRESS_RISE) return { active: false, warn: false, k: 1 - (t - trap.down) / PRESS_RISE };
    return { active: false, warn: t >= trap.period - WARN_MS, k: 0 };
  }
  if (trap.kind === "plate" || trap.kind === "shock") return { active: true, warn: false, k: 1 }; // always armed
  return { active: false, warn: false, k: 0 };
}

/** The deadly part of a trap right now, as a rectangle in world pixels, or null. */
export function trapZone(trap, now, world = null, lab = null) {
  const s = trapState(trap, now, world, lab);
  if (!s.active) return null;
  if (trap.kind === "laser") return { x0: trap.x0, y0: trap.y0, x1: trap.x1, y1: trap.y1 };
  if (trap.kind === "press") return { x0: trap.x0, y0: trap.top, x1: trap.x1, y1: trap.bottom };
  return null;
}

/** The trap the player's body is touching right now, or null. */
export function trapHit(lab, p, now, world = null) {
  for (const trap of lab.traps ?? []) {
    if (trap.kind === "plate" || trap.kind === "shock") { // stepping on it, not passing over it
      if (standsIn(p, trap.x0, trap.x1, trap.y)) return trap;
      continue;
    }
    const z = trapZone(trap, now, world, lab);
    if (z && p.x + P.w / 2 > z.x0 && p.x - P.w / 2 < z.x1 && p.y > z.y0 && p.y - P.h < z.y1) return trap;
  }
  return null;
}

export const TRAP_NAME = { laser: t("레이저"), press: t("프레스"), plate: t("감전판"), shock: t("감전 바닥") };

/**
 * Draws a lab's traps in world pixels (the overlay on the 3D room, and the flat 2D room).
 * viewer: the worker whose eyes these are, or null for the CCTV. Hidden traps only show inside
 * the light's beam.
 */
export function drawTraps(ctx, lab, now, viewer = null, world = null) {
  for (const trap of lab.traps ?? []) {
    if (trap.hidden) {
      const cx = (trap.x0 + trap.x1) / 2, c = viewer && center(viewer);
      if (viewer?.character !== "light" || Math.hypot(cx - c.x, trap.y - c.y) > LIGHT_R) continue;
      // in ultraviolet: a dashed outline in the floor and a bolt
      ctx.fillStyle = EQUIP.light.color;
      for (let x = trap.x0; x < trap.x1; x += 4) { ctx.fillRect(x, trap.y - 3, 2, 1); ctx.fillRect(x + 2, trap.y - 1, 2, 1); }
      ctx.fillRect(trap.x0, trap.y - 3, 1, 3); ctx.fillRect(trap.x1 - 1, trap.y - 3, 1, 3);
      ctx.font = "8px Galmuri7, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("⚡", cx, trap.y - 6);
      continue;
    }
    const s = trapState(trap, now, world, lab);
    if (s.stopped) {
      // held at the top by its safety interlock: a green lamp on the frame
      ctx.fillStyle = "#1e1e1c"; ctx.fillRect(trap.x0, trap.top, trap.x1 - trap.x0, 10);
      ctx.fillStyle = "#5bd67a"; ctx.fillRect((trap.x0 + trap.x1) / 2 - 3, trap.top + 3, 6, 4);
      ctx.fillStyle = "#e8b830"; for (let i = 0; i < trap.x1 - trap.x0; i += 6) ctx.fillRect(trap.x0 + i, trap.top + 9, 3, 1);
      continue;
    }
    if (trap.kind === "shock") {
      // a live floor: yellow and black, with a sparking zigzag that moves along it
      const w = trap.x1 - trap.x0;
      for (let i = 0; i < w; i += 4) { ctx.fillStyle = (i / 4) % 2 ? "#1e1e1c" : "#e8b830"; ctx.fillRect(trap.x0 + i, trap.y - 2, 4, 2); }
      ctx.strokeStyle = "#9fe8ff"; ctx.lineWidth = 1; ctx.beginPath();
      const off = Math.floor(now / 70) % 6;
      for (let x = trap.x0; x <= trap.x1; x += 3) ctx.lineTo(x, trap.y - 4 - ((Math.floor((x + off) / 3) % 2) ? 3 : 0));
      ctx.stroke();
      continue;
    }
    if (trap.kind === "laser") {
      const vertical = trap.y1 - trap.y0 > trap.x1 - trap.x0;
      // emitters at both ends, painted with hazard stripes
      ctx.fillStyle = "#1e1e1c";
      if (vertical) { ctx.fillRect(trap.x0 - 3, trap.y0 - 3, trap.x1 - trap.x0 + 6, 4); ctx.fillRect(trap.x0 - 3, trap.y1 - 1, trap.x1 - trap.x0 + 6, 4); }
      else { ctx.fillRect(trap.x0 - 3, trap.y0 - 3, 4, trap.y1 - trap.y0 + 6); ctx.fillRect(trap.x1 - 1, trap.y0 - 3, 4, trap.y1 - trap.y0 + 6); }
      ctx.fillStyle = s.active || s.warn ? "#c8402e" : "#5c2a24";
      if (vertical) { ctx.fillRect(trap.x0 - 2, trap.y0 - 2, trap.x1 - trap.x0 + 4, 2); ctx.fillRect(trap.x0 - 2, trap.y1, trap.x1 - trap.x0 + 4, 2); }
      else { ctx.fillRect(trap.x0 - 2, trap.y0 - 2, 2, trap.y1 - trap.y0 + 4); ctx.fillRect(trap.x1, trap.y0 - 2, 2, trap.y1 - trap.y0 + 4); }
      if (s.active) {
        ctx.fillStyle = "#c8402e"; ctx.fillRect(trap.x0, trap.y0, trap.x1 - trap.x0, trap.y1 - trap.y0);
        ctx.fillStyle = "#f4ecd8";
        if (vertical) ctx.fillRect((trap.x0 + trap.x1) / 2 - 0.5, trap.y0, 1, trap.y1 - trap.y0);
        else ctx.fillRect(trap.x0, (trap.y0 + trap.y1) / 2 - 0.5, trap.x1 - trap.x0, 1);
      } else if (s.warn && Math.floor(now / 90) % 2) {
        // a dotted warning line just before it fires
        ctx.fillStyle = "#c8402e";
        if (vertical) for (let y = trap.y0; y < trap.y1; y += 4) ctx.fillRect((trap.x0 + trap.x1) / 2 - 0.5, y, 1, 2);
        else for (let x = trap.x0; x < trap.x1; x += 4) ctx.fillRect(x, (trap.y0 + trap.y1) / 2 - 0.5, 2, 1);
      }
    } else if (trap.kind === "press") {
      const shake = s.warn ? (Math.floor(now / 60) % 2 ? 1 : -1) : 0;
      const head = 10, y = trap.top + (trap.bottom - head - trap.top) * s.k;
      const x0 = trap.x0 + shake, w = trap.x1 - trap.x0;
      ctx.fillStyle = "#43423c"; ctx.fillRect(x0 + w / 2 - 2, trap.top, 4, y - trap.top); // piston rod
      ctx.fillStyle = "#1e1e1c"; ctx.fillRect(x0, y, w, head);
      ctx.fillStyle = "#e8b830"; // hazard stripes on the head
      for (let i = 0; i < w; i += 6) ctx.fillRect(x0 + i, y + 2, 3, head - 4);
      ctx.fillStyle = "#c8402e"; ctx.fillRect(x0, y + head - 1, w, 1);
      // the danger strip painted on the floor below
      ctx.fillStyle = "#c8402e88";
      for (let i = 0; i < w; i += 4) ctx.fillRect(trap.x0 + i, trap.bottom - 1, 2, 1);
    }
  }
}

// ---------- 2D drawing shared by the labs (used when WebGL is not available) ----------

export function drawTiles(ctx, lab, world, actor, now) {
  ctx.fillStyle = "#0d0f13";
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = lab.tileAt(x, y);
      if (!looksSolid(v)) { ctx.fillStyle = "#181c24"; ctx.fillRect(x * T, y * T, T, T); }
      if (looksSolid(v)) {
        ctx.fillStyle = "#2c323e";
        ctx.fillRect(x * T, y * T, T, T);
        if (!looksSolid(lab.tileAt(x, y - 1))) { ctx.fillStyle = "#4a5263"; ctx.fillRect(x * T, y * T, T, 2); }
      } else if (v === TILE.DOOR) {
        if (lab.doorOpen(world, x, y, now)) { ctx.strokeStyle = "#c04a4a55"; ctx.strokeRect(x * T + 4.5, y * T + 0.5, T - 9, T - 1); }
        else { ctx.fillStyle = "#8a2f2f"; ctx.fillRect(x * T + 3, y * T, T - 6, T); ctx.fillStyle = "#c04a4a"; ctx.fillRect(x * T + 3, y * T, 2, T); }
      } else if (PHASE_OF[v]) {
        const color = PHASE_COLOR[PHASE_OF[v]];
        if (phaseSolid(world, v)) { ctx.fillStyle = color; ctx.fillRect(x * T, y * T, T, T); ctx.fillStyle = "#ffffff55"; ctx.fillRect(x * T, y * T, T, 2); }
        else if (actor?.character === "phase") { ctx.strokeStyle = color; ctx.setLineDash([2, 2]); ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1); ctx.setLineDash([]); }
      } else if (v === TILE.BRIDGE && litBy(actor, x, y)) {
        ctx.fillStyle = "#7fd0ff88";
        ctx.fillRect(x * T, y * T, T, 5);
        ctx.fillStyle = "#c8ecff";
        ctx.fillRect(x * T, y * T, T, 1);
      }
    }
  }
}

export function drawLever2D(ctx, spot, on) {
  ctx.strokeStyle = "#9aa3b2"; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(spot.x, spot.y - 2); ctx.lineTo(spot.x + (on ? -7 : 7), spot.y - 14); ctx.stroke();
  ctx.fillStyle = on ? "#5bd67a" : "#e06060"; ctx.fillRect(spot.x - 4, spot.y - 4, 8, 4);
}

export function drawActor2D(ctx, actor, alpha = 1) {
  if (!actor) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = EQUIP[actor.character]?.color ?? "#fff";
  ctx.fillRect(Math.round(actor.x - P.w / 2), Math.round(actor.y - P.h), P.w, P.h);
  ctx.fillStyle = "#0d0f13";
  ctx.fillRect(Math.round(actor.x + (actor.face > 0 ? 1 : -4)), Math.round(actor.y - P.h + 5), 3, 3);
  ctx.globalAlpha = 1;
}

export function drawNameTag(ctx, actor) {
  ctx.font = `11px system-ui, ${FONT_FALLBACK}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffffcc";
  ctx.fillText(actor.nick, actor.x, actor.y - P.h - 5);
}
