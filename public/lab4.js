// Lab 4 "Elevator": a time handover puzzle, and where the echo recorder is introduced.
// The lift is called only while both safety buttons are held, and they are too far apart
// for one person. The echo recorder leaves its last 8 seconds behind to hold one of them;
// the access card powers the breaker and holds the other; the lift arrives 30-50 seconds
// later (drawn per room opening), usually in the next shift, and the walking aid rides it up
// to the exit lever.
// Who knows the delay: the control desk (timeline, ctrl rows) and a body standing at the
// ground-floor board. Spectators see neither the board's numbers nor the public console's
// timeline; a careful one times call -> arrival on the tape (the cab leaves the top floor, the
// board lamp turns amber, then green). Veterans who "read the board and board" get caught by
// shift 2: it has to choose when to call before anyone on the next shift can read anything.

import * as E from "./engine.js";
import * as core from "./lab4core.js";
import { t, FONT_FALLBACK, siteClock } from "./i18n.js";

export * from "./engine.js";
export { echoAt, lift, liftIn, LIFT, PLATES, platesHeld, DELAYS } from "./lab4core.js";
const { T, TILE } = E;
const { SOLID, DOOR } = TILE;

export const id = 4;
export const name = t("엘리베이터");
export const characters = ["echo", "key", "tall", "light"];

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 15, 30, 19, 0], // ground floor hall
  [31, 16, 31, 19, DOOR], // lift door, ground floor
  [32, 1, 35, 19, 0], // lift shaft
  [14, 1, 30, 10, 0], // top floor
  [31, 7, 31, 10, DOOR], // lift door, top floor
  [22, 7, 25, 7, SOLID], // ledges only the walking aid can climb
  [16, 3, 19, 3, SOLID],
]);

export const SPAWN = { x: 8 * T + 8, y: 20 * T };
export const BREAKER = { x: 23 * T + 8, y: 20 * T };
export const LEVER = { x: 17 * T + 8, y: 3 * T };
export const DISPLAY = { x: 31 * T + 8, y: 14 * T + 4 }; // arrival board above the ground floor door
export const sign = { text: "LAB 04", x: 27.5, y: E.ROWS - 4.5 };

// Traps (engine.js): a press on the way from the entrance to the breaker, and a laser on the
// jump from the walking-aid ledge up to the lever.
export const traps = [
  { kind: "press", x0: 18 * T + 2, x1: 20 * T - 2, top: 15 * T, bottom: 20 * T, period: 2600, down: 700, phase: 0 },
  { kind: "laser", x0: 334, y0: 40, x1: 337, y1: 104, on: 1300, off: 1900, phase: 300 },
  // hidden, one tile: on the top floor, between the lift and the ledges (hop over it)
  { kind: "plate", x0: 27 * T, x1: 28 * T, y: 11 * T, hidden: true },
];

// ---------- world ----------

export function fresh() {
  return { lab: 4, breaker: false, lever: false, callAt: null, calls: 0, echo: null };
}
export function ensure(world) {
  return world && world.lab === 4 ? world : fresh();
}
export function progress(world) {
  return (world.echo ? 1 : 0) + (world.breaker ? 1 : 0) + (world.calls > 0 ? 1 : 0) + (world.lever ? 1 : 0);
}
export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}

/** The offline stand-in for the server rules (the server uses the same functions). */
export const local = {
  newState: core.newState,
  publicWorld: (world, state) => core.publicWorld(ensure(world), state),
  canClear: core.canClear,
};

// ---------- physics hooks ----------

/** Ground floor door: open while the lift waits there. Top floor door: open while it is parked up there. */
export function doorOpen(world, _tx, ty, now) {
  const phase = core.liftIn(world, now).phase;
  return ty >= 15 ? phase === "bottom" : phase === "parked";
}

export function solidAt(world, tx, ty, _actor, _feet, now) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !doorOpen(world, tx, ty, now);
  return false;
}

/** The lift floor: a surface you can stand on and ride. */
export function bodies(world, now) {
  return [{ x0: core.LIFT.x0, x1: core.LIFT.x1, y: core.liftIn(world, now).y }];
}

const self = { tileAt, solidAt, doorOpen, bodies };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearBreaker = (p) => E.near(p, BREAKER);
export const nearLever = (p) => E.near(p, LEVER);

