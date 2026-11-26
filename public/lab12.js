// Room 2-2 "Safety mat" (안전 매트), the second stage of lab 2. docs/level-design.md.
//
// Lab 2 taught that a box left on a plate keeps working for whoever comes next. Here the roles
// turn over: the crane stands on this side of the gate, over the plate, so the card opens the gate
// with the crane's box. Its three buttons are wired to three spots (left of the plate, the plate,
// right of it) in a fresh order each time the room opens; lab 2 taught "button 3 is the good
// spot", and here only the control desk's sheet shows which button is the plate (ctrl). The crane
// drops once per shift, and the two spots off the plate are disposal hatches: a wrong button sends
// the box down the hatch, lost for good, and the shift is wasted. The crane hangs a fresh box when
// the shift ends, wired the same, so the next card can learn from the tape (which button went
// down the hatch: CCTV, tape, the overseer's line) or from the control desk. With three buttons
// at most two shifts are lost; nothing is ever locked. Nothing on the wall or the rail says which
// button is which. Behind the gate,
// the presses in the hall never rest long enough to run under, but each one stops dead, held at
// the top by its safety interlock, as long as a box sits on its mat. The walking aid stocks the
// mats from the hall shelf, and the last box goes under the lever, 5 tiles up. The trap that
// killed people in lab 2 is now a tool.
// More staff, more procedure: a second press is switched on, and the shelf holds one more box.
// Rules: lab2core.js (room12, shared with the server).

import * as E from "./engine.js";
import { room12 as core } from "./lab2core.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
const { T, TILE } = E;
const { DOOR } = TILE;

export const id = 12;
export const name = t("안전 매트");
export const characters = ["tall", "key"];

// ---------- map ----------

export const tileAt = E.makeGrid(core.FILLS);
export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const PLATE_PX = { x0: core.PLATE.c0 * T, x1: (core.PLATE.c1 + 1) * T, y: 20 * T };
export const CRANE_SLOTS = core.CRANE_SLOTS;
/** The crane's buttons in the storeroom: button k drops its box at CRANE_SLOTS[world.wiring[k]]. */
export const BUTTONS = [3, 4, 5].map((c) => ({ x: c * T + 8, y: 20 * T }));
const PARK = 13; // where the crane waits with its box: past every spot, so it points at none
const PLATE_SLOT = CRANE_SLOTS.findIndex((c) => c >= core.PLATE.c0 && c <= core.PLATE.c1);
/** The button wired to the plate this opening (the control desk's secret). */
export const plateButton = (world) => core.wiringOf(world).indexOf(PLATE_SLOT);
export const LEVER = { x: 36 * T + 8, y: 15 * T };
export const MATS = core.MATS; // [c0, c1] at the floor, one per press
export const sign = { text: "LAB 02", x: 11.5, y: E.ROWS - 8.5 };

// The presses: three tiles wide, too quick to run under (0.4 s of rest), stopped only by a box on
// the mat. Each mat reaches one column past its press, so the box goes down from safe floor.
export const traps = MATS.map(([c0, c1], i) => ({
  kind: "press", x0: (c0 + 1) * T + 1, x1: (c1 + 1) * T - 1, top: 12 * T, bottom: 20 * T, period: 1700, down: 1300, phase: i * 850, mat: i,
}));

/** engine.js asks: is this trap stopped by what lies in the room? (a box on its mat, or switched off) */
export function trapStopped(trap, world) {
  if (trap.mat === undefined) return false;
  if (trap.mat >= (world.presses ?? MATS.length)) return true;
  const [c0, c1] = MATS[trap.mat];
  return (world.boxes ?? []).some((b, i) => i !== world.held && b.row === 19 && b.col >= c0 && b.col <= c1);
}

// ---------- world ----------

export function fresh() {
  return core.publicWorld({ lab: 12 }, core.newState(1));
}
export function ensure(world) {
  return world && world.lab === 12 ? world : fresh();
}
export function progress(world) {
  return (world.gate ? 1 : 0) + traps.filter((trap) => trap.mat < (world.presses ?? 0) && trapStopped(trap, world)).length + (world.lever ? 1 : 0);
}

export const local = {
  newState: (tier = 1) => core.newState(tier),
  publicWorld: (world, state) => core.publicWorld(ensure(world), state),
  canClear: core.canClear,
  act: (state, character, what) => core.act(state, character, what),
  retier: core.retier,
  shiftEnded: core.shiftEnded,
};

// ---------- player ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}

const onPlate = (pos) => E.standsIn(pos, PLATE_PX.x0, PLATE_PX.x1, PLATE_PX.y);
export function doorOpen(world) {
  return !!world.gate;
}
export function solidAt(world, tx, ty, actor) {
  const v = tileAt(tx, ty);
  if (v === TILE.SOLID) return true;
  if (v === DOOR) return !(world.gate || onPlate(actor));
  return false;
}
export function bodies(world) {
  return (world.boxes ?? []).flatMap((b, i) => (i === world.held || b.col === null ? [] : [{ x0: b.col * T, x1: b.col * T + T, y: b.row * T }]));
}

