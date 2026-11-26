// Room 1-2 "Shift order" (교대 순서), the second stage of lab 1. docs/level-design.md.
//
// Lab 1 taught the three tools side by side. Here all three are needed every time, and the
// card and the light must be approved in a set order. The entrance hall is two storeys: a card
// reader on the floor; a light bridge up to a ledge that only the light reaches, which opens
// straight onto the dark shaft with the light sensor at its top. At the end of the corridor
// under the shaft, a door to the shelf hall and the lever (walking aid). The door opens once
// both the reader and the sensor have been approved, in the order of this opening (state.wire:
// 0 the card first, 1 the light first; shuffled every time the room opens).
// The catch: a veteran sends the card first, as the obvious chain, or copies lab 1's order. Only the
// control desk's blueprint shows the order (ctrl). Without it the field tries one: a device used
// out of turn is refused (반려), its lamp turns red for everyone (CCTV, tape, the overseer's
// line), and it stays refused until the other one has been approved. That costs at most one
// shift; the device approved first stays approved. Nothing in the room (wall, lamp, 3D, hint)
// shows the order before someone tries.
// More staff, more procedure: the sensor wants a longer exposure (4, 6 or 8 seconds).
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { t } from "./i18n.js";

export * from "./engine.js";
const { T, TILE, litBy } = E;
const { SOLID, BRIDGE, DOOR } = TILE;

export const id = 11;
export const name = t("교대 순서");
export const characters = ["key", "light", "tall"];

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 11, 9, 19, 0], // the entrance hall, two storeys high
  [5, 17, 7, 17, BRIDGE], // a light bridge up to...
  [8, 15, 9, 15, SOLID], // ...the ledge (5 tiles up: out of the walking aid's reach)
  [10, 12, 10, 14, 0], // the ledge opens onto the dark shaft
  [11, 2, 18, 14, 0], // the dark shaft; its floor is the corridor's ceiling
  ...[[14, 12], [11, 9], [14, 6]].map(([x, y]) => [x, y, x + 2, y, BRIDGE]),
  [10, 16, 18, 19, 0], // the corridor under the shaft
  [19, 16, 19, 19, DOOR], // the hall door, at the corridor's end
  [20, 2, 38, 19, 0], // the shelf hall
  [22, 16, 24, 16, SOLID], // 4-tile shelves (walking aid)
  [26, 12, 28, 12, SOLID],
  [30, 8, 32, 8, SOLID],
  [35, 4, 37, 4, SOLID], // the lever's ledge
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const READER = { x: 9 * T + 4, y: 20 * T }; // by the entrance, under the ledge
export const SENSOR = { x: 16 * T, y: 3 * T + 4 }; // high on the shaft wall
export const LEVER = { x: 36 * T + 8, y: 4 * T };
export const DARK = { x0: 11 * T, y0: 2 * T, x1: 19 * T, y1: 15 * T };
export const DOOR_AT = { x: 19 * T + 8, y: 18 * T }; // the hall door, for the blueprint
export const sign = { text: "LAB 01", x: 28.5, y: E.ROWS - 4.5 };

// A laser across the last jump, and a hidden plate just past the hall door.
export const traps = [
  { kind: "laser", x0: 33 * T + 4, y0: 3 * T, x1: 33 * T + 7, y1: 8 * T, on: 1300, off: 1700, phase: 400 },
  { kind: "plate", x0: 21 * T, x1: 22 * T, y: 20 * T, hidden: true },
];

// ---------- rules (the offline stand-in for src/lab11.ts; same logic) ----------

export const dwellFor = (tier = 1) => 2 + 2 * Math.max(1, Math.min(3, tier));
/** Wiring 0: the card reader must be approved first. Wiring 1: the light sensor first. */
export const WIRINGS = [0, 1];
export const DEVICES = ["reader", "sensor"];
export const firstOf = (wire) => (wire ? "sensor" : "reader");
const DEVICE_OF = { door: "reader", sensor: "sensor" };
const WHO = { reader: "key", sensor: "light" };
const DONE = { reader: "swiped", sensor: "charged" };

