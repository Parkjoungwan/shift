// Room 4-2 "Echo choreography" (잔상 안무), the second stage of lab 4. docs/level-design.md.
//
// Lab 4 taught a rule: the echo has weight, so it holds any button it stands on. Here the rule
// has one exception (Braid's key that ignores rewinding, turned around). Two heavy doors each stay
// open while their plate (both in the entrance hall) is pressed and for a closing delay after.
// One plate is a weight plate,
// like lab 4's. The other is a badge plate (사번 판독): it reads the badge of whoever stands on it
// and only counts workers on shift. An echo is a worker who has clocked out, so it presses that
// plate and nothing happens.
//   - The weight door shuts almost at once (0.5 s or less): nobody steps off its plate and reaches
//     it alone. The echo has to stand on that plate.
//   - The badge door stays open a long while (2-3 s): a live worker steps on, runs, and is through.
// Which plate is which is drawn per room opening. A veteran parks the echo on a plate as in lab 4,
// often the badge plate, and loses a shift; the fix is cheap thinking, not fast hands (the run
// itself is a plain walk).
// The exception is shown first where it costs nothing: until the first echo is recorded, the
// room keeps a training echo (교육용 잔상) standing on the badge plate. Its reader blinks red and
// its door never moves. The reader post is on the plate in the field; the delays, the plate types
// and the wiring are ctrl on the console. More staff, more procedure: both doors close sooner.
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { ECHO_MS, ECHO_FRAMES, echoAt, echoOnPlateBetween, onPlate } from "./lab4core.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
export { echoAt };
const { T, TILE } = E;
const { SOLID, DOOR } = TILE;

export const id = 14;
export const name = t("잔상 안무");
export const characters = ["echo", "tall", "key"];

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 16, 38, 19, 0], // the long hall
  [16, 16, 16, 19, DOOR], // door 1
  [25, 16, 25, 19, DOOR], // door 2
  [26, 4, 38, 15, 0], // the lever room above
  [28, 16, 30, 16, SOLID], // 4-tile shelves
  [32, 12, 34, 12, SOLID],
  [36, 8, 38, 8, SOLID], // the lever's ledge
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const FLOOR = 20 * T;
/**
 * Plate i holds door i. Both plates are in the entrance hall, so the echo recorder can stand on
 * either without help, and each sits well back from its door: from the plate, door 1 is a 1 s
 * run and door 2 a 1.5 s run, longer than any weight door waits and shorter than any badge door.
 */
export const PLATES = [
  { x0: 5 * T, x1: 7 * T, y: FLOOR, door: 16 },
  { x0: 9 * T, x1: 11 * T, y: FLOOR, door: 25 },
];
export const LEVER = { x: 37 * T + 8, y: 8 * T };
export const sign = { text: "LAB 04", x: 7.5, y: E.ROWS - 4.5 };

// A laser across the last jump of the climb.
export const traps = [
  { kind: "laser", x0: 35 * T + 4, y0: 5 * T, x1: 35 * T + 7, y1: 12 * T, on: 1300, off: 1700, phase: 600 },
];

// ---------- rules (the offline stand-in for src/lab14.ts; same logic) ----------

/** Closing delays by procedure tier: the badge door (long) and the weight door (short). Keep in step with src/lab14.ts. */
export const BADGE_DELAY = [3000, 2600, 2200];
export const WEIGHT_DELAY = [500, 400, 300];
const tierIndex = (tier) => Math.max(1, Math.min(3, Number(tier) || 1)) - 1;
export function delaysFor(tier = 1, badge = 1) {
  const k = tierIndex(tier);
  return PLATES.map((_, i) => (i === badge ? BADGE_DELAY[k] : WEIGHT_DELAY[k]));
}
/** A room opening: which plate reads badges is drawn here (rand: for tests). */
export function newState(tier = 1, rand = Math.random) {
  const badge = rand() < 0.5 ? 0 : 1;
  return { tier: tierIndex(tier) + 1, badge, delays: delaysFor(tier, badge) };
}
export function retier(state, tier) {
  state.tier = tierIndex(tier) + 1;
  state.delays = delaysFor(state.tier, badgeOf(state));
  return true;
}
/** Which plate reads badges (rooms opened before the badge plates: plate 2). */
export const badgeOf = (src) => (src?.badge === 0 ? 0 : 1);
export const delayOf = (world, i) => {
  const d = Number(world?.delays?.[i]);
  return Number.isFinite(d) && d >= 0 && d <= 5000 ? d : delaysFor(1, badgeOf(world))[i];
};