export function hint(world, p, character, now) {
  if (nearBreaker(p)) {
    if (character !== "key") return t("출입 카드 필요");
    return world.breaker ? t("E: 차단기 내리기") : t("E: 차단기 올리기");
  }
  if (nearLever(p) && !world.lever) return t("E: 레버");
  const echo = core.echoAt(world.echo, now);
  const held = core.platesHeld(p, echo);
  const mine = core.PLATES.findIndex((pl) => core.onPlate(p, pl));
  if (mine >= 0) {
    if (!held[1 - mine]) return t("안전 버튼: 반대쪽 버튼도 눌려야 합니다");
    if (!world.breaker) return t("안전 버튼: 전원이 없습니다");
    if (core.liftIn(world, now).phase !== "parked") return t("엘리베이터 운행 중");
    return t("호출 중…");
  }
  return "";
}

/** The use key. api: { world, p, character, say, change, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  if (nearBreaker(p)) {
    if (character !== "key") return api.say(t("차단기는 출입 카드로만 조작할 수 있습니다. 기록하겠습니다."));
    return api.change((w) => { w.breaker = !w.breaker; });
  }
  if (nearLever(p) && !world.lever) api.pullLever();
}

let lastAsk = 0;
/** Every frame while working: when both buttons are held and the lift can come, ask the server to call it. */
export function tick(api) {
  const { world, p, now } = api;
  if (!world.breaker || core.liftIn(world, now).phase !== "parked") return;
  const held = core.platesHeld(p, core.echoAt(world.echo, now));
  if (held[0] && held[1] && Date.now() - lastAsk > 1000) {
    lastAsk = Date.now();
    api.send({ t: "lab.call", x: p.x, y: p.y });
  }
}

export function narrate(prev, next) {
  // everyone hears this, so no seconds: the countdown is on the ground-floor board and the desk
  if (next.calls > prev.calls) return t("엘리베이터를 호출했습니다. 도착 시각은 1층 전광판에 표시됩니다. 다음 근무자에게 전달하십시오.");
  if (next.echo && next.echo.at !== prev.echo?.at) return t("잔상이 기록되었습니다. 퇴근한 근무자가 아직 일하고 있습니다.");
  if (next.breaker && !prev.breaker) return t("전원이 들어왔습니다. 안전 규정상 버튼은 두 사람이 눌러야 합니다.");
  if (next.lever && !prev.lever) return t("실험실 4 종료. 결과를 기록합니다.");
  return null;
}

export function useless(world, character) {
  return character === "light" || (character === "tall" && !world.calls) || !characters.includes(character);
}

export function mood(prev, next) {
  if (next.calls > prev.calls || (next.lever && !prev.lever)) return "BackFlip";
  if (next.echo && next.echo.at !== prev.echo?.at) return "Charging";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

export function drawBase(ctx, { world, actor, echo, now }) {
  E.drawTiles(ctx, self, world, actor, now);
  const held = core.platesHeld(actor, echo);
  core.PLATES.forEach((pl, i) => { ctx.fillStyle = held[i] ? "#5bf09a" : "#2d6a4a"; ctx.fillRect(pl.x0, pl.y - 3, pl.x1 - pl.x0, 3); });
  ctx.fillStyle = "#39404e"; ctx.fillRect(BREAKER.x - 6, BREAKER.y - 26, 12, 16);
  ctx.fillStyle = world.breaker ? "#5bd67a" : "#e06060"; ctx.fillRect(BREAKER.x - 2, BREAKER.y - (world.breaker ? 26 : 16), 4, 6);
  const y = core.liftIn(world, now).y;
  ctx.fillStyle = "#8a95a8"; ctx.fillRect(core.LIFT.x0, y, core.LIFT.x1 - core.LIFT.x0, 4);
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, echo, 0.45);
  E.drawActor2D(ctx, actor);
}