/** A fresh opening: a fresh order. */
export function newState(tier = 1, rand = Math.random) {
  return { swiped: false, charged: false, refused: [], doorB: false, wire: rand() < 0.5 ? 0 : 1, dwell: dwellFor(tier) };
}
/**
 * "door": the card at the reader. "sensor": the light, having held its beam long enough.
 * "accepted": approved, the other is still to come. "open": both approved, the hall door opens.
 * "order": out of turn, refused until the other one has been approved.
 */
export function act(state, character, what) {
  const dev = DEVICE_OF[what];
  if (!dev || character !== WHO[dev]) return "bad";
  if (state[DONE[dev]]) return "already";
  const other = dev === "reader" ? "sensor" : "reader";
  if (firstOf(state.wire ?? 0) !== dev && !state[DONE[other]]) {
    state.refused = [...(state.refused ?? []).filter((d) => d !== dev), dev];
    return "order";
  }
  state[DONE[dev]] = true;
  state.refused = [];
  if (state.swiped && state.charged) {
    state.doorB = true;
    return "open";
  }
  return "accepted";
}
export function retier(state, tier) {
  if (state.charged) return false;
  state.dwell = dwellFor(tier);
  return true;
}
export function fresh() {
  return { lab: 11, swiped: false, charged: false, refused: [], doorB: false, wire: 0, dwell: dwellFor(1), lever: false };
}
export function ensure(world) {
  return world && world.lab === 11 ? world : fresh();
}
export function publicWorld(world, state) {
  const w = { ...ensure(world), lab: 11, swiped: !!state.swiped, charged: !!state.charged, refused: [...(state.refused ?? [])], doorB: !!state.doorB, wire: state.wire ?? 0, dwell: state.dwell };
  w.lever = !!state.doorB && w.lever === true; // the lever is in the shelf hall, behind the door
  return w;
}
export const canClear = (state, world) => !!state.doorB && world.lever === true;
export const local = { newState: (tier = 1) => newState(tier), publicWorld, canClear, act, retier };

export function progress(world) {
  return (world.swiped ? 1 : 0) + (world.charged ? 1 : 0) + (world.lever ? 1 : 0);
}
export const refused = (world, dev) => (world.refused ?? []).includes(dev);

// ---------- player ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0, beam: 0 };
}

/** The one door: the hall door, column 19. */
export function doorOpen(world) {
  return !!world.doorB;
}

export function solidAt(world, tx, ty, actor, feet) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !doorOpen(world, tx);
  if (v === BRIDGE) return feet !== undefined && ty * T >= feet - 0.001 && litBy(actor, tx, ty);
  return false;
}

const self = { tileAt, solidAt, doorOpen };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearReader = (p) => E.near(p, READER, 16);
export const nearLever = (p) => E.near(p, LEVER);
/** The light's beam reaches the sensor: the lamp within its radius, standing on something. */
export const onSensor = (p, character) => character === "light" && !!p.ground && Math.hypot(p.x - SENSOR.x, p.y - E.P.h / 2 - SENSOR.y) < E.LIGHT_R * 0.75;

export function hint(world, p, character) {
  if (nearReader(p) && !world.swiped) {
    if (refused(world, "reader")) return t("카드 리더 반려됨");
    return character === "key" ? t("E: 카드 리더") : t("출입 카드 필요");
  }
  if (onSensor(p, character) && !world.charged) {
    if (refused(world, "sensor")) return t("감광기 반려됨");
    return t("감광 중 {sec}/{need}초 · 가만히 비추십시오", { sec: Math.min(world.dwell, Math.floor(p.beam ?? 0)), need: world.dwell });
  }
  if (nearLever(p) && !world.lever) return world.doorB ? t("E: 퇴근 레버") : "";
  return "";
}

