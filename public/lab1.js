// Lab 1 "Joining" (입사): the first lab. docs/level-design.md, docs/campaign.md.
//
// Three stamp stations, one per piece of equipment, and an exit lever that unlocks when all
// three are stamped. Stamp ① sits behind a card door (the access card opens it, and it stays
// open), stamp ② on top of 4-tile shelves (walking aid), stamp ③ at the top of a dark shaft
// whose bridges only exist in the light. No "aha": the point is to learn the three tools and
// the habit of looking at the CCTV before picking one. The first trap (a laser) is on the
// ground floor, in the open. An old drawn note hangs on the wall from the start: a door, a
// house and three smudged glyphs. It means nothing yet (the last lab, 퇴근).
// The stamps must go in an approval order (결재 순서), drawn afresh every time the room opens and
// never the plain ①②③ (nor, on the server, the order the overseer will practise for 「퇴근」:
// see avoidOrder in src/lab1.ts). The catch: a veteran stamps in number order, or in any order
// as soon as the station is reached; the first stamp out of turn is refused. Where the order is
// posted depends on the headcount tier:
//   tier 1: on the board by the entrance, legible only to a body standing in front of it (the
//           worker's own screen: not the CCTV, not the public sheet). It travels by note.
//   tier 2-3: the board says 「관제실 문의」; the order is on the control desk's sheet only (ctrl).
// At every tier the desk sheet has it (ctrl), and spectators see a redaction bar. Without anyone
// reading it the field finds it by trying: a stamp out of turn is refused and its station lamp
// turns red for everyone until the next stamp goes in. A refusal costs that shift, never the room.
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { drawGlyph } from "./lab3.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
const { T, TILE, litBy } = E;
const { SOLID, BRIDGE, DOOR } = TILE;

export const id = 1;
export const name = t("입사");
export const characters = ["key", "tall", "light"];

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 16, 38, 19, 0], // the ground floor hall
  [3, 4, 14, 15, 0], // the shelf tower (walking aid)
  [6, 16, 8, 16, SOLID], // three 4-tile shelves
  [10, 12, 12, 12, SOLID],
  [4, 8, 8, 8, SOLID], // ...the top one holds stamp ②
  [25, 2, 32, 15, 0], // the dark shaft (light)
  // light bridges: solid only while lit, and only from above (lab 3 introduced them for reading)
  ...[[25, 17], [28, 14], [25, 11], [28, 8]].map(([x, y]) => [x, y, x + 2, y, BRIDGE]),
  [25, 5, 27, 5, SOLID], // the ledge with stamp ③
  [34, 16, 34, 19, DOOR], // the card door
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const READER = { x: 33 * T + 4, y: 20 * T }; // the card reader beside the door
export const LEVER = { x: 38 * T + 8, y: 20 * T };
export const DARK = { x0: 25 * T, y0: 2 * T, x1: 33 * T, y1: 16 * T };
/** The stamp stations, in the order of their numbers. who: the equipment that may stamp it. */
export const STAMPS = [
  { x: 36 * T + 8, y: 20 * T, who: "key" },
  { x: 5 * T + 8, y: 8 * T, who: "tall" },
  { x: 26 * T + 8, y: 5 * T, who: "light" },
];
export const STAMP_OF = { key: 0, tall: 1, light: 2 };
export const MARK = ["①", "②", "③"];
export const OLD_NOTE = { x: 21 * T + 8, y: 17 * T + 6, w: 34, h: 24 }; // on the hall wall, from the start
export const BOARD = { x: 13 * T + 8, y: 17 * T + 4 }; // the approval-order board by the entrance
/** How close (px, on the hall floor) a body must stand to read the board. */
export const BOARD_REACH = 14;
export const sign = { text: "LAB 01", x: 18.5, y: E.ROWS - 4.5 };

// The first trap anyone meets: a laser across the whole hall, well away from the entrance.
// The card and the light cross it; the walking aid's tower is before it.
export const traps = [
  { kind: "laser", x0: 18 * T + 4, y0: 16 * T, x1: 18 * T + 7, y1: 20 * T, on: 1400, off: 1600, phase: 0 },
];

// ---------- world ----------

