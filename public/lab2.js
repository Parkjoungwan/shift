// Lab 2 "Boxes" (상자): a state handover puzzle. docs/level-design.md, docs/campaign.md.
//
// The storeroom keeps boxes on a 4-tile shelf (walking aid). A box set on the pressure plate
// holds gate G open for everyone after; standing on the plate yourself only opens it while you
// stand there, which gets you nowhere. Behind the gate, the card picks one of three spots at
// the crane terminal (three buttons), and the crane drops its box there; the light can trip
// the crane's sensor instead, but the sensor cannot choose and drops it at the far spot. The
// lever is 5 tiles up: only a walking aid standing on a box reaches it. The aha: drop the
// crane's box right under the lever, and the next worker only has to climb.
// The crane is wired straight here (button k, spot k) at every tier, and the rail is numbered:
// this room teaches the habit that 2-2 breaks. On the control sheet the wiring (which button drops
// where, where the sensor drops) is still the control desk's (ctrl); everyone else sees the spots.
// More staff, more procedure: the plate wants more weight (1-3 full boxes, stacks count).
//
// The catch (depth pass): a veteran first assumes any box on the plate holds the gate (weight is
// weight); it fails because the boxes only look alike. Each opening, some of them are empty (one
// more box than the plate wants at every tier), an empty box weighs nothing, and the plate seals
// itself when one lands on it: gate shut, nothing on the plate liftable, until the shift ends.
// Which boxes are full is the control desk's (ctrl labels and a ctrl status row on the sheet).
// The field learns it with its hands: the walking aid feels the weight when it lifts a box (the
// overseer's line and the carry hint, on the carrier's screen only) and can put a light one back.
// A seal is public (CCTV, sheet, tape, the overseer), and the empty box stays on the plate as the
// record. Nothing on the wall, the sheet's public layer or the hints tells the boxes apart.
// The first press is in the crane hall. Rules: lab2core.js (shared with the server).

import * as E from "./engine.js";
import * as core from "./lab2core.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
export { CRANE_SLOTS, PLATE, plateLoad } from "./lab2core.js";
const { T, TILE } = E;
const { DOOR } = TILE;

export const id = 2;
export const name = t("상자");
export const characters = ["tall", "key", "light"];

// ---------- map ----------

export const tileAt = E.makeGrid(core.FILLS);
/** Box i is full (the carrier's hands and the control desk know; a world without weights: all full). */
export const heavy = (world, i) => !Array.isArray(world.weights) || world.weights[i] !== 0;
const sealedAt = (world, i) => !!world.jam && i >= 0 && world.boxes?.[i]?.col >= core.PLATE.c0 && world.boxes[i].col <= core.PLATE.c1;
export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const PLATE_PX = { x0: core.PLATE.c0 * T, x1: (core.PLATE.c1 + 1) * T, y: 20 * T };
/** The crane terminal's three buttons: button k drops the box at CRANE_SLOTS[world.wiring[k]] (straight here). */
export const BUTTONS = [17, 18, 19].map((c) => ({ x: c * T + 8, y: 20 * T }));
export const SENSOR = { x: 21 * T + 8, y: 16 * T }; // high on the wall: the light's beam trips it
export const LEVER = { x: 34 * T + 8, y: 15 * T };
export const sign = { text: "LAB 02", x: 11.5, y: E.ROWS - 8.5 };

// The press: it stands between the crane terminal and the lever.
export const traps = [
  { kind: "press", x0: 24 * T + 2, x1: 26 * T - 2, top: 12 * T, bottom: 20 * T, period: 2600, down: 700, phase: 0 },
];

// ---------- world ----------