export function fresh() {
  return { lab: 14, badge: 1, delays: delaysFor(1, 1), lever: false, echo: null };
}
export function ensure(world) {
  return world && world.lab === 14 ? world : fresh();
}
export function publicWorld(world, state) {
  const w = ensure(world), badge = badgeOf(state);
  const delays = Array.isArray(state?.delays) && state.delays.length === 2 ? state.delays : delaysFor(state?.tier ?? 1, badge);
  return { ...w, lab: 14, badge, delays: [...delays], lever: w.lever === true };
}
export const canClear = (_state, world) => world.lever === true && !!world.echo;
export const local = { newState, publicWorld, canClear, retier };

export function progress(world) {
  return (world.echo ? 1 : 0) + (world.lever ? 1 : 0);
}

// ---------- the plates and doors ----------

/**
 * Door i is held by the echo: it is on plate i now, or was within that door's closing delay. A badge
 * plate never counts the echo: it has clocked out. Cached per instant (the 3D, the tiles and the
 * physics all ask at the same moment).
 */
let memo = { echo: null, now: -1, key: "", held: [false, false] };
export function echoHolds(world, now) {
  const key = `${badgeOf(world)}:${delayOf(world, 0)}:${delayOf(world, 1)}`;
  if (memo.echo !== world.echo || memo.now !== now || memo.key !== key) {
    const badge = badgeOf(world);
    memo = {
      echo: world.echo, now, key,
      held: PLATES.map((pl, i) => i !== badge && !!world.echo && echoOnPlateBetween(world.echo, pl, now - delayOf(world, i), now)),
    };
  }
  return memo.held;
}

/** The echo stands on the badge plate at some point of its loop (it presses it, and is refused). */
export function echoOnBadge(world, echo = world.echo) {
  if (!echo || !Array.isArray(echo.frames)) return false;
  const pl = PLATES[badgeOf(world)];
  return echo.frames.length === ECHO_FRAMES && echo.frames.some(([x, y]) => onPlate({ x, y }, pl));
}

// The worker's own body, for callers that do not pass one (the 3D room asks doorOpen(world, tx, ty, now)).
// Only this client's worker, and only right now: a spectator's tape runs at another time.
let mine = null;
const recentSelf = (now) => (mine && Math.abs(now - mine.at) < 500 ? mine.p : null);

/** A door is open while the echo holds it (weight plate only), or this worker stands on its plate, and for the delay after. */
export function doorOpen(world, tx, _ty, now = Date.now(), actor = recentSelf(now)) {
  const i = PLATES.findIndex((pl) => pl.door === tx);
  if (i < 0) return false;
  return echoHolds(world, now)[i] || onPlate(actor, PLATES[i]) || (actor?.heldAt?.[i] ?? -1e9) >= now - delayOf(world, i);
}

/**
 * The training echo (교육용 잔상) left in a fresh room: it walks onto the badge plate and stands there,
 * over and over, while its door stays shut. Gone once a real echo is recorded (a new echo replaces the old).
 */
export function demoAt(world, now) {
  if (!world || world.echo) return null;
  const pl = PLATES[badgeOf(world)], cx = (pl.x0 + pl.x1) / 2;
  const k = (((now % ECHO_MS) + ECHO_MS) % ECHO_MS) / 1500;
  return { x: cx - 3 * T + Math.min(1, k) * 3 * T, y: FLOOR, face: 1, character: "echo" };
}

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}

export function solidAt(world, tx, ty, actor, _feet, now) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !doorOpen(world, tx, ty, now, actor);
  return false;
}