export function fresh() {
  return { lab: 1, seq: [], door: false, lever: false, order: null, blind: false, refused: [] };
}
export function ensure(world) {
  return world && world.lab === 1 ? world : fresh();
}
export const stamped = (world, i) => (world.seq ?? []).includes(i);
/** Refused out of turn since the last stamp went in: the station lamp shows red to everyone. */
export const refused = (world, i) => (world.refused ?? []).includes(i);
export const allStamped = (world) => (world.seq ?? []).length >= STAMPS.length;
/** The stamp that has to come next, or null when any will do. */
export const nextStamp = (world) => (world.order ? world.order[(world.seq ?? []).length] ?? null : null);
export function progress(world) {
  return (world.seq ?? []).length + (world.door ? 1 : 0) + (world.lever ? 1 : 0);
}

/** Every order of the three stamps. */
export const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, k) => v === b[k]);

/**
 * An approval order that starts with the stamps already made (seq). It is never the plain ①②③
 * and never `avoid` (the run's exit order), unless the stamps already made leave no other choice.
 */
export function pickOrder(rand = Math.random, seq = [], avoid = null) {
  const fits = PERMS.filter((o) => seq.every((v, k) => o[k] === v));
  const good = fits.filter((o) => !same(o, PERMS[0]) && !same(o, avoid));
  const from = good.length ? good : fits;
  return [...from[Math.min(from.length - 1, Math.floor(rand() * from.length))]];
}

/**
 * A fresh opening. The order is drawn every time; tier 1 posts it on the board in the room (legible
 * up close only), tiers 2-3 post it only on the control desk's sheet (blind).
 */
export function newState(tier = 1, rand = Math.random, avoid = null) {
  return { seq: [], door: false, order: pickOrder(rand, [], avoid), blind: tier >= 2, refused: [], avoid: avoid ? [...avoid] : null };
}

/** The server's hook: never post this run's exit order (S5) as lab 1's own order. Mirrors src/lab1.ts. */
export function avoidOrder(state, avoid, rand = Math.random) {
  state.avoid = avoid ? [...avoid] : null;
  if (same(state.order, avoid)) state.order = pickOrder(rand, state.seq, avoid);
}

/**
 * A worker does something at a device (lab.act). Mutates the state and says what happened.
 * "door": the card opens the card door. "stamp": stamps the station of the worker's equipment.
 */
export function act(state, character, what) {
  if (what === "door") {
    if (character !== "key") return "bad";
    if (state.door) return "already";
    state.door = true;
    return "open";
  }
  if (what === "stamp") {
    const i = STAMP_OF[character];
    if (i === undefined) return "bad";
    if (state.seq.includes(i)) return "already";
    if (state.order && state.order[state.seq.length] !== i) {
      state.refused = [...(state.refused ?? []).filter((k) => k !== i), i];
      return "order";
    }
    state.seq.push(i);
    state.refused = [];
    return "stamped";
  }
  return "bad";
}

/** The admin's procedure valve: a new order that keeps the stamps already made at its head. */
export function retier(state, tier, rand = Math.random) {
  state.blind = tier >= 2;
  state.refused = [];
  state.order = pickOrder(rand, state.seq, state.avoid ?? null);
  return true;
}

export function publicWorld(world, state) {
  const w = { ...ensure(world), lab: 1, seq: [...state.seq], door: state.door, order: state.order, blind: state.blind, refused: [...(state.refused ?? [])] };
  w.lever = state.seq.length >= STAMPS.length && w.lever === true; // the lever is locked until all three are in
  return w;
}

export const canClear = (state, world) => state.seq.length >= STAMPS.length && world.lever === true;

/** The offline stand-in for the server rules in src/lab1.ts. */
export const local = { newState: (tier = 1) => newState(tier), publicWorld, canClear, act, retier };

// ---------- player ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}

export function doorOpen(world) {
  return !!world.door;
}

