// Room 3-2 "Split code" (갈라진 기호), the second stage of lab 3. docs/level-design.md.
//
// Lab 3 taught that the one who sees the code is not the one who types it. Here the code is split
// by kind, not by halves (KTANE: rule x state; Outer Wilds: combine clues). The high plaque, read
// only by the walking aid on its ledge, carries an ORDER: all six glyphs laid out in a row, a 3x2
// grid or a ring, with a drawn path through them (a start dot with a tail, an arrow on every
// step). No words, so it reads the same in every language; the path, not left or right, says
// where to begin. The ultraviolet wall in the dark alcove, only for the light, carries a SET:
// four different glyphs scattered with no order. The card types the set in the plaque's order.
// One note alone does not fix even one position. Both change when the room opens and on every
// third miss. A wrong entry is a thinking mistake: the second in one shift locks the terminal
// until the shift ends. Behind door D, the walking aid climbs to the lever.
// More staff, more procedure: the plaque's layout gets less familiar (row/grid, +ring, grid/ring).
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { drawGlyph, GLYPH_COUNT } from "./lab3.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
export { drawGlyph, GLYPH_COUNT };
const { T, TILE } = E;
const { SOLID, DOOR } = TILE;

export const id = 13;
export const name = t("갈라진 기호");
export const characters = ["tall", "light", "key"];
export const MAX_TRIES = 3;

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 12, 21, 19, 0], // the hall
  [5, 16, 8, 16, SOLID], // the plaque's ledge, 4 tiles up (walking aid)
  [22, 16, 22, 19, DOOR], // door D
  [23, 4, 38, 19, 0], // the lever room
  [26, 16, 28, 16, SOLID], // 4-tile shelves
  [30, 12, 32, 12, SOLID],
  [35, 8, 37, 8, SOLID], // the lever's ledge
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const PLAQUE = { x: 6 * T + 8, y: 13 * T + 5, w: 84, h: 40 }; // above the ledge, clear of the walking aid's head
export const UV = { x: 13 * T + 8, y: 17 * T + 4 }; // low on the alcove's back wall
export const DARK = { x0: 11 * T, y0: 12 * T, x1: 17 * T, y1: 20 * T };
export const TERMINAL = { x: 19 * T + 8, y: 20 * T };
export const LEVER = { x: 36 * T + 8, y: 8 * T };
export const sign = { text: "LAB 03", x: 30.5, y: E.ROWS - 4.5 };

export const traps = [
  { kind: "laser", x0: 33 * T + 4, y0: 5 * T, x1: 33 * T + 7, y1: 12 * T, on: 1300, off: 1700, phase: 200 },
  { kind: "plate", x0: 20 * T, x1: 21 * T, y: 20 * T, hidden: true },
];

// ---------- rules (the offline stand-in for src/lab13.ts; same logic) ----------

export const SET_SIZE = 4; // glyphs on the ultraviolet wall, all different
export const PER_SHIFT = 2; // wrong entries one shift may make before the terminal locks for it
export const LOCK_MS = 60_000; // fallback when no shift end arrives

/**
 * The plaque's layouts: six slots (offsets from PLAQUE's centre) and the reading paths drawn
 * through them. A rule is [layout, path, ...the six glyphs in reading order]. Keep the path
 * counts in step with PATHS in src/lab13.ts.
 */