/** The use key. api: { world, p, character, say, act, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  if (nearReader(p) && !world.swiped) {
    if (character !== "key") return api.say(t("카드 리더는 출입 카드로만 작동합니다."));
    if (refused(world, "reader")) return api.say(t("카드 리더는 반려 상태입니다. 감광기 승인이 먼저입니다."));
    return api.act("door");
  }
  if (nearLever(p) && !world.lever && world.doorB) api.pullLever();
}

/** Every frame while working: the light's exposure on the sensor builds up while it holds still. */
export function tick(api) {
  const { world, p, character } = api;
  if (world.charged || refused(world, "sensor") || character !== "light") return;
  if (!onSensor(p, character) || Math.abs(p.vx) > 1) { p.beam = 0; return; }
  p.beam = (p.beam ?? 0) + 1 / 60;
  if (p.beam >= world.dwell && !p.sent) { p.sent = true; api.act("sensor"); }
}

/** The worker's own answer; what everyone hears is in narrate(). */
export function acted() {
  return null;
}

/** What the overseer says. It names what was approved or refused, never the order before anyone tries. */
export function narrate(prev, next) {
  if (prev.lab !== 11) return null;
  if (next.lever && !prev.lever) return t("공정 2 완료. 아무도 혼자 하지 않았습니다. 그게 이 공정의 요점이었습니다.");
  if (next.doorB && !prev.doorB) return t("두 장치가 순서대로 승인되었습니다. 홀 문이 열렸습니다. 다음은 보행 보조 장치입니다.");
  for (const dev of DEVICES) {
    if (refused(next, dev) && !refused(prev, dev)) {
      return t("{device} 반려. 결재 순서가 아닙니다. 붉게 표시해 두겠습니다. 순서는 관제실 도면에 있습니다.", { device: dev === "reader" ? t("카드 리더") : t("감광기") });
    }
  }
  if (next.swiped && !prev.swiped) return t("카드 리더 승인. 감광기 승인이 남았습니다.");
  if (next.charged && !prev.charged) return t("감광기 승인. 카드 리더 승인이 남았습니다.");
  return null;
}

/** True when this equipment cannot move the room forward from here (approvals and refusals only: no order). */
export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "key") return !!world.swiped || refused(world, "reader");
  if (character === "light") return !!world.charged || refused(world, "sensor");
  return !world.doorB; // the walking aid needs the shelf hall open
}