export function fresh() {
  return core.publicWorld({ lab: 2 }, core.newState(1));
}
export function ensure(world) {
  return world && world.lab === 2 ? world : fresh();
}
export function progress(world) {
  return (world.load ?? 0) + (world.gate ? 1 : 0) + (world.crane < 0 ? 1 : 0) + (world.lever ? 1 : 0);
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

/** Gate G: open while the plate carries enough boxes, or while this worker stands on it (no use to them). */
export function solidAt(world, tx, ty, actor) {
  const v = tileAt(tx, ty);
  if (v === TILE.SOLID) return true;
  if (v === DOOR) return !(world.gate || onPlate(actor));
  return false;
}

/** The boxes at rest: one-way tops to stand on (you walk past a box, and climb onto it). */
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
export const nearSensor = (p, character) => character === "light" && Math.hypot(p.x - SENSOR.x, p.y - E.P.h / 2 - SENSOR.y) < E.LIGHT_R && p.x > 19 * T;

/** The box this worker could lift: resting at its feet level beside it, the one it faces first. */
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

/** Where the held box goes: the column in front, else the worker's own. Returns "col:row" or null. */
export function dropSpot(world, p) {
  const state = { boxes: world.boxes, held: world.held };
  const row = Math.round(p.y / T) - 1;
  // in front, else on top of the box in front (stacking), else at the worker's own feet
  for (const [col, r] of [[Math.floor((p.x + p.face * 14) / T), row], [Math.floor((p.x + p.face * 14) / T), row - 1], [Math.floor(p.x / T), row]]) {
    if (core.restRow(state, col, r) !== null) return `${col}:${r}`;
  }
  return null;
}

export function hint(world, p, character) {
  const k = nearButton(p);
  if (k >= 0) {
    if (character !== "key") return t("출입 카드 필요");
    if (world.crane < 0) return t("크레인 비어 있음");
    // wired straight, the button names its spot; shuffled, the field only knows the button
    return world.shuffled ? t("E: 크레인 버튼 {n} 누르기", { n: k + 1 }) : t("E: 크레인 {spot} 위치에 내리기", { spot: "①②③"[core.wiringOf(world)[k]] });
  }
  if (nearSensor(p, character) && world.crane >= 0) return t("E: 광센서 비추기");
  if (nearLever(p) && !world.lever) return t("E: 퇴근 레버");
  if (character === "tall") {
    // carrying: the hands know the weight (this worker's screen only)
    if (world.held >= 0) return !dropSpot(world, p) ? t("여기에는 놓을 수 없음") : heavy(world, world.held) ? t("E: 상자 내려놓기 · 묵직함") : t("E: 상자 내려놓기 · 가벼움");
    const i = boxBeside(world, p);
    if (i >= 0) return sealedAt(world, i) ? t("압력판 봉인 중: 근무가 끝나면 풀림") : t("E: 상자 들기");
  }
  return "";
}

/** The use key. api: { world, p, character, say, act, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  const k = nearButton(p);
  if (k >= 0) {
    if (character !== "key") return api.say(t("크레인 단말기는 출입 카드로만 조작할 수 있습니다."));
    if (world.crane < 0) return api.say(t("크레인은 이미 상자를 내렸습니다."));
    return api.act(`crane:${k}`);
  }
  if (nearSensor(p, character) && world.crane >= 0) return api.act("sensor");
  if (nearLever(p) && !world.lever) return api.pullLever();
  if (character !== "tall") return;
  if (world.held >= 0) {
    const spot = dropSpot(world, p);
    return spot ? api.act(`drop:${world.held}:${spot}`) : api.say(t("여기에는 상자를 놓을 수 없습니다."));
  }
  const i = boxBeside(world, p);
  if (i >= 0) api.act(`pick:${i}`);
}

/** What the overseer says when the server answers a lab.act. */
export function acted(what, result, world) {
  if (result === "picked" && world) {
    // only the one who lifted it hears this: the field's way to tell the boxes apart
    const i = Number(String(what).split(":")[1]);
    return heavy(world, i) ? t("상자를 들었습니다. 묵직합니다.") : t("상자를 들었습니다. 가볍습니다.");
  }
  if (result === "sealed") return t("압력판이 봉인되어 있어 상자를 들 수 없습니다. 이번 근무가 끝나면 풀립니다.");
  if (result === "buried") return t("위에 다른 상자가 있습니다. 위의 것부터 옮기십시오.");
  if (result === "blocked") return t("그 자리에는 놓을 수 없습니다.");
  if (result === "empty") return t("크레인은 이미 상자를 내렸습니다.");
  if (result === "craned" && what === "sensor") return t("광센서 작동. 크레인이 기본 위치에 상자를 내렸습니다. 위치는 고를 수 없었습니다.");
  return null;
}

/** What the overseer says about a change, or null. */
export function narrate(prev, next) {
  if (prev.lab !== 2) return null;
  if (next.lever && !prev.lever) return t("실험실 2 종료. 상자는 그 자리에 두십시오. 다음 실험에도 쓸지 모릅니다.");
  if (next.jam && !prev.jam) return t("압력판이 규격 미달 하중을 감지했습니다. 이번 근무가 끝날 때까지 압력판을 봉인합니다.");
  if (!next.jam && prev.jam) return next.gate ? t("압력판 봉인이 풀렸습니다. 하중이 충분해 게이트 G가 다시 열렸습니다.") : t("압력판 봉인이 풀렸습니다. 올려 둔 상자는 그대로 있습니다.");
  if (next.gate && !prev.gate) return t("하중 {load}/{need}. 게이트 G가 열렸습니다. 상자를 치우지 않는 한 계속 열려 있습니다.", { load: next.load, need: next.needed });
  if (!next.gate && prev.gate) return t("게이트 G가 닫혔습니다. 압력판의 하중이 줄었습니다.");
  if ((next.load ?? 0) > (prev.load ?? 0)) return t("하중 {load}/{need}. 인력이 충원되어 하중 기준이 올랐습니다.", { load: next.load, need: next.needed });
  if (next.crane < 0 && prev.crane >= 0) {
    const b = next.boxes[prev.crane], under = b && Math.abs(b.col * T + 8 - LEVER.x) <= 3 * T;
    return under ? t("크레인이 레버 아래에 상자를 내렸습니다. 다음 근무자는 올라가기만 하면 됩니다.") : t("크레인이 상자를 내렸습니다.");
  }
  return null;
}

/** True when this equipment cannot move the lab forward from here. */
export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "tall") return false; // there is always a box to move or a lever to reach
  return world.crane < 0 || !world.gate; // card and light: only the crane, and only behind the gate
}