const ring = (i) => [Math.round(Math.cos(((i * 60 - 90) * Math.PI) / 180) * 115) / 10, Math.round(Math.sin(((i * 60 - 90) * Math.PI) / 180) * 115) / 10];
export const LAYOUTS = [
  { // a row; the path runs one way or the other
    slots: Array.from({ length: 6 }, (_, i) => [-30 + i * 12, 0]),
    paths: [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0]],
  },
  { // a 3x2 grid (slot = row * 3 + column): rows, snakes, columns, from different corners
    slots: Array.from({ length: 6 }, (_, i) => [-16 + (i % 3) * 16, -8 + Math.floor(i / 3) * 16]),
    paths: [[0, 1, 2, 3, 4, 5], [0, 1, 2, 5, 4, 3], [0, 3, 1, 4, 2, 5], [0, 3, 4, 1, 2, 5], [2, 1, 0, 5, 4, 3], [3, 4, 5, 0, 1, 2], [5, 4, 3, 2, 1, 0], [3, 0, 1, 4, 5, 2]],
  },
  { // a ring, clockwise from the top: any start, either way round
    slots: Array.from({ length: 6 }, (_, i) => ring(i)),
    paths: Array.from({ length: 12 }, (_, k) => Array.from({ length: 6 }, (_, i) => (((Math.floor(k / 2) + (k % 2 ? -i : i)) % 6) + 6) % 6)),
  },
];
/** More staff, more procedure: which layouts this tier draws from (src/lab13.ts layoutsFor). */
export const layoutsFor = (tier = 1) => (tier >= 3 ? [1, 2] : tier === 2 ? [0, 1, 2] : [0, 1]);

const pick = (n, rand) => Math.min(n - 1, Math.floor(rand() * n));
function shuffled(xs, rand) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(i + 1, rand);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const ALL = Array.from({ length: GLYPH_COUNT }, (_, i) => i);

function issue(state, why, rand = Math.random) {
  const layouts = layoutsFor(state.tier);
  const layout = layouts[pick(layouts.length, rand)];
  state.rule = [layout, pick(LAYOUTS[layout].paths.length, rand), ...shuffled(ALL, rand)];
  state.set = shuffled(ALL, rand).slice(0, SET_SIZE).sort((a, b) => a - b);
  state.genAt = Date.now();
  state.genWhy = why;
  state.tries = 0;
  state.seenHigh = state.seenUV = false;
}
export function newState(tier = 1, rand = Math.random) {
  const state = { tier: Math.max(1, Math.min(3, tier)), gen: 1, tries: 0, shiftWrong: 0, wrongAt: 0, seenHigh: false, seenUV: false, door: false };
  issue(state, "open", rand);
  return state;
}
/** A saved offline state from an older build (two halves) gets a fresh rule and set. */
function fix(state) {
  if (!Array.isArray(state.rule) || state.rule.length !== 2 + GLYPH_COUNT || !Array.isArray(state.set)) {
    state.tier ??= 1; state.gen = (state.gen ?? 0) + 1; state.shiftWrong ??= 0; state.wrongAt ??= 0;
    issue(state, "open");
  }
  return state;
}

/** The code: the wall's glyphs (set) in the order the plaque's path (rule) visits them. */
export function solve(rule, set) {
  const order = rule.slice(2);
  return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
export const answer = (state) => solve(state.rule, state.set);
export const locked = (state, now = Date.now()) => (state.shiftWrong ?? 0) >= PER_SHIFT && now - (state.wrongAt ?? 0) < LOCK_MS;

/** The card types the code. The second miss in a shift locks the terminal; the third overall replaces both. */
export function enter(state, input, now = Date.now(), rand = Math.random) {
  fix(state);
  if (state.door) return "already";
  if (!Array.isArray(input) || input.length !== SET_SIZE || !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)) return "bad";
  if (state.shiftWrong && now - state.wrongAt >= LOCK_MS) state.shiftWrong = 0;
  if (locked(state, now)) return "locked";
  const want = answer(state);
  if (input.every((g, i) => g === want[i])) { state.door = true; return "open"; }
  state.shiftWrong++;
  state.wrongAt = now;
  state.tries++;
  if (state.tries < MAX_TRIES) return "wrong";
  state.gen++;
  issue(state, "reset", rand); // every note about the old plaque and wall is now a lie
  return "reset";
}
/** A shift ended: the next card worker gets the terminal back. */
export function shiftEnded(state) {
  if (!state.shiftWrong) return false;
  state.shiftWrong = 0;
  return true;
}
export function read(state, character) {
  fix(state);
  if (character === "tall") { state.seenHigh = true; return { gen: state.gen, code: [...state.rule], part: "high" }; }
  if (character === "light") { state.seenUV = true; return { gen: state.gen, code: [...state.set], part: "uv" }; }
  return null;
}
export function retier(state, tier) {
  fix(state);
  if (state.door) return false;
  const next = Math.max(1, Math.min(3, tier));
  if (next === state.tier) return false;
  state.tier = next;
  if (!layoutsFor(next).includes(state.rule[0])) { state.gen++; issue(state, "tier"); }
  return true;
}
export function fresh() {
  return { lab: 13, gen: 1, genAt: 0, genWhy: "open", tries: 0, seenHigh: false, seenUV: false, door: false, size: SET_SIZE, locked: false, lever: false };
}
export function ensure(world) {
  return world && world.lab === 13 ? world : fresh();
}
/** Everyone's view: when the plaque and the wall last changed (gen, genAt, genWhy), never a glyph. */
export function publicWorld(world, state, now = Date.now()) {
  fix(state);
  const w = {
    ...ensure(world), lab: 13, gen: state.gen, genAt: state.genAt, genWhy: state.genWhy, tries: state.tries,
    seenHigh: state.seenHigh, seenUV: state.seenUV, door: state.door, size: SET_SIZE, locked: !state.door && locked(state, now),
  };
  for (const k of ["code", "rule", "set", "high", "uv", "lengths"]) delete w[k];
  w.lever = state.door && w.lever === true;
  return w;
}
export const canClear = (state, world) => state.door && world.lever === true;
export const local = { newState: (tier = 1) => newState(tier), publicWorld, canClear, enter: (s, input) => enter(s, input), read, retier, shiftEnded };

