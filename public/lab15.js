// Room 5-2 "Phase drop" (위상 낙하), the second stage of lab 5. docs/level-design.md.
//
// Lab 5 taught that the room's phase decides what is solid, and that one anchor can hold a colour.
// Here the phase moves things. A box rests on a blue ledge with a red ledge under it, over the
// pressure plate: switch to red and it drops onto the red ledge, switch to blue and it drops onto
// the plate, and gate G opens. But the bridge over the live trench is red: in blue it is gone. The
// anchor fixes that, red held solid in any phase, but anchor too early and the box sits on its red
// ledge for good. Order is everything: red, blue, then anchor red. The phase shifter's two switches
// a shift are exactly enough. Then the walking aid crosses and climbs to the lever.
// More staff, more procedure: a second box stacked blue, red, blue: red, blue, red, a third
// switch, and so a second phase-shifter shift (the state waits in between).
// The overseer still posts its forged directive by the entrance (lab 5, S4): signed with a real
// shift that was not the control desk, truthful a third of the time, and sometimes "anchor first".
// The true phase and the red bridge are ctrl on the console; the field sees the blocks.
// Rules: lab15core.js (shared with the server).

import * as E from "./engine.js";
import * as core from "./lab15core.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
const { T, TILE, PHASE_COLOR, PHASE_NAME } = E;
const { SOLID, DOOR, BLUE, RED } = TILE;

export const id = 15;
export const name = t("위상 낙하");
export const characters = ["phase", "tall", "key"];
export const SWITCHES_PER_SHIFT = core.SWITCHES_PER_SHIFT;

// ---------- map ----------

export const tileAt = E.makeGrid(core.FILLS);
export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const SOCKETS = { blue: { x: core.SOCKETS.blue * T + 8, y: 20 * T }, red: { x: core.SOCKETS.red * T + 8, y: 20 * T } };
export const LEVER = { x: 36 * T + 8, y: 4 * T };
export const sign = { text: "LAB 05", x: 29.5, y: E.ROWS - 4.5 };

export const traps = [
  { kind: "shock", x0: 6 * T, x1: 14 * T, y: 21 * T },
  { kind: "laser", x0: 33 * T + 12, y0: 3 * T, x1: 33 * T + 15, y1: 8 * T, on: 1300, off: 1700, phase: 900 }, // across the last jump
];

// ---------- world ----------

export function fresh() {
  return core.publicWorld({ lab: 15 }, core.newState(1));
}
export function ensure(world) {
  return world && world.lab === 15 ? world : fresh();
}
export function progress(world) {
  return (world.load ?? 0) + (world.gate ? 1 : 0) + (world.lever ? 1 : 0);
}
export const switchesLeft = (world, logId) => SWITCHES_PER_SHIFT - (world.used?.logId === logId ? world.used.n : 0);

export const local = {
  newState: (tier = 1) => core.newState(tier),
  publicWorld: (world, state) => core.publicWorld(ensure(world), state),
  canClear: core.canClear,
  act: core.act,
  retier: core.retier,
  forge: core.forge,
};

// ---------- player ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}
export function doorOpen(world) {
  return !!world.gate;
}
export function solidAt(world, tx, ty) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !world.gate;
  if (v === BLUE || v === RED) return E.phaseSolid(world, v);
  return false;
}
/** The boxes: one-way tops to stand on. */
export function bodies(world) {
  return (world.boxes ?? []).map((b) => ({ x0: b.col * T, x1: b.col * T + T, y: b.row * T }));
}
const self = { tileAt, solidAt, doorOpen, bodies };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearLever = (p) => E.near(p, LEVER);
export const nearSocket = (p) => (E.near(p, SOCKETS.blue, 10) ? "blue" : E.near(p, SOCKETS.red, 10) ? "red" : null);

export function hint(world, p, character, now, logId) {
  if (nearLever(p) && !world.lever) return world.gate ? t("E: 퇴근 레버") : "";
  const socket = nearSocket(p);
  if (character === "phase") {
    if (socket) return world.anchor === socket ? t("E: {phase} 닻 뽑기", { phase: PHASE_NAME[socket] }) : t("E: {phase} 닻 꽂기", { phase: PHASE_NAME[socket] });
    return t("E: 위상 전환 (남은 {n}번)", { n: switchesLeft(world, logId) });
  }
  if (socket) return t("{phase} 위상 닻 소켓", { phase: PHASE_NAME[socket] });
  return "";
}

export function use(api) {
  const { world, p, character } = api;
  if (nearLever(p) && !world.lever) return world.gate ? api.pullLever() : undefined;
  if (character !== "phase") return;
  const socket = nearSocket(p);
  if (socket) return api.act(`anchor:${socket}`);
  if (switchesLeft(world, api.logId) <= 0) return api.say(t("이번 근무의 위상 전환을 모두 썼습니다."));
  api.act("switch");
}

export function acted(_what, result) {
  if (result === "limit") return t("이번 근무의 위상 전환을 모두 썼습니다. 상태는 그대로 다음 근무자에게 넘어갑니다.");
  return null;
}