/** Bridges: solid only while lit, and only when landing from above (see lab3.js). */
export function solidAt(world, tx, ty, actor, feet) {
  const v = tileAt(tx, ty);
  if (v === SOLID) return true;
  if (v === DOOR) return !world.door;
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
export const nearStamp = (p) => STAMPS.findIndex((s) => E.near(p, s));
/** Standing on the hall floor in front of the approval-order board. */
export const nearBoard = (p) => E.near(p, { x: BOARD.x, y: 20 * T }, BOARD_REACH);
/** The order as marks, "③ → ① → ②". */
export const orderText = (order) => order.map((i) => MARK[i]).join(" → ");
/**
 * True when this actor reads the order off the board: tier 1 only, a body (not the drone, not a
 * camera) standing in front of it. The CCTV and the tapes film the board but cannot read it.
 */
export function readsBoard(world, actor, cctv = false) {
  return !cctv && !!world.order && !world.blind && !!actor && characters.includes(actor.character) && nearBoard(actor);
}

export function hint(world, p, character) {
  // the worker's own screen only (client.js draws hints for the worker, never on the CCTV)
  if (readsBoard(world, { ...p, character })) return t("결재 순서 {order}", { order: orderText(world.order) });
  if (nearReader(p) && !world.door) return character === "key" ? t("E: 카드 문") : t("출입 카드 필요");
  const i = nearStamp(p);
  if (i >= 0) {
    if (stamped(world, i)) return t("도장 {mark} 완료", { mark: MARK[i] });
    return STAMPS[i].who === character ? t("E: 도장 {mark}", { mark: MARK[i] }) : t("{equip} 전용", { equip: E.EQUIP[STAMPS[i].who].name });
  }
  if (nearLever(p) && !world.lever) return allStamped(world) ? t("E: 퇴근 레버") : t("도장 3개 필요");
  return "";
}

/** The use key. api: { world, p, character, say, act, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  if (nearReader(p) && !world.door) {
    if (character !== "key") return api.say(t("카드 문은 출입 카드로만 열립니다."));
    return api.act("door");
  }
  const i = nearStamp(p);
  if (i >= 0) {
    if (stamped(world, i)) return api.say(t("도장 {mark}은 이미 찍혀 있습니다.", { mark: MARK[i] }));
    if (STAMPS[i].who !== character) return api.say(t("도장 {mark}은 {equip}만 찍을 수 있습니다. 기록하겠습니다.", { mark: MARK[i], equip: E.EQUIP[STAMPS[i].who].name }));
    return api.act("stamp");
  }
  if (nearLever(p) && !world.lever) {
    if (!allStamped(world)) return api.say(t("서류가 부족합니다. 도장 3개가 필요합니다."));
    api.pullLever();
  }
}

/** What the overseer says when the server answers a lab.act. */
export function acted(what, result, world) {
  // never the next mark: the order stays where it is posted (the board up close, or the desk)
  if (result === "order") {
    return world.blind
      ? t("결재 순서가 아닙니다. 반려된 도장은 붉게 표시해 두겠습니다. 순서는 관제실 도면에 있습니다.")
      : t("결재 순서가 아닙니다. 반려된 도장은 붉게 표시해 두겠습니다. 순서는 입구 옆 게시판에 있습니다. 가까이 가야 읽힙니다.");
  }
  return null;
}

/** What the overseer says about a change, or null. */
export function narrate(prev, next) {
  if (next.lever && !prev.lever) return t("실험실 1 종료. 입사를 환영합니다. 오늘부터 여러분은 동료입니다.");
  const before = (prev.seq ?? []).length, now = (next.seq ?? []).length;
  if (now > before) {
    const i = next.seq[now - 1];
    if (now >= STAMPS.length) return t("도장 {mark} 확인. 서류가 갖춰졌습니다. 퇴근 레버가 풀렸습니다.", { mark: MARK[i] });
    if (now === 1) return t("도장 {mark} 확인. 남은 시간은 당신의 것입니다. 다음 근무자에게 쪽지를 남겨 보십시오. (N)", { mark: MARK[i] });
    return t("도장 {mark} 확인. 남은 도장 {n}개.", { mark: MARK[i], n: STAMPS.length - now });
  }
  if (next.door && !prev.door) return t("카드 문이 열렸습니다. 이 문은 앞으로도 열려 있습니다.");
  return null;
}

/** True when this equipment cannot move the lab forward from here. */
export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (allStamped(world)) return false; // anyone can pull the lever
  const i = STAMP_OF[character];
  // the order is never public: only what everyone saw (a green or a red lamp) counts
  return stamped(world, i) || refused(world, i);
}

export function mood(prev, next) {
  if ((next.seq ?? []).length > (prev.seq ?? []).length || (next.lever && !prev.lever)) return "BackFlip";
  if (next.door && !prev.door) return "BackFlip";
  return null;
}

// ---------- drawing ----------

export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