export function progress(world) {
  return (world.seenHigh ? 1 : 0) + (world.seenUV ? 1 : 0) + (world.door ? 1 : 0) + (world.lever ? 1 : 0);
}

/** The keypad (client.js): how many glyphs, and how many tries are left before both surfaces change. */
export const padLength = (world) => world.size ?? SET_SIZE;
export const padTries = (world) => t("{n}회", { n: MAX_TRIES - (world.tries ?? 0) });

/**
 * What the plaque shows for a rule, as offsets from its centre: where each glyph sits, the path
 * through the slots, and the start dot (its tail runs into the first glyph from the side away
 * from the second; on the ring, straight out from the centre).
 */
export function plaqueLayout(rule) {
  const L = LAYOUTS[rule[0]] ?? LAYOUTS[0];
  const path = L.paths[rule[1]] ?? L.paths[0];
  const slots = L.slots.map(([x, y]) => ({ x, y, glyph: -1 }));
  path.forEach((s, i) => { slots[s].glyph = rule[2 + i]; });
  const a = slots[path[0]], b = slots[path[1]];
  const [ux, uy] = L === LAYOUTS[2] ? [a.x, a.y] : [a.x - b.x, a.y - b.y];
  const ul = Math.hypot(ux, uy) || 1;
  return { slots, path, dot: { x: a.x + (ux / ul) * 6.5, y: a.y + (uy / ul) * 6.5 } };
}