/**
 * The arrival board and the name tag. The board's numbers are for bodies in the room only: the
 * CCTV (spectators, the tape, the control desk's window) shows the board's lamp in 3D, not the text.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv, now } = opts;
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
  if (cctv) return;
  const l = core.liftIn(world, now);
  let text = t("대기"), color = "#7d8696";
  if (l.phase === "bottom") { text = t("탑승 {sec}", { sec: Math.ceil(l.leavesIn / 1000) }); color = "#5bf09a"; }
  // arrival as a time on the building clock (HUD), not a countdown: it can be written on a note
  else if (l.arriveIn !== null && l.arriveIn > 0) { text = t("도착 {time}", { time: siteClock(world.callAt + core.arriveMsOf(world)) }); color = "#f0c040"; }
  else if (l.phase === "rising") { text = t("상승"); color = "#5bf09a"; }
  ctx.save();
  ctx.font = `bold 9px ui-monospace, Consolas, ${FONT_FALLBACK}`;
  ctx.textAlign = "center";
  const w = Math.max(30, ctx.measureText(text).width + 8);
  ctx.fillStyle = "#05070acc";
  ctx.fillRect(DISPLAY.x - w / 2, DISPLAY.y - 9, w, 12);
  ctx.fillStyle = color;
  ctx.fillText(text, DISPLAY.x, DISPLAY.y);
  ctx.restore();
}

// ---------- control console (see console.js) ----------

const LIFT_STATE = {
  parked: [t("위층 정차"), "idle"], leaving: [t("출발"), "warn"], away: [t("이동 중"), "warn"],
  descending: [t("하강"), "warn"], bottom: [t("1층 탑승 가능"), "ok"], rising: [t("상승"), "ok"],
};

/**
 * What the system knows about this room. Public: where things are, the cab, the buttons, the
 * breaker and the lift's phase (all of it on the CCTV anyway). ctrl (the desk on shift only): the
 * wiring, this opening's arrival delay and the countdown.
 */