/** The room, its devices and the actor: everything the 3D renderer replaces. */
export function drawBase(ctx, { world, actor }) {
  E.drawTiles(ctx, self, world, actor);
  ctx.fillStyle = "#39404e"; ctx.fillRect(READER.x - 3, READER.y - 18, 6, 10);
  ctx.fillStyle = world.door ? "#5bd67a" : E.EQUIP.key.color; ctx.fillRect(READER.x - 2, READER.y - 17, 4, 3);
  STAMPS.forEach((s, i) => {
    ctx.fillStyle = "#39404e"; ctx.fillRect(s.x - 6, s.y - 18, 12, 18);
    ctx.fillStyle = lampColor(world, i); ctx.fillRect(s.x - 4, s.y - 15, 8, 5);
  });
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/** A station's lamp: green once stamped, red while refused out of turn, else its equipment's colour. */
function lampColor(world, i) {
  return stamped(world, i) ? "#5bd67a" : refused(world, i) ? "#e06060" : E.EQUIP[STAMPS[i].who].color;
}

/** The shaft's darkness, with a soft hole where the light worker stands. */
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

/**
 * On top of the room in both 2D and 3D: the stamp numbers and their seals, the old note, the
 * approval-order board (tier 2+), then the darkness and the name tag.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  STAMPS.forEach((s, i) => {
    const done = stamped(world, i);
    badge(ctx, s.x, s.y - 28, i, done);
    if (done) { // a red seal beside the number
      ctx.strokeStyle = "#d04040"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x + 10, s.y - 28, 4, 0, Math.PI * 2); ctx.stroke();
    } else if (refused(world, i)) { // refused out of turn: a red cross beside the number
      ctx.strokeStyle = "#e06060"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x + 7, s.y - 31); ctx.lineTo(s.x + 13, s.y - 25); ctx.moveTo(s.x + 13, s.y - 31); ctx.lineTo(s.x + 7, s.y - 25); ctx.stroke();
    }
  });
  ctx.restore();
  drawOldNote(ctx);
  drawBoard(ctx, world, readsBoard(world, actor, cctv));
  if (!opts.noDarkness) drawDarkness(ctx, opts);
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

/** A stamp's number on a square of its equipment's colour (green once stamped). Plain digits read at any size. */
function badge(ctx, x, y, i, done) {
  ctx.fillStyle = done ? "#5bd67a" : E.EQUIP[STAMPS[i].who].color;
  ctx.fillRect(Math.round(x) - 5, Math.round(y) - 5, 10, 10);
  ctx.fillStyle = "#14161a"; ctx.font = "8px Galmuri7, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(i + 1), Math.round(x), Math.round(y) + 0.5);
}

/** The old note: a door, a house beyond it and three glyphs nobody can make out yet. */
function drawOldNote(ctx) {
  const { x, y, w, h } = OLD_NOTE, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  ctx.save();
  ctx.fillStyle = "#d9cfae"; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = "#8a2f2f"; ctx.fillRect(Math.round(x) - 1, y0 - 1, 3, 3); // pin
  ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 4.5, y0 + 4.5, 6, 10); // a door
  ctx.beginPath(); ctx.moveTo(x0 + 12, y0 + 9.5); ctx.lineTo(x0 + 18, y0 + 9.5); ctx.stroke(); // an arrow
  ctx.beginPath(); ctx.moveTo(x0 + 20, y0 + 14.5); ctx.lineTo(x0 + 25, y0 + 9); ctx.lineTo(x0 + 30, y0 + 14.5); // a house
  ctx.moveTo(x0 + 21.5, y0 + 14.5); ctx.lineTo(x0 + 21.5, y0 + 18.5); ctx.lineTo(x0 + 28.5, y0 + 18.5); ctx.lineTo(x0 + 28.5, y0 + 14.5); ctx.stroke();
  // three glyphs, smudged: the ink has run
  ctx.globalAlpha = 0.35;
  for (let k = 0; k < 3; k++) drawGlyph(ctx, (k * 2 + 1) % 6, x0 + 6 + k * 6, y0 + h - 4, 4, "#1e1e1c", 1.4);
  ctx.restore();
}

/**
 * The approval-order board by the entrance. Tier 1: the order, but only for a body standing in
 * front of it (legible); everyone else, the CCTV and the tapes see three blank slips. Tiers 2-3:
 * a pointer to the console. The order itself is never painted where a camera can read it.
 */