/** Where the wall's glyphs sit: scattered, from the generation alone (never from the answer). */
const UV_SPOTS = [[-20, -6], [-6, -10], [9, -4], [22, -9], [-14, 8], [4, 9], [19, 7]];
export function uvSpots(gen, n) {
  let a = (Math.imul(gen | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  const rand = () => { // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return shuffled(UV_SPOTS, rand).slice(0, n);
}

// ---------- player ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}
export function doorOpen(world) {
  return !!world.door;
}
export function solidAt(world, tx, ty) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !world.door;
  return false;
}
const self = { tileAt, solidAt, doorOpen };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearTerminal = (p) => E.near(p, TERMINAL);
export const nearLever = (p) => E.near(p, LEVER);
/** The walking aid on the plaque's ledge, in front of it. */
export const readsPlaque = (p, character) => character === "tall" && !!p.ground && Math.abs(p.y - 16 * T) < 2 && p.x > 5 * T && p.x < 9 * T;
/** The light on the floor in front of the ultraviolet wall. */
export const readsUV = (p, character) => character === "light" && !!p.ground && Math.abs(p.y - 20 * T) < 2 && Math.abs(p.x - UV.x) < 40;

export function hint(world, p, character) {
  if (nearTerminal(p) && !world.door) return world.locked ? t("단말기 잠김") : character === "key" ? t("E: 단말기") : t("출입 카드 필요");
  if (nearLever(p) && !world.lever) return world.door ? t("E: 퇴근 레버") : "";
  return "";
}

export function use(api) {
  const { world, p, character } = api;
  if (nearTerminal(p)) {
    if (world.door) return api.say(t("문 D는 이미 열려 있습니다."));
    if (character !== "key") return api.say(t("단말기는 출입 카드로만 조작할 수 있습니다."));
    if (world.locked) return api.say(t("이번 근무에는 더 입력할 수 없습니다. 다음 근무자에게 넘기십시오."));
    return api.openPad();
  }
  if (nearLever(p) && !world.lever && world.door) api.pullLever();
}

/** Every frame while working: whoever stands at their surface asks the server what is written there. */
export function tick(api) {
  const { world, p, character } = api;
  const at = readsPlaque(p, character) || readsUV(p, character);
  const known = api.secret && api.secret.gen === world.gen;
  if (at && !known && api.reading !== world.gen) {
    api.setReading(world.gen);
    api.send({ t: "lab.read" });
  }
}

export function narrate(prev, next) {
  if (prev.lab !== 13) return null;
  if (next.lever && !prev.lever) return t("공정 2 완료. 한 사람은 순서만, 한 사람은 기호만 보았습니다.");
  if (next.door && !prev.door) return t("문 D가 열렸습니다. 입력한 근무자는 기호를 하나도 본 적이 없습니다.");
  if (next.gen > prev.gen) {
    return next.genWhy === "tier"
      ? t("검토 절차가 바뀌어 명판과 자외선 기호가 새로 발급되었습니다. 이전 쪽지는 둘 다 거짓입니다.")
      : t("입력 3회 실패. 명판의 순서와 자외선 기호가 모두 바뀌었습니다. 이전 쪽지는 둘 다 거짓입니다.");
  }
  if (next.locked && !prev.locked) return t("이번 근무의 단말기 입력이 잠겼습니다. 틀린 추측은 근무 하나의 비용입니다.");
  if (next.tries > prev.tries) return t("입력이 틀렸습니다. 남은 시도 {n}회.", { n: MAX_TRIES - next.tries });
  if (next.seenHigh && !prev.seenHigh) return t("명판이 판독되었습니다. 순서만 있습니다.");
  if (next.seenUV && !prev.seenUV) return t("자외선 기호가 판독되었습니다. 순서는 없습니다.");
  return null;
}

export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (world.door) return character !== "tall";
  if (character === "tall") return world.seenHigh;
  if (character === "light") return world.seenUV;
  return false;
}

export function mood(prev, next) {
  if (next.gen > prev.gen) return "Attack";
  if (next.tries > prev.tries || (next.locked && !prev.locked)) return "Charging";
  if ((next.door && !prev.door) || (next.lever && !prev.lever)) return "BackFlip";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

export function drawBase(ctx, { world, actor }) {
  E.drawTiles(ctx, self, world, actor);
  ctx.fillStyle = "#39404e"; ctx.fillRect(TERMINAL.x - 7, TERMINAL.y - 22, 14, 22);
  ctx.fillStyle = world.door ? "#5bd67a" : world.tries || world.locked ? "#e06060" : "#e0b83a";
  ctx.fillRect(TERMINAL.x - 5, TERMINAL.y - 19, 10, 6);
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

export function drawDarkness(ctx, { actor, time = 0 }) {
  const dark = "rgba(4,5,8,0.96)";
  ctx.save();
  // clip to the dark area first: the light's circle only cuts a hole in the dark, it never draws
  // a dark disc of its own where the room is lit (even-odd would fill the part outside the rect)
  ctx.beginPath();
  ctx.rect(DARK.x0, DARK.y0, DARK.x1 - DARK.x0, DARK.y1 - DARK.y0);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(DARK.x0, DARK.y0, DARK.x1 - DARK.x0, DARK.y1 - DARK.y0);
  if (actor?.character === "light") {
    const { x, y } = E.center(actor);
    ctx.arc(x, y, E.LIGHT_R + Math.sin(time * 9) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill("evenodd");
  } else {
    ctx.fillStyle = dark;
    ctx.fill();
  }
  ctx.restore();
}

const BRASS = "#8a7a48", ENGRAVE = "#1e1a10";
// the same scratches whatever the rule: from off the ledge the plaque gives away nothing, not even its layout
const SCRATCHES = [[-34, -12, 9], [-20, 4, 12], [-6, -9, 7], [4, 10, 10], [14, -3, 13], [26, 8, 8], [-28, 12, 6], [22, -13, 9]];

/**
 * The plaque. rule (only for the walking aid who read it): the six glyphs in their slots and the
 * path through them: a start dot whose tail runs into the first glyph, an arrow on every step,
 * nothing at the end. Pictures only, no letters or numbers: it reads the same in every language,
 * and "where to begin" is the dot, never "left" or "right".
 */
export function drawPlaque(ctx, rule) {
  const { x: cx, y: cy, w, h } = PLAQUE;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  ctx.save();
  ctx.fillStyle = BRASS; ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = "#4a3f20"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  if (!rule) {
    ctx.fillStyle = "#6e6238";
    for (const [dx, dy, len] of SCRATCHES) ctx.fillRect(cx + dx, cy + dy, len, 1);
    ctx.restore();
    return;
  }
  const { slots, path, dot: d } = plaqueLayout(rule);
  const at = (s) => [cx + slots[s].x, cy + slots[s].y];
  ctx.strokeStyle = ctx.fillStyle = ENGRAVE;
  ctx.lineWidth = 1;
  // the path, under the glyphs
  ctx.beginPath();
  path.forEach((s, i) => { const [x, y] = at(s); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  // the start: a dot with a tail into the first glyph
  const [sx, sy] = at(path[0]);
  const dot = [cx + d.x, cy + d.y];
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(dot[0], dot[1]); ctx.stroke();
  ctx.beginPath(); ctx.arc(dot[0], dot[1], 2, 0, Math.PI * 2); ctx.fill();
  // clear a patch for every glyph so the line visibly runs into and out of it
  ctx.fillStyle = BRASS;
  for (const s of path) { const [x, y] = at(s); ctx.fillRect(x - 4.5, y - 4.5, 9, 9); }
  // an arrowhead halfway along every step
  ctx.fillStyle = ENGRAVE;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = at(path[i - 1]), [bx, by] = at(path[i]);
    const len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    ctx.beginPath();
    ctx.moveTo(mx + dx * 2, my + dy * 2);
    ctx.lineTo(mx - dx * 1.5 - dy * 2, my - dy * 1.5 + dx * 2);
    ctx.lineTo(mx - dx * 1.5 + dy * 2, my - dy * 1.5 - dx * 2);
    ctx.closePath(); ctx.fill();
  }
  for (const s of path) { const [x, y] = at(s); drawGlyph(ctx, slots[s].glyph, x, y, 7, ENGRAVE, 1.5); }
  ctx.restore();
}

/** The ultraviolet wall: the set, scattered (spots from the generation, never from the order). */
export function drawUV(ctx, world, set) {
  uvSpots(world.gen ?? 1, set.length).forEach(([dx, dy], i) => drawGlyph(ctx, set[i], UV.x + dx, UV.y + dy, 10, "#d6a8ff", 2));
}

/**
 * On top of the room: the plaque (the path and glyphs only for the walking aid who read it), the
 * ultraviolet wall (only in the light's beam, for the light who read it), the terminal's
 * instruction card, the darkness, the name tag. The CCTV never shows a glyph or the path.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv, code = null, codePart = null } = opts;
  drawPlaque(ctx, !cctv && code && codePart === "high" && actor?.character === "tall" ? code : null);
  if (!opts.noDarkness) drawDarkness(ctx, opts);
  ctx.save();
  if (!cctv && code && codePart === "uv" && actor?.character === "light" && Math.hypot(UV.x - actor.x, UV.y - (actor.y - E.P.h / 2)) < E.LIGHT_R) {
    drawUV(ctx, world, code);
  }
  // the terminal's instruction card, for everyone (the CCTV too): what comes from where, not the answer
  const cw = 84;
  ctx.fillStyle = "#e9e4d6"; ctx.fillRect(TERMINAL.x - cw / 2, TERMINAL.y - 50, cw, 22);
  ctx.strokeStyle = "#1e1e1c"; ctx.strokeRect(TERMINAL.x - cw / 2 + 0.5, TERMINAL.y - 49.5, cw - 1, 21);
  ctx.fillStyle = "#1e1e1c"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(t("기호 {n}개: 어둠 속 자외선", { n: padLength(world) }), TERMINAL.x, TERMINAL.y - 44);
  ctx.fillText(t("순서: 높은 명판"), TERMINAL.x, TERMINAL.y - 34);
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

/**
 * Nothing here is wiring: the plaque and the wall are things a body has to stand in front of, so
 * the console (cleared or not) shows only that they exist, whether they were read, and how many
 * times they have been issued (a note older than the last issue is stale).
 */
export function schematic({ world }) {
  const n = padLength(world);
  const tries = world.tries ?? 0;
  const terminal = world.door ? [t("해제"), "ok"] : world.locked ? [t("이번 근무 잠김"), "bad"] : tries ? [t("실패 {n}/{max}", { n: tries, max: MAX_TRIES }), "bad"] : [t("입력 대기"), "warn"];
  return {
    map: [
      { kind: "zone", tone: "dark", x0: DARK.x0, y0: DARK.y0, x1: DARK.x1, y1: DARK.y1, label: t("조도 미달") },
      { kind: "zone", tone: "blind", x0: PLAQUE.x - PLAQUE.w / 2, y0: PLAQUE.y - PLAQUE.h / 2, x1: PLAQUE.x + PLAQUE.w / 2, y1: PLAQUE.y + PLAQUE.h / 2, label: t("명판 판독 불가") },
      { kind: "zone", tone: "blind", x0: UV.x - 28, y0: UV.y - 16, x1: UV.x + 28, y1: UV.y + 14, label: t("자외선 판독 불가 {n}건", { n }) },
      { kind: "device", x: TERMINAL.x, y: TERMINAL.y - 14, label: t("단말기"), state: terminal[0], tone: terminal[1], color: E.EQUIP.key.color },
      { kind: "label", x: 22 * T + 8, y: 15 * T - 4, text: world.door ? t("문 D 열림") : t("문 D 잠김"), color: world.door ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 6 * T + 8, y: 18 * T, text: t("보행 보조 · 4칸 명판대"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("명판 (순서)"), state: world.seenHigh ? t("판독됨") : t("미판독"), tone: world.seenHigh ? "ok" : "idle" },
      { label: t("자외선 (기호)"), state: world.seenUV ? t("판독됨") : t("미판독"), tone: world.seenUV ? "ok" : "idle" },
      { label: t("기호 발급"), state: t("{n}차", { n: world.gen ?? 1 }), tone: "idle" },
      { label: t("단말기"), state: terminal[0], tone: terminal[1] },
      { label: t("문 D"), state: world.door ? t("열림") : t("잠김"), tone: world.door ? "ok" : "bad" },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const terminal = kit.terminal(ux(TERMINAL.x), uy(TERMINAL.y));
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR = uy(20 * T);
  kit.lamps([[4, uy(12 * T) - 0.04], [20, uy(12 * T) - 0.04], [28, uy(4 * T) - 0.04], [35, uy(4 * T) - 0.04]]);
  kit.rails([[5, 8, 16], [26, 28, 16], [30, 32, 12], [35, 37, 8]]);
  kit.column(9.5, FLOOR, 8);
  kit.prop("computer-wide", 18, FLOOR);
  kit.vent(25, uy(9 * T));
  return {
    update(world, _actor, dt) {
      terminal.setColor(world.door ? "#5bd67a" : world.tries ? "#e06060" : "#e0b83a");
      lever.update(world.lever, dt);
    },
  };
}