export function mood(prev, next) {
  if ((next.swiped && !prev.swiped) || (next.charged && !prev.charged) || (next.doorB && !prev.doorB) || (next.lever && !prev.lever)) return "BackFlip";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

export function drawBase(ctx, { world, actor }) {
  E.drawTiles(ctx, self, world, actor);
  ctx.fillStyle = "#39404e"; ctx.fillRect(READER.x - 3, READER.y - 18, 6, 10);
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

const readerColor = (world) => (world.swiped ? "#5bd67a" : refused(world, "reader") ? "#e06060" : E.EQUIP.key.color);

/** On top of the room: the reader's lamp, the sensor and its charge, the darkness, the name tag. No order. */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  ctx.fillStyle = readerColor(world); ctx.fillRect(READER.x - 2, READER.y - 17, 4, 3);
  if (!opts.noDarkness) drawDarkness(ctx, opts);
  // the sensor sits in the dark, but it glows: everyone can see where the light has to go
  const charge = world.charged ? 1 : actor?.character === "light" ? Math.min(1, (actor.beam ?? 0) / (world.dwell || 1)) : 0;
  ctx.fillStyle = "#1e1e1c"; ctx.fillRect(SENSOR.x - 7, SENSOR.y - 7, 14, 14);
  ctx.strokeStyle = world.charged ? "#5bd67a" : refused(world, "sensor") ? "#e06060" : E.EQUIP.light.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(SENSOR.x, SENSOR.y, 4, 0, Math.PI * 2); ctx.stroke();
  if (charge > 0) {
    ctx.strokeStyle = world.charged ? "#5bd67a" : "#e8d6ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(SENSOR.x, SENSOR.y, 9, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

/**
 * Where things are, what has been approved or refused and whether the door is open is public.
 * The approval order and how long the sensor wants the light are the control desk's (ctrl).
 */
export function schematic({ world }) {
  const first = firstOf(world.wire ?? 0);
  const name = (dev) => (dev === "reader" ? t("카드 리더") : t("감광기"));
  const devState = (dev) => (world[DONE[dev]] ? [t("승인"), "ok"] : refused(world, dev) ? [t("반려"), "bad"] : null);
  const reader = devState("reader") ?? [t("대기"), "warn"];
  const sensor = devState("sensor");
  return {
    map: [
      { kind: "zone", tone: "dark", x0: DARK.x0, y0: DARK.y0, x1: DARK.x1, y1: DARK.y1, label: t("조도 미달") },
      { kind: "wire", pts: [READER.x, READER.y - 14, DOOR_AT.x, READER.y - 14, DOOR_AT.x, DOOR_AT.y], on: !!world.swiped, ctrl: true },
      { kind: "wire", pts: [SENSOR.x, SENSOR.y, DOOR_AT.x, SENSOR.y, DOOR_AT.x, DOOR_AT.y], on: !!world.charged, ctrl: true },
      { kind: "label", x: DOOR_AT.x, y: 15 * T - 2, text: t("{a} → {b}", { a: name(first), b: name(first === "reader" ? "sensor" : "reader") }), color: E.EQUIP.key.color, ctrl: true },
      { kind: "device", x: READER.x, y: READER.y - 14, label: t("카드 리더"), state: reader[0], tone: reader[1], color: E.EQUIP.key.color },
      sensor
        ? { kind: "device", x: SENSOR.x, y: SENSOR.y, label: t("감광기"), state: sensor[0], tone: sensor[1], color: E.EQUIP.light.color }
        : { kind: "device", x: SENSOR.x, y: SENSOR.y, label: t("감광기"), state: t("{sec}초 노출 필요", { sec: world.dwell }), tone: "warn", color: E.EQUIP.light.color, ctrl: true },
      { kind: "label", x: DOOR_AT.x, y: 15 * T + 12, text: world.doorB ? t("홀 문 열림") : t("홀 문 잠김"), color: world.doorB ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 29 * T, y: 18 * T, text: t("보행 보조 구간 · 4칸 ×4"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("결재 순서"), state: t("{a} → {b}", { a: name(first), b: name(first === "reader" ? "sensor" : "reader") }), tone: "warn", ctrl: true },
      { label: t("카드 리더 · 출입 카드"), state: reader[0], tone: reader[1] },
      sensor
        ? { label: t("감광기 · 조명"), state: sensor[0], tone: sensor[1] }
        : { label: t("감광기 · 조명"), state: t("{sec}초 노출", { sec: world.dwell }), tone: "warn", ctrl: true },
      { label: t("홀 문"), state: world.doorB ? t("열림") : t("잠김"), tone: world.doorB ? "ok" : "bad" },
      { label: t("퇴근 레버 · 보행 보조"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const reader = kit.terminal(ux(READER.x), uy(READER.y));
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR = uy(20 * T);
  kit.lamps([[5, uy(11 * T) - 0.04], [14.5, uy(16 * T) - 0.04], [25, uy(2 * T) - 0.04], [33, uy(2 * T) - 0.04]]);
  kit.rails([[8, 9, 15], [22, 24, 16], [26, 28, 12], [30, 32, 8], [35, 37, 4]]);
  kit.column(20.5, FLOOR, 10);
  kit.fan(29, uy(16 * T));
  kit.vent(2.5, uy(13 * T));
  return {
    update(world, _actor, dt) {
      reader.setColor(readerColor(world));
      lever.update(world.lever, dt);
    },
  };
}