export function schematic({ world, now, actor, echo }) {
  const L = core.LIFT, l = core.liftIn(world, now), A = core.arriveMsOf(world);
  const held = core.platesHeld(actor, echo);
  const both = held[0] && held[1];
  const under = 20.6 * T, shaftX = 33 * T;
  const [liftText, liftTone] = LIFT_STATE[l.phase];
  // one ctrl row for the delay: before a call, how long it will take; then the countdown
  let timer = { label: t("도착 지연"), state: t("호출 후 {sec}초", { sec: A / 1000 }), tone: "idle", ctrl: true };
  if (l.phase === "bottom") timer = { ...timer, state: t("탑승 {sec}초 남음", { sec: Math.ceil(l.leavesIn / 1000) }), tone: "ok", bar: l.leavesIn / L.waitMs };
  else if (l.arriveIn > 0) timer = { ...timer, state: t("도착 예정 {time}", { time: siteClock(world.callAt + A) }), tone: "warn", bar: 1 - l.arriveIn / A };
  const press = (i) => (held[i] ? t("눌림") : t("비어 있음"));
  const map = [
    { kind: "wire", on: both, pts: [3 * T, 20 * T, 3 * T, under, shaftX, under, shaftX, 20 * T], ctrl: true },
    { kind: "wire", on: both, pts: [27 * T, 20 * T, 27 * T, under], ctrl: true },
    { kind: "wire", on: !!world.breaker, pts: [BREAKER.x, BREAKER.y - 22, BREAKER.x, 14 * T + 8, L.x0, 14 * T + 8], ctrl: true },
    { kind: "box", x0: L.x0 + 2, y0: l.y - 3 * T, x1: L.x1 - 2, y1: l.y, label: t("승강기"), tone: liftTone },
    ...core.PLATES.map((pl, i) => ({ kind: "device", x: (pl.x0 + pl.x1) / 2, y: pl.y - 6, label: `B${i + 1}`, state: held[i] ? t("눌림") : "", tone: held[i] ? "ok" : "idle", color: "#46c98a" })),
    { kind: "device", x: BREAKER.x, y: BREAKER.y - 18, label: t("차단기"), state: world.breaker ? "ON" : "OFF", tone: world.breaker ? "ok" : "bad", color: E.EQUIP.key.color },
    { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
    { kind: "label", x: 21 * T, y: 9.6 * T, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color },
    // the board's numbers, as the desk reads them off the lift controller
    { kind: "label", x: DISPLAY.x, y: DISPLAY.y + 2, ctrl: true, color: "#f0c040",
      text: l.arriveIn > 0 ? t("도착 {time}", { time: siteClock(world.callAt + A) }) : t("지연 {sec}초", { sec: A / 1000 }) },
  ];
  return {
    map,
    status: [
      { label: t("잔상"), state: world.echo ? t("기록됨 · 8초 반복") : t("없음"), tone: world.echo ? "ok" : "idle" },
      { label: t("차단기"), state: world.breaker ? "ON" : "OFF", tone: world.breaker ? "ok" : "bad" },
      { label: t("버튼 B1 · B2"), state: `${press(0)} · ${press(1)}`, tone: both ? "ok" : "idle" },
      { label: t("엘리베이터"), state: liftText, tone: liftTone },
      timer,
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { THREE, add, ux, uy, DEPTH } = kit;
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  kit.lamps([[8, 6.96], [20, 6.96], [18, 20.96], [27, 20.96]]);
  kit.rails([[22, 25, 7], [16, 19, 3]]);
  kit.prop("computer-system", 12.4, uy(20 * T));
  kit.prop("chair", 28.6, uy(11 * T), { ry: Math.PI / 2 });
  // pillars and vents for the hall, a fan upstairs
  for (const x of [4.5, 15.5]) kit.column(x, uy(20 * T), 5);
  kit.vent(19, 5.6);
  kit.fan(29.5, 14);
  kit.vent(23.5, 19.6);

  const steel = kit.mat("#59647a", { metalness: 0.6, roughness: 0.4 });
  const dark = kit.mat("#232a36", { metalness: 0.5, roughness: 0.6 });
  const glow = (color) => new THREE.MeshBasicMaterial({ color });

  // shaft guide rails on the back wall
  for (const x of [32.15, 35.85]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 19, 0.16), dark);
    rail.position.set(x, E.ROWS - 10.5, -DEPTH / 2 + 0.12);
    add(rail);
  }

  // the cab: a floor, a cage frame and a lamp strip that turns green while it waits for you
  const L = core.LIFT, cabW = (L.x1 - L.x0) / T;
  const cab = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.1, 0.3, DEPTH * 0.9), steel);
  floor.position.y = -0.15;
  cab.add(floor);
  for (const x of [-cabW / 2 + 0.1, cabW / 2 - 0.1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), steel);
    post.position.set(x, 1.3, -DEPTH * 0.4);
    cab.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.1, 0.18, 0.18), steel);
  beam.position.set(0, 2.6, -DEPTH * 0.4);
  const stripMat = glow("#f0c040");
  const strip = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.3, 0.13, 0.13), stripMat);
  strip.position.set(0, 2.45, -DEPTH * 0.4 + 0.12);
  cab.add(beam, strip);
  cab.position.x = (L.x0 + L.x1) / 2 / T;
  add(cab);

  // breaker box on the wall, with a handle that flips up when powered
  const bx = ux(BREAKER.x), by = uy(BREAKER.y);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.3), dark);
  box.position.set(bx, by + 1.25, -DEPTH / 2 + 0.15);
  const breakerLamp = glow("#ff4040");
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), breakerLamp);
  lamp.position.set(bx + 0.22, by + 1.55, -DEPTH / 2 + 0.32);
  const handle = new THREE.Group();
  handle.position.set(bx - 0.08, by + 1.25, -DEPTH / 2 + 0.34);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), steel);
  grip.position.y = 0.2;
  handle.add(grip);
  add(box, lamp, handle);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ map: kit.hazardTex() }));
  stripe.position.set(bx, by + 1.9, -DEPTH / 2 + 0.01);
  add(stripe);

  // the two safety buttons: floor pads that light up while something stands on them
  const pads = core.PLATES.map((pl) => {
    const m = glow("#e8b830"); // safety yellow: something to stand on (see FIELD_PALETTE in render3d.js)
    const pad = new THREE.Mesh(new THREE.BoxGeometry((pl.x1 - pl.x0) / T - 0.2, 0.13, DEPTH * 0.7), m);
    pad.position.set((pl.x0 + pl.x1) / 2 / T, uy(pl.y) + 0.065, 0);
    add(pad);
    return m;
  });

  // arrival board above the ground floor door (the numbers are drawn in 2D on top)
  const boardMat = glow("#3a404c");
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.1), boardMat);
  board.position.set(ux(DISPLAY.x), uy(DISPLAY.y) + 0.25, DEPTH / 2 + 0.05);
  add(board);

  let flip = -0.6;
  return {
    update(world, actor, dt, _time, now, echo) {
      const l = core.liftIn(world, now);
      cab.position.y = uy(l.y);
      stripMat.color.set(l.phase === "bottom" ? "#3bff7a" : l.phase === "parked" ? "#7d8696" : "#f0c040");
      boardMat.color.set(l.phase === "bottom" ? "#1f6a3a" : l.arriveIn > 0 ? "#5a4a18" : "#3a404c");
      flip += ((world.breaker ? 0.6 : -0.6) - flip) * Math.min(1, dt * 8);
      handle.rotation.z = flip;
      breakerLamp.color.set(world.breaker ? "#40ff80" : "#ff4040");
      const held = core.platesHeld(actor, echo);
      pads.forEach((m, i) => m.color.set(held[i] ? "#4fae5a" : "#e8b830"));
      lever.update(world.lever, dt);
    },
  };
}