export function narrate(prev, next) {
  if (prev.lab !== 15) return null;
  if (next.lever && !prev.lever) return t("공정 2 완료. 순서를 지킨 사람만 내려놓을 수 있었습니다.");
  if (next.gate && !prev.gate) return t("하중 {n}/{need}. 게이트 G가 열렸습니다.", { n: next.load, need: next.needed });
  const fell = (next.boxes ?? []).some((b, i) => b.row > (prev.boxes?.[i]?.row ?? b.row));
  // which phase is a true value (the field sees it); everyone hears this, so the line does not say
  if (fell) return t("위상이 바뀌자 상자가 떨어졌습니다. 떨어진 상자는 올라가지 않습니다.");
  if (next.anchor !== prev.anchor) return next.anchor ? t("위상 닻: {phase} 고정. 그 색의 선반도 함께 고정됩니다.", { phase: PHASE_NAME[next.anchor] }) : t("위상 닻을 뽑았습니다.");
  if (next.phase !== prev.phase) return t("방의 위상이 바뀌었습니다.");
  return null;
}

export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "key") return true; // no card readers here: scout, and write
  if (character === "tall") return !world.gate;
  return world.gate && E.phaseSolid(world, RED); // done: the gate is open and the bridge holds
}

export function mood(prev, next) {
  if ((next.gate && !prev.gate) || (next.lever && !prev.lever)) return "BackFlip";
  if (next.phase !== prev.phase) return "Charging";
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
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/** On top of the room: the phase lamp, the sockets, the plates, the boxes. */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  const lx = 9 * T + 8, ly = 13 * T;
  ctx.fillStyle = "#1e1e1c"; ctx.fillRect(lx - 16, ly - 9, 32, 16);
  ctx.fillStyle = PHASE_COLOR[world.phase] ?? "#888"; ctx.fillRect(lx - 14, ly - 7, 28, 12);
  ctx.fillStyle = "#f4ecd8"; ctx.font = `8px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(t("{phase} 위상", { phase: PHASE_NAME[world.phase] ?? "?" }), lx, ly);
  for (const [c, s] of Object.entries(SOCKETS)) {
    ctx.strokeStyle = PHASE_COLOR[c]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y - 4, 4, 0, Math.PI * 2); ctx.stroke();
    if (world.anchor === c) { ctx.fillStyle = PHASE_COLOR[c]; ctx.fillRect(s.x - 1, s.y - 16, 2, 12); ctx.beginPath(); ctx.arc(s.x, s.y - 4, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const col of core.PLATES.slice(0, world.needed ?? 1)) {
    const on = (world.boxes ?? []).some((b) => b.col === col && b.row === 19);
    ctx.fillStyle = on ? "#5bd67a" : "#a8a59c"; ctx.fillRect(col * T + 1, 20 * T - 3, T - 2, 3);
  }
  (world.boxes ?? []).forEach((b) => drawBox(ctx, b.col * T, b.row * T));
  ctx.fillStyle = "#e9e4d6"; ctx.fillRect(15 * T, 5 * T + 2, 5 * T, 11);
  ctx.fillStyle = "#1e1e1c"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`;
  ctx.fillText(t("하중 {n}/{need}", { n: world.load ?? 0, need: world.needed ?? 1 }), 17.5 * T, 5 * T + 7.5);
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

export function schematic({ world }) {
  const bridge = E.phaseSolid(world, RED);
  return {
    map: [
      ...(world.boxes ?? []).map((b) => ({ kind: "box", x0: b.col * T, y0: b.row * T, x1: b.col * T + T, y1: b.row * T + T, tone: "warn" })),
      { kind: "device", x: SOCKETS.blue.x, y: SOCKETS.blue.y - 10, label: t("닻 청"), state: world.anchor === "blue" ? t("고정") : "-", tone: world.anchor === "blue" ? "ok" : "idle", color: PHASE_COLOR.blue },
      { kind: "device", x: SOCKETS.red.x + 8, y: SOCKETS.red.y - 22, label: t("닻 적"), state: world.anchor === "red" ? t("고정") : "-", tone: world.anchor === "red" ? "ok" : "idle", color: PHASE_COLOR.red },
      // the true phase and what it leaves standing: the control desk's (the field sees the blocks)
      { kind: "label", ctrl: true, x: 9 * T + 8, y: 15 * T, text: bridge ? t("적 다리 있음") : t("적 다리 없음 · 감전"), color: bridge ? PHASE_COLOR.red : "#e06060" },
      { kind: "label", x: 21 * T + 8, y: 15 * T - 4, text: world.gate ? t("게이트 G 열림") : t("게이트 G 잠김"), color: world.gate ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("방 위상"), ctrl: true, state: PHASE_NAME[world.phase] ?? "?", tone: "warn" },
      { label: t("위상 닻"), state: world.anchor ? t("{phase} 고정", { phase: PHASE_NAME[world.anchor] }) : t("없음"), tone: world.anchor ? "ok" : "idle" },
      { label: t("적 다리 (감전 구간)"), ctrl: true, state: bridge ? t("있음") : t("없음"), tone: bridge ? "ok" : "bad" },
      { label: t("압력판 하중"), state: `${world.load ?? 0}/${world.needed ?? 1}`, tone: world.gate ? "ok" : "warn", bar: Math.min(1, (world.load ?? 0) / (world.needed ?? 1)) },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR = uy(20 * T);
  kit.lamps([[3, uy(16 * T) - 0.04], [17, uy(6 * T) - 0.04], [26, uy(4 * T) - 0.04], [34, uy(4 * T) - 0.04]]);
  kit.rails([[24, 26, 16], [28, 30, 12], [31, 32, 8], [35, 37, 4]]);
  kit.column(13.5, FLOOR, 4);
  kit.fan(37, uy(15 * T));
  return {
    update(world, _actor, dt) {
      lever.update(world.lever, dt);
    },
  };
}