export function mood(prev, next) {
  if ((next.gate && !prev.gate) || (next.crane < 0 && prev.crane >= 0) || (next.lever && !prev.lever)) return "BackFlip";
  if ((!next.gate && prev.gate) || (next.jam && !prev.jam)) return "Attack";
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

/**
 * On top of the room in both 2D and 3D: the plate and its load, the boxes, the crane and its
 * drop spots, the sensor, the button numbers.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  // the pressure plate
  const loaded = !world.jam && (world.load ?? 0) >= (world.needed ?? 1);
  ctx.fillStyle = world.jam ? "#c8402e" : loaded ? "#5bd67a" : "#a8a59c"; ctx.fillRect(PLATE_PX.x0 + 1, PLATE_PX.y - 3, PLATE_PX.x1 - PLATE_PX.x0 - 2, 3);
  ctx.fillStyle = "#1e1e1c"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9e4d6"; ctx.fillRect(PLATE_PX.x0 + 2, 13 * T - 2, PLATE_PX.x1 - PLATE_PX.x0 - 4, 11);
  ctx.fillStyle = "#1e1e1c"; ctx.fillText(t("하중 {load}/{need}", { load: world.load ?? 0, need: world.needed ?? 1 }), (PLATE_PX.x0 + PLATE_PX.x1) / 2, 13 * T + 3.5);
  if (world.jam) { // sealed: a red tag under the reading, until the shift ends
    ctx.fillStyle = "#c8402e"; ctx.fillRect(PLATE_PX.x0 + 2, 14 * T - 1, PLATE_PX.x1 - PLATE_PX.x0 - 4, 11);
    ctx.fillStyle = "#e9e4d6"; ctx.fillText(t("봉인"), (PLATE_PX.x0 + PLATE_PX.x1) / 2, 14 * T + 4.5);
  }
  // the crane rail and its hook, with the box still hanging if it has not dropped it
  ctx.fillStyle = "#43423c"; ctx.fillRect(core.CRANE_SLOTS[0] * T - 4, 12 * T, (core.CRANE_SLOTS.at(-1) - core.CRANE_SLOTS[0]) * T + T + 8, 3);
  // the spots are numbered on the rail only while the wiring is straight (the wall never shows a shuffle)
  const wiring = core.wiringOf(world);
  core.CRANE_SLOTS.forEach((c, slot) => {
    ctx.fillStyle = E.EQUIP.key.color; ctx.fillRect(c * T + 6, 12 * T + 3, 4, 2);
    if (!world.shuffled) { ctx.fillStyle = "#e9e4d6"; ctx.fillText("①②③"[wiring.indexOf(slot)], c * T + 8, 12 * T + 10); }
  });
  if (world.crane >= 0) {
    const c = core.CRANE_SLOTS[core.CRANE_DEFAULT];
    ctx.fillStyle = "#9aa3b2"; ctx.fillRect(c * T + 7, 12 * T + 3, 2, 10);
    drawBox(ctx, c * T, 12 * T + 13);
  }
  // the boxes at rest, and the one being carried (above its carrier's head)
  (world.boxes ?? []).forEach((b, i) => { if (i !== world.held && b.col !== null) drawBox(ctx, b.col * T, b.row * T); });
  if (world.held >= 0 && actor?.character === "tall") drawBox(ctx, Math.round(actor.x - T / 2), Math.round(actor.y - E.P.h - T - 1));
  // the sensor: a purple eye on the wall; the buttons' numbers
  ctx.fillStyle = "#1e1e1c"; ctx.fillRect(SENSOR.x - 5, SENSOR.y - 5, 10, 10);
  ctx.fillStyle = world.crane < 0 ? "#5c4a70" : E.EQUIP.light.color; ctx.beginPath(); ctx.arc(SENSOR.x, SENSOR.y, 3, 0, Math.PI * 2); ctx.fill();
  BUTTONS.forEach((b, k) => {
    ctx.fillStyle = world.crane < 0 ? "#6a6a6a" : E.EQUIP.key.color; ctx.fillRect(b.x - 4, b.y - 22, 8, 8);
    ctx.fillStyle = "#14161a"; ctx.fillText(String(k + 1), b.x, b.y - 17.5);
  });
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

const LEVER_SLOT = core.CRANE_SLOTS.reduce((best, c, k) => (Math.abs(c * T + 8 - LEVER.x) < Math.abs(core.CRANE_SLOTS[best] * T + 8 - LEVER.x) ? k : best), 0);

/** The crane's wiring: a line from each button (and the sensor) to its spot, the button's number there. ctrl only. */
function wiringItems(world) {
  const wiring = core.wiringOf(world);
  const items = BUTTONS.flatMap((b, k) => {
    const x = core.CRANE_SLOTS[wiring[k]] * T + 8, y = 13 * T + 6 + k * 5;
    return [
      { kind: "wire", pts: [b.x, b.y - 14, b.x, y, x, y, x, 12 * T + 4], on: wiring[k] === LEVER_SLOT, ctrl: true },
      { kind: "label", x, y: 12 * T - 4, text: "①②③"[k], color: E.EQUIP.key.color, ctrl: true },
    ];
  });
  const d = core.CRANE_SLOTS[core.CRANE_DEFAULT] * T + 8;
  items.push(
    { kind: "wire", pts: [SENSOR.x, SENSOR.y, d, SENSOR.y, d, 12 * T + 4], on: false, ctrl: true },
    { kind: "label", x: d, y: 12 * T - 12, text: t("광센서 기본"), color: E.EQUIP.light.color, ctrl: true },
  );
  return items;
}

/** Which boxes are full: a word on each box at rest (ctrl), and the boxes left to right as ●/○ (ctrl). */
function weightItems(world) {
  return (world.boxes ?? []).flatMap((b, i) => (i === world.held || b.col === null ? [] : [
    { kind: "label", x: b.col * T + 8, y: b.row * T - 3, text: heavy(world, i) ? t("적재") : t("빈 상자"), color: heavy(world, i) ? E.EQUIP.tall.color : "#9a9a9a", ctrl: true },
  ]));
}
function weightRow(world) {
  const at = (world.boxes ?? []).map((b, i) => ({ b, i })).filter(({ b, i }) => i !== world.held && b.col !== null && i !== world.crane);
  at.sort((a, b) => a.b.col - b.b.col || b.b.row - a.b.row);
  return at.map(({ i }) => (heavy(world, i) ? "●" : "○")).join("") || "-";
}

export function schematic({ world }) {
  const boxes = (world.boxes ?? []).flatMap((b, i) => (i === world.held || b.col === null ? [] : [{ kind: "box", x0: b.col * T, y0: b.row * T, x1: b.col * T + T, y1: b.row * T + T, tone: "warn" }]));
  const loaded = !world.jam && (world.load ?? 0) >= (world.needed ?? 1);
  const load = t("하중 {load}/{need}", { load: world.load ?? 0, need: world.needed ?? 1 });
  return {
    map: [
      ...boxes,
      ...weightItems(world),
      { kind: "device", x: (PLATE_PX.x0 + PLATE_PX.x1) / 2, y: PLATE_PX.y - 4, label: t("압력판 P"), state: world.jam ? t("봉인") : load, tone: world.jam ? "bad" : loaded ? "ok" : "warn" },
      { kind: "label", x: 15 * T + 8, y: 15 * T - 4, text: world.gate ? t("게이트 G 열림") : t("게이트 G 잠김"), color: world.gate ? "#5bd67a" : "#e06060" },
      { kind: "device", x: BUTTONS[1].x, y: BUTTONS[1].y - 14, label: t("크레인 단말기"), state: world.crane < 0 ? t("내림 완료") : t("대기"), tone: world.crane < 0 ? "ok" : "idle", color: E.EQUIP.key.color },
      { kind: "device", x: SENSOR.x, y: SENSOR.y, label: t("광센서"), state: world.crane < 0 ? "-" : t("대기"), tone: "idle", color: E.EQUIP.light.color },
      // the spots are where things are (public); which button drops where, and where the sensor
      // drops, is wiring: the control desk's
      ...core.CRANE_SLOTS.map((c) => ({ kind: "label", x: c * T + 8, y: 12 * T + 8, text: "▽", color: "#9a9a9a" })),
      ...(world.crane < 0 ? [] : wiringItems(world)),
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버 (5칸)"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 5 * T, y: 15 * T - 4, text: t("보관 선반 · 4칸"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("압력판 하중"), state: world.jam ? t("봉인 {load}/{need}", { load: world.load ?? 0, need: world.needed ?? 1 }) : `${world.load ?? 0}/${world.needed ?? 1}`, tone: world.jam ? "bad" : loaded ? "ok" : "warn", bar: Math.min(1, (world.load ?? 0) / (world.needed ?? 1)) },
      { label: t("상자 무게 (왼쪽부터 ●적재 ○빈)"), state: weightRow(world), tone: "idle", ctrl: true },
      { label: t("게이트 G"), state: world.gate ? t("열림") : t("잠김"), tone: world.gate ? "ok" : "bad" },
      { label: t("크레인"), state: world.crane < 0 ? t("내림 완료") : t("상자 대기"), tone: world.crane < 0 ? "ok" : "idle" },
      { label: t("레버 아래 배선"), state: world.crane < 0 ? "-" : t("버튼 {n}", { n: core.wiringOf(world).indexOf(LEVER_SLOT) + 1 }), tone: "idle", ctrl: true },
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
  kit.lamps([[5, uy(12 * T) - 0.04], [12, uy(12 * T) - 0.04], [22, uy(12 * T) - 0.04], [31, uy(12 * T) - 0.04]]);
  kit.rails([[3, 7, 16], [33, 35, 15]]);
  kit.column(14.5, FLOOR, 8);
  kit.vent(8, uy(13 * T));
  kit.fan(37, uy(14 * T));
  kit.prop("chair", 13, FLOOR, { ry: Math.PI / 2 });
  return {
    update(world, _actor, dt) {
      buttons.forEach((b) => b.setColor(world.crane < 0 ? "#5bd67a" : E.EQUIP.key.color));
      lever.update(world.lever, dt);
    },
  };
}