const self = { tileAt, solidAt, doorOpen };
/** The worker remembers when it last stood on each plate: its door stays open for the delay. */
export function step(world, p, input, character, dt, now) {
  PLATES.forEach((pl, i) => { if (onPlate(p, pl)) (p.heldAt ??= [])[i] = now; });
  mine = { p, at: now };
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearLever = (p) => E.near(p, LEVER);

export function hint(world, p, character) {
  if (nearLever(p) && !world.lever) return t("E: 퇴근 레버");
  const on = PLATES.findIndex((pl) => onPlate(p, pl));
  if (on >= 0 && on === badgeOf(world)) return t("사번 판독 발판 · 근무 중인 사번만 인식합니다");
  if (on >= 0 && character === "echo") return t("발판 {n} · 퇴근 전 마지막 8초가 반복됩니다", { n: on + 1 });
  return "";
}

export function use(api) {
  if (nearLever(api.p) && !api.world.lever) api.pullLever();
}

export function narrate(prev, next) {
  if (prev.lab !== 14) return null;
  if (next.lever && !prev.lever) return t("공정 2 완료. 퇴근한 동료가 문을 잡아 주었습니다.");
  if (next.echo && next.echo.at !== prev.echo?.at) {
    return echoOnBadge(next)
      ? t("잔상이 기록되었습니다. 판독기가 퇴근한 사번을 인식하지 않습니다. 기록하겠습니다.")
      : t("잔상이 기록되었습니다. 퇴근한 근무자가 아직 일하고 있습니다.");
  }
  return null;
}

export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "key") return true; // nothing here takes a card: scout, and write
  if (character === "tall") return !world.echo;
  return false;
}

export function mood(prev, next) {
  if (next.echo && next.echo.at !== prev.echo?.at) return "Charging";
  if (next.lever && !prev.lever) return "BackFlip";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

export function drawBase(ctx, { world, actor, echo, now }) {
  E.drawTiles(ctx, { tileAt, doorOpen: (w, tx, ty) => doorOpen(w, tx, ty, now, actor) }, world, actor, now);
  E.drawActor2D(ctx, demoAt(world, now), 0.3);
  E.drawActor2D(ctx, echo, 0.45);
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/** On top of the room: the plates, their doors' lamps, and the badge reader on its plate. */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv, now = Date.now() } = opts;
  const held = echoHolds(world, now);
  const badge = badgeOf(world);
  const ghost = demoAt(world, now) ?? echoAt(world.echo, now);
  ctx.save();
  PLATES.forEach((pl, i) => {
    const on = held[i] || onPlate(actor, pl);
    ctx.fillStyle = on ? "#46c98a" : "#a8a59c"; ctx.fillRect(pl.x0 + 1, pl.y - 3, pl.x1 - pl.x0 - 2, 3);
    ctx.fillStyle = "#1e1e1c"; ctx.fillRect(pl.door * T + 2, 15 * T - 8, 12, 8);
    const open = doorOpen(world, pl.door, 16, now, actor);
    ctx.fillStyle = open ? "#46c98a" : "#c8402e"; ctx.fillRect(pl.door * T + 4, 15 * T - 6, 8, 4);
    ctx.fillStyle = "#e9e4d6"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), (pl.x0 + pl.x1) / 2, pl.y + 6);
    if (i !== badge) return;
    // the badge reader: a post at the plate's far end with a card slot and a lamp
    const px = pl.x1 - 3;
    ctx.fillStyle = "#4a4a48"; ctx.fillRect(px, pl.y - 18, 3, 15);
    ctx.fillStyle = "#1e1e1c"; ctx.fillRect(px - 2, pl.y - 22, 7, 6);
    const refused = ghost && onPlate(ghost, pl) && Math.floor(now / 250) % 2 === 0;
    ctx.fillStyle = onPlate(actor, pl) ? "#46c98a" : refused ? "#e04030" : "#6a6a66";
    ctx.fillRect(px - 1, pl.y - 21, 5, 2);
  });
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

/**
 * Public: the plates, the doors and whether they are open, the lever. ctrl (the desk on shift):
 * which plate reads badges, the wiring and both closing delays.
 */