const self = { tileAt, solidAt, doorOpen, bodies };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearLever = (p) => E.near(p, LEVER);
export const nearButton = (p) => BUTTONS.findIndex((b) => E.near(p, b, 8));

export function boxBeside(world, p) {
  if (!p.ground) return -1;
  const row = Math.round(p.y / T) - 1;
  let best = -1, bestD = 99;
  (world.boxes ?? []).forEach((b, i) => {
    if (i === world.held || b.col === null || b.row !== row) return;
    const dx = b.col * T + 8 - p.x;
    const d = Math.abs(dx) - (Math.sign(dx) === p.face ? 4 : 0);
    if (Math.abs(dx) <= 20 && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

export function dropSpot(world, p) {
  const state = { boxes: world.boxes, held: world.held };
  const row = Math.round(p.y / T) - 1;
  const front = Math.floor((p.x + p.face * 14) / T);
  for (const [col, r] of [[front, row], [front, row - 1], [Math.floor(p.x / T), row]]) {
    if (core.restRow(state, col, r) !== null) return `${col}:${r}`;
  }
  return null;
}

export function hint(world, p, character) {
  const k = nearButton(p);
  if (k >= 0) return character === "key" ? (world.crane < 0 ? t("크레인 비어 있음") : t("E: 크레인 버튼 {n} 누르기", { n: k + 1 })) : t("출입 카드 필요");
  if (nearLever(p) && !world.lever) return world.gate ? t("E: 퇴근 레버") : "";
  if (character === "tall") {
    if (world.held >= 0) return dropSpot(world, p) ? t("E: 상자 내려놓기") : t("여기에는 놓을 수 없음");
    if (boxBeside(world, p) >= 0) return t("E: 상자 들기");
  }
  return "";
}

export function use(api) {
  const { world, p, character } = api;
  const k = nearButton(p);
  if (k >= 0) {
    if (character !== "key") return api.say(t("크레인 단말기는 출입 카드로만 조작할 수 있습니다."));
    if (world.crane < 0) return api.say((world.lost ?? -1) >= 0 ? t("크레인은 이번 근무에 이미 상자를 내렸습니다.") : t("크레인은 이미 상자를 내렸습니다."));
    return api.act(`crane:${k}`);
  }
  if (nearLever(p) && !world.lever && world.gate) return api.pullLever();
  if (character !== "tall") return;
  if (world.held >= 0) {
    const spot = dropSpot(world, p);
    return spot ? api.act(`drop:${world.held}:${spot}`) : api.say(t("여기에는 상자를 놓을 수 없습니다."));
  }
  const i = boxBeside(world, p);
  if (i >= 0) api.act(`pick:${i}`);
}

export function acted(what, result) {
  if (result === "buried") return t("위에 다른 상자가 있습니다.");
  if (result === "blocked") return t("그 자리에는 놓을 수 없습니다.");
  if (result === "empty") return t("크레인은 이미 상자를 내렸습니다.");
  return null;
}

const matsHeld = (w) => traps.filter((trap) => trap.mat < (w.presses ?? 0) && trapStopped(trap, w)).length;

export function narrate(prev, next) {
  if (prev.lab !== 12) return null;
  if (next.lever && !prev.lever) return t("공정 2 완료. 작업자를 다치게 하던 프레스가 오늘은 작업 도구였습니다.");
  const n = (next.pressed ?? -1) + 1, craned = next.crane < 0 && prev.crane >= 0;
  if (next.gate && !prev.gate) return craned && n ? t("크레인 버튼 {n}: 상자가 압력판에 떨어졌습니다. 게이트 G가 열렸습니다.", { n }) : t("게이트 G가 열렸습니다. 크레인 상자가 압력판을 누르고 있습니다.");
  if (craned && (next.lost ?? -1) >= 0) return t("크레인 버튼 {n}: 상자가 폐기구로 떨어졌습니다. 회수할 수 없습니다. 크레인은 이번 근무가 끝나면 새 상자를 겁니다.", { n });
  if (next.crane >= 0 && prev.crane < 0) return t("크레인에 새 상자가 걸렸습니다. 버튼 배선은 그대로입니다.");
  const a = matsHeld(prev), b = matsHeld(next);
  if (b > a) return t("안전 매트에 하중 감지. 프레스 {n}/{all}대 정지. 정지 상태는 상자를 치울 때까지 유지됩니다.", { n: b, all: next.presses });
  if (b < a) return t("안전 매트가 비었습니다. 프레스가 다시 작동합니다.");
  return null;
}

export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "key") return world.crane < 0;
  return !world.gate; // the walking aid's work is all behind the gate (a lost box is gone)
}

export function mood(prev, next) {
  if ((next.gate && !prev.gate) || (next.lever && !prev.lever) || matsHeld(next) > matsHeld(prev)) return "BackFlip";
  if (matsHeld(next) < matsHeld(prev) || ((next.lost ?? -1) >= 0 && (prev.lost ?? -1) < 0)) return "Attack";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

function drawBox(ctx, x, y) {
  ctx.fillStyle = "#8a6a3a"; ctx.fillRect(x, y, T, T);
  ctx.strokeStyle = "#4a3820"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
  ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + T - 1, y + T - 1); ctx.moveTo(x + T - 1, y + 1); ctx.lineTo(x + 1, y + T - 1); ctx.stroke();
}

export function drawBase(ctx, { world, actor }) {
  E.drawTiles(ctx, self, world, actor);
  for (const b of BUTTONS) { ctx.fillStyle = "#39404e"; ctx.fillRect(b.x - 5, b.y - 14, 10, 14); }
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/** On top of the room: the plate, the mats, the crane over the plate, the boxes, the buttons. */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // the plate
  ctx.fillStyle = world.gate ? "#5bd67a" : "#a8a59c"; ctx.fillRect(PLATE_PX.x0 + 1, PLATE_PX.y - 3, PLATE_PX.x1 - PLATE_PX.x0 - 2, 3);
  // the safety mats: yellow and black, green while a box holds them
  MATS.forEach(([c0, c1], i) => {
    const on = i < (world.presses ?? 0), held = trapStopped(traps[i], world);
    for (let x = c0 * T; x < (c1 + 1) * T; x += 4) { ctx.fillStyle = (x / 4) % 2 ? "#1e1e1c" : held ? "#5bd67a" : on ? "#e8b830" : "#6a6a6a"; ctx.fillRect(x, 20 * T - 2, 4, 2); }
    ctx.fillStyle = "#e9e4d6"; ctx.fillRect(c0 * T + 4, 17 * T - 6, (c1 - c0 + 1) * T - 8, 11);
    ctx.fillStyle = "#1e1e1c"; ctx.fillText(!on ? t("전원 차단") : held ? t("매트 하중 · 정지") : t("안전 매트"),(c0 + c1 + 1) * T / 2, 17 * T - 0.5);
  });
  // the crane rail over the plate, its drop spots marked but not numbered (the wiring is not on
  // the wall), with its box still hanging at the park end
  ctx.fillStyle = "#43423c"; ctx.fillRect(CRANE_SLOTS[0] * T - 4, 12 * T, (PARK - CRANE_SLOTS[0]) * T + T + 8, 3);
  for (const c of CRANE_SLOTS) { ctx.fillStyle = E.EQUIP.key.color; ctx.fillRect(c * T + 6, 12 * T + 3, 4, 2); }
  // the disposal hatches under the spots off the plate; open, with the box going down, the shift it fell
  CRANE_SLOTS.forEach((c, slot) => {
    if (slot === PLATE_SLOT) return;
    const open = world.lost === slot;
    ctx.fillStyle = open ? "#0c0c0b" : "#5a2a24"; ctx.fillRect(c * T + 1, 20 * T - 2, T - 2, 2);
    ctx.fillStyle = "#c8402e"; ctx.fillRect(c * T, 20 * T - 2, 1, 2); ctx.fillRect(c * T + T - 1, 20 * T - 2, 1, 2);
    if (open) {
      ctx.save(); ctx.beginPath(); ctx.rect(c * T, 12 * T, T, 8 * T - 2); ctx.clip();
      drawBox(ctx, c * T, 20 * T - 9);
      ctx.restore();
      ctx.fillStyle = "#e9e4d6"; ctx.fillRect(c * T - 4, 18 * T - 6, T + 8, 11);
      ctx.fillStyle = "#c8402e"; ctx.fillText(t("폐기"), c * T + 8, 18 * T - 0.5);
    }
  });
  if (world.crane >= 0) {
    const c = PARK;
    ctx.fillStyle = "#9aa3b2"; ctx.fillRect(c * T + 7, 12 * T + 3, 2, 10);
    drawBox(ctx, c * T, 12 * T + 13);
  }
  (world.boxes ?? []).forEach((b, i) => { if (i !== world.held && b.col !== null) drawBox(ctx, b.col * T, b.row * T); });
  if (world.held >= 0 && actor?.character === "tall") drawBox(ctx, Math.round(actor.x - T / 2), Math.round(actor.y - E.P.h - T - 1));
  BUTTONS.forEach((b, k) => {
    ctx.fillStyle = world.crane < 0 ? "#6a6a6a" : E.EQUIP.key.color; ctx.fillRect(b.x - 4, b.y - 22, 8, 8);
    ctx.fillStyle = "#14161a"; ctx.fillText(String(k + 1), b.x, b.y - 17.5);
  });
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

/** The crane terminal as everyone's sheet reads it: waiting, or which button was pressed (the record). */
function craneState(world) {
  if (world.crane >= 0) return t("대기");
  if ((world.pressed ?? -1) < 0) return t("내림 완료");
  return (world.lost ?? -1) >= 0 ? t("버튼 {n} · 상자 폐기", { n: world.pressed + 1 }) : t("버튼 {n} · 내림 완료", { n: world.pressed + 1 });
}

/** This opening's wiring: a line from each button up to the spot it drops at, and its number there. ctrl only. */
function wiringItems(world) {
  const wiring = core.wiringOf(world);
  return BUTTONS.flatMap((b, k) => {
    const x = CRANE_SLOTS[wiring[k]] * T + 8, y = 13 * T + 6 + k * 5;
    return [
      { kind: "wire", pts: [b.x, b.y - 14, b.x, y, x, y, x, 12 * T + 4], on: wiring[k] === PLATE_SLOT, ctrl: true },
      { kind: "label", x, y: 12 * T - 4, text: String(k + 1), color: E.EQUIP.key.color, ctrl: true },
    ];
  });
}

export function schematic({ world }) {
  const boxes = (world.boxes ?? []).flatMap((b, i) => (i === world.held || b.col === null ? [] : [{ kind: "box", x0: b.col * T, y0: b.row * T, x1: b.col * T + T, y1: b.row * T + T, tone: "warn" }]));
  const held = matsHeld(world), working = world.presses ?? 0;
  return {
    map: [
      ...boxes,
      { kind: "device", x: (PLATE_PX.x0 + PLATE_PX.x1) / 2, y: PLATE_PX.y - 4, label: t("압력판 P"), state: world.gate ? t("하중 있음") : t("비어 있음"), tone: world.gate ? "ok" : "warn" },
      { kind: "device", x: BUTTONS[1].x, y: BUTTONS[1].y - 14, label: t("크레인 단말기"), state: craneState(world), tone: world.crane < 0 ? ((world.lost ?? -1) >= 0 ? "bad" : "ok") : "idle", color: E.EQUIP.key.color },
      // where the crane can drop: public. Which button drops where: the control desk's wiring.
      ...CRANE_SLOTS.map((c) => ({ kind: "label", x: c * T + 8, y: 12 * T + 8, text: "▽", color: "#9a9a9a" })),
      ...CRANE_SLOTS.flatMap((c, slot) => (slot === PLATE_SLOT ? [] : [{ kind: "label", x: c * T + 8, y: 20 * T + 12, text: t("폐기구"), color: "#9a9a9a" }])),
      ...(world.crane < 0 ? [] : wiringItems(world)),
      { kind: "label", x: 15 * T + 8, y: 15 * T - 4, text: world.gate ? t("게이트 G 열림") : t("게이트 G 잠김"), color: world.gate ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버 (5칸)"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 18 * T + 8, y: 15 * T - 4, text: t("선반 · 4칸"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("압력판 · 게이트 G"), state: world.gate ? t("열림") : t("잠김"), tone: world.gate ? "ok" : "bad" },
      { label: t("크레인"), state: world.crane < 0 ? craneState(world) : t("상자 대기"), tone: world.crane < 0 ? ((world.lost ?? -1) >= 0 ? "bad" : "ok") : "idle" },
      { label: t("압력판 배선"), state: world.crane < 0 ? "-" : t("버튼 {n}", { n: plateButton(world) + 1 }), tone: "idle", ctrl: true },
      { label: t("프레스 정지"), state: t("{n}/{all}대", { n: held, all: working }), tone: held >= working ? "ok" : "warn", bar: working ? held / working : 1 },
      { label: t("운반 중"), state: world.held >= 0 ? t("상자 1") : t("없음"), tone: world.held >= 0 ? "warn" : "idle" },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const buttons = BUTTONS.map((b) => kit.terminal(ux(b.x), uy(b.y)));
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR = uy(20 * T);
  kit.lamps([[6, uy(12 * T) - 0.04], [12, uy(12 * T) - 0.04], [21, uy(12 * T) - 0.04], [33, uy(12 * T) - 0.04]]);
  kit.rails([[16, 20, 16], [35, 37, 15]]);
  kit.column(14.5, FLOOR, 8);
  kit.vent(27, uy(13 * T));
  kit.fan(38, uy(14 * T));
  return {
    update(world, _actor, dt) {
      buttons.forEach((b) => b.setColor(world.crane < 0 ? "#5bd67a" : E.EQUIP.key.color));
      lever.update(world.lever, dt);
    },
  };
}