function drawBoard(ctx, world, legible) {
  if (!world.order) return;
  const { x, y } = BOARD;
  ctx.save();
  ctx.fillStyle = "#e6e2d6"; ctx.fillRect(x - 24, y - 11, 48, 23);
  ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1; ctx.strokeRect(x - 23.5, y - 10.5, 47, 22);
  ctx.fillStyle = "#2a2a28"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(t("결재 순서"), x, y - 4);
  if (world.blind) {
    ctx.fillText(t("관제실 문의"), x, y + 6);
  } else {
    world.order.forEach((i, k) => {
      if (legible) badge(ctx, x - 15 + k * 15, y + 6, i, stamped(world, i));
      else { ctx.fillStyle = "#b8b2a2"; ctx.fillRect(x - 20 + k * 15, y + 1, 10, 10); } // small print: a blank slip from afar
      if (k) { ctx.fillStyle = "#2a2a28"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`; ctx.fillText("›", x - 22.5 + k * 15, y + 6); }
    });
  }
  ctx.restore();
}

// ---------- control console (see console.js) ----------

export function schematic({ world }) {
  const doorX = 34 * T + 8;
  // the order and "next" are the control desk's alone at every tier (tier 1's board is legible
  // only to a body in front of it); a refusal everyone saw stays public
  const stampRow = (i) => {
    const done = stamped(world, i), next = nextStamp(world), label = t("도장 {mark}", { mark: MARK[i] }) + " · " + E.EQUIP[STAMPS[i].who].name;
    if (done) return { label, state: t("날인"), tone: "ok" };
    if (refused(world, i)) return { label, state: t("반려"), tone: "bad" };
    return { label, state: next === i ? t("다음 차례") : t("대기"), tone: next === i ? "warn" : "idle", ctrl: true };
  };
  return {
    map: [
      { kind: "zone", tone: "dark", x0: DARK.x0, y0: DARK.y0, x1: DARK.x1, y1: DARK.y1, label: t("조도 미달") },
      { kind: "zone", tone: "blind", x0: OLD_NOTE.x - OLD_NOTE.w / 2, y0: OLD_NOTE.y - OLD_NOTE.h / 2, x1: OLD_NOTE.x + OLD_NOTE.w / 2, y1: OLD_NOTE.y + OLD_NOTE.h / 2, label: t("미분류 문서") },
      { kind: "device", x: READER.x, y: READER.y - 14, label: t("카드 리더"), state: world.door ? t("해제") : t("잠김"), tone: world.door ? "ok" : "warn", color: E.EQUIP.key.color },
      { kind: "label", x: doorX, y: 15 * T - 4, text: world.door ? t("카드 문 열림") : t("카드 문 잠김"), color: world.door ? "#5bd67a" : "#e06060" },
      ...STAMPS.map((s, i) => ({ kind: "device", x: s.x, y: s.y - 12, label: t("도장 {mark}", { mark: MARK[i] }), state: stamped(world, i) ? t("날인") : refused(world, i) ? t("반려") : t("대기"), tone: stamped(world, i) ? "ok" : refused(world, i) ? "bad" : "idle", color: E.EQUIP[s.who].color })),
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : allStamped(world) ? t("해제") : t("잠김"), tone: world.lever ? "ok" : allStamped(world) ? "warn" : "idle", color: "#e06060" },
      { kind: "label", x: 9 * T, y: 3 * T + 8, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color },
      // where the order lives, never the order itself
      ...(world.order ? [{ kind: "label", x: BOARD.x, y: BOARD.y - 16, text: world.blind ? t("결재 순서판 · 관제실 문의") : t("결재 순서판 · 가까이서만 읽힘"), color: "#d9d1bf" }] : []),
    ],
    status: [
      ...(world.order ? [{ label: t("결재 순서"), state: orderText(world.order), tone: "warn", ctrl: true }] : []),
      ...STAMPS.map((_, i) => stampRow(i)),
      { label: t("카드 문"), state: world.door ? t("열림") : t("잠김"), tone: world.door ? "ok" : "bad" },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : allStamped(world) ? t("해제") : t("잠김"), tone: world.lever ? "ok" : allStamped(world) ? "warn" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const reader = kit.terminal(ux(READER.x), uy(READER.y));
  const stations = STAMPS.map((s) => kit.terminal(ux(s.x), uy(s.y)));
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  const FLOOR = uy(20 * T);
  kit.lamps([[11, uy(16 * T) - 0.04], [21, uy(16 * T) - 0.04], [36.5, uy(16 * T) - 0.04], [8, uy(4 * T) - 0.04]]);
  kit.rails([[6, 8, 16], [10, 12, 12], [4, 8, 8], [25, 27, 5]]);
  kit.column(15.5, FLOOR, 4);
  kit.column(23.5, FLOOR, 4);
  kit.vent(19.5, uy(17 * T));
  kit.prop("chair", 3.6, FLOOR, { ry: Math.PI / 2 }); // the reception desk by the entrance
  kit.prop("computer-wide", 1.9, FLOOR);
  return {
    update(world, _actor, dt) {
      reader.setColor(world.door ? "#5bd67a" : E.EQUIP.key.color);
      stations.forEach((st, i) => st.setColor(lampColor(world, i)));
      lever.update(world.lever, dt);
    },
  };
}