export function schematic({ world, now = Date.now(), actor }) {
  const held = echoHolds(world, now);
  const badge = badgeOf(world), weight = 1 - badge;
  const under = 20.6 * T;
  const sec = (i) => (delayOf(world, i) / 1000).toFixed(1);
  return {
    map: [
      ...PLATES.map((pl, i) => ({ kind: "wire", on: held[i] || onPlate(actor, pl), pts: [(pl.x0 + pl.x1) / 2, pl.y, (pl.x0 + pl.x1) / 2, under, pl.door * T + 8, under, pl.door * T + 8, pl.y], ctrl: true })),
      ...PLATES.map((pl, i) => ({ kind: "device", x: (pl.x0 + pl.x1) / 2, y: pl.y - 4, label: t("발판 {n}", { n: i + 1 }), state: held[i] || onPlate(actor, pl) ? t("눌림") : t("비어 있음"), tone: held[i] ? "ok" : "idle", color: E.EQUIP.echo.color })),
      ...PLATES.map((pl, i) => ({ kind: "label", x: (pl.x0 + pl.x1) / 2, y: pl.y - 22, ctrl: true, color: i === badge ? "#c8402e" : "#3f8f4a",
        text: i === badge ? t("사번 판독 · 퇴근자 불가") : t("무게 감지") })),
      ...PLATES.map((pl, i) => {
        const open = doorOpen(world, pl.door, 16, now, actor);
        return { kind: "label", x: pl.door * T + 8, y: 15 * T - 12, text: open ? t("문 {n} 열림", { n: i + 1 }) : t("문 {n} 닫힘", { n: i + 1 }), color: open ? "#5bd67a" : "#e06060" };
      }),
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 32 * T, y: 5 * T, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("잔상"), state: world.echo ? t("기록됨 · 8초 반복") : t("없음"), tone: world.echo ? "ok" : "idle" },
      ...PLATES.map((pl, i) => {
        const open = doorOpen(world, pl.door, 16, now, actor);
        return { label: [t("문 1"), t("문 2")][i], state: open ? t("열림") : t("닫힘"), tone: open ? "ok" : "bad" };
      }),
      { label: t("발판 방식"), state: t("{b}번 사번 판독 · {w}번 무게", { b: badge + 1, w: weight + 1 }), tone: "warn", ctrl: true },
      { label: t("닫힘 지연"), state: t("문 1 {a}초 · 문 2 {b}초", { a: sec(0), b: sec(1) }), tone: "warn", ctrl: true },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { THREE, add, ux, uy, DEPTH } = kit;
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR3 = uy(FLOOR);
  kit.lamps([[6, uy(16 * T) - 0.04], [19.5, uy(16 * T) - 0.04], [31, uy(4 * T) - 0.04]]);
  kit.rails([[28, 30, 16], [32, 34, 12], [36, 38, 8]]);
  kit.column(13.5, FLOOR3, 4);
  kit.vent(19.5, uy(17 * T));

  // a badge reader post at each plate's far end; only this opening's badge plate shows one
  const readers = PLATES.map((pl) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), kit.mat("#4a4a48"));
    post.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.22), kit.mat("#2b2b29"));
    head.position.y = 1.12;
    const lampMat = new THREE.MeshBasicMaterial({ color: "#6a6a66" });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), lampMat);
    lamp.position.set(0, 1.18, 0.12);
    g.add(post, head, lamp);
    g.position.set(ux(pl.x1 - 2), FLOOR3, -DEPTH * 0.3);
    add(g);
    return { g, lampMat };
  });

  // the training echo: a see-through green figure (render3d's echo robot is the real echo's)
  const see = { transparent: true, opacity: 0.32, depthWrite: false };
  const demo = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.45), new THREE.MeshBasicMaterial({ color: "#46c98a", ...see }));
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.4), new THREE.MeshBasicMaterial({ color: "#b8ffd8", ...see }));
  head.position.y = 1.15;
  demo.add(body, head);
  add(demo);

  return {
    update(world, actor, dt, _time, now = Date.now(), echo = null) {
      lever.update(world.lever, dt);
      const badge = badgeOf(world);
      const d = demoAt(world, now);
      demo.visible = !!d;
      if (d) demo.position.set(ux(d.x), uy(d.y), 0);
      const ghost = d ?? echo;
      readers.forEach((r, i) => {
        r.g.visible = i === badge;
        const refused = ghost && onPlate(ghost, PLATES[i]) && Math.floor(now / 250) % 2 === 0;
        r.lampMat.color.set(onPlate(actor, PLATES[i]) ? "#3bff7a" : refused ? "#ff3b3b" : "#6a6a66");
      });
    },
  };
}
