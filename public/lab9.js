// The last lab, "Clocking out" (퇴근). docs/level-design.md, docs/concept.md.
//
// The facility's last employee left one handover note when they went home: a drawing, not
// words. The overseer was the next worker. It kept the note and never understood it, and has
// been running experiments ever since to learn how people hand work over in pictures.
// Here the players read it. The note is torn into pieces (one to three, more procedure with
// more staff, docs/campaign.md): one at eye level by the entrance, one high above a ledge
// (walking aid), one in a dark alcove (light). The system cannot read drawings, so the CCTV
// and the blueprint only say "unreadable"; you have to stand in front of a piece to read it.
// The exit chamber is sealed by a fake wall you can simply walk through. Only the echo
// recorder sees the last employee's ghost walking through it, so the way travels by note.
// The card types the glyphs at the exit terminal; whoever walks out leaves a note for the
// overseer, and the building closes.
// The archive key (reports/퍼즐 깊이 설계 리서치.md S5): under each glyph is one of lab 1's stamp
// marks ①②③ (glyph i of the whole note carries mark i % 3; the CCTV and the blueprint only know
// the marks are lab 1's form). The terminal wants the glyphs mark by mark, in the order the
// overseer stamped lab 1's stations in its practice shift, and within a mark in reading order.
// That order is never the plain ①②③ and it lives only in this run's lab 1 record (the practice
// tape, #0 감독관; the archive list marks the record 보존). The overseer asks about the marks when
// the room opens. A wrong entry locks the terminal for the rest of that shift, for everyone to see,
// and every second wrong entry of the run re-tears the note (new glyphs, same order: the archive
// stays true, every drawing of the old pieces goes false). gen / genAt / genWhy mark it, like lab 3.
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { drawGlyph, GLYPH_COUNT } from "./lab3.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
export { drawGlyph, GLYPH_COUNT };
const { T, P, TILE } = E;
const { SOLID, DOOR, FAKE } = TILE;

export const id = 9;
export const name = t("퇴근");
export const characters = ["key", "tall", "light", "echo"];

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 12, 30, 19, 0], // the hall
  [12, 16, 14, 16, SOLID], // the ledge under note piece 2 (walking aid only)
  [31, 18, 32, 19, FAKE], // the fake wall: looks like rock, walk straight through
  [33, 15, 37, 19, 0], // the exit chamber
  [38, 16, 38, 19, DOOR], // the exit door
  [39, 16, 39, 19, 0], // outside
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const TERMINAL = { x: 35 * T + 8, y: 20 * T };
export const OUT_X = 39 * T + 4; // past the exit door: clocked out for good
export const DARK = { x0: 19 * T, y0: 12 * T, x1: 26 * T, y1: 17 * T }; // the alcove above the walkway
/** Where the note's pieces hang: ① by the entrance, ② above the ledge, ③ in the dark alcove. */
export const PIECES = [
  { x: 7 * T + 8, y: 17 * T, w: 34, h: 28, from: "floor" },
  { x: 13 * T + 8, y: 14 * T, w: 26, h: 24, from: "ledge" },
  { x: 22 * T + 8, y: 15 * T, w: 26, h: 24, from: "light" },
];
export const sign = { text: "EXIT", x: 35.5, y: E.ROWS - 16.2 };

// Traps (engine.js): a laser across the hall, and a hidden plate just before the fake wall.
export const traps = [
  { kind: "laser", x0: 16 * T + 4, y0: 17 * T, x1: 16 * T + 7, y1: 20 * T, on: 1400, off: 1600, phase: 300 },
  { kind: "plate", x0: 28 * T, x1: 29 * T, y: 20 * T, hidden: true },
];

// ---------- world ----------

/** pieces: the glyphs on each piece, e.g. [[3, 0, 5]] or [[1, 4], [2, 2], [0, 5]]. */
export function fresh() {
  return { lab: 9, pieces: [], door: false, tries: 0, locked: false, lockedAt: null, last: null, gen: 1, genAt: 0, genWhy: "open", out: false };
}
export function ensure(world) {
  return world && world.lab === 9 ? world : fresh();
}
export function progress(world) {
  return (world.door ? 1 : 0) + (world.out ? 1 : 0);
}
export const code = (world) => (world.pieces ?? []).flat();
/** The orders the overseer may have practised: every order of the three stamps but ①②③ (src/lab9.ts). */
export const ORDERS = [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
export const LOCK_MS = 61_500;
/** Every this many wrong entries in the run, the note is torn afresh (src/lab9.ts). */
export const RETEAR_EVERY = 2;
/** The stamp mark (0-2 for ①②③) under glyph i of the whole note. */
export const markOf = (i) => i % 3;
/** Lab 1's stamp marks: the equipment whose station it was. */
export const MARK_WHO = ["key", "tall", "light"];
/** What the exit terminal wants: the glyphs mark by mark in the practised order, each mark in reading order. */
export function exitCode(pieces, order) {
  const flat = (pieces ?? []).flat();
  return order.flatMap((m) => flat.filter((_, i) => markOf(i) === m));
}
/** Locked by a wrong entry this shift (the server clears it when the shift ends). */
export const locked = (world, now = Date.now()) => !world.door && !!world.locked && (world.lockedAt == null || now - world.lockedAt < LOCK_MS);
/** Out of the building: the shift counts as cleared whatever else happens (client.js clockOut). */
export const finished = (world) => !!world.door && !!world.out;

/** The note, torn into tier pieces: three glyphs on one piece, or two on each of two or three. */
export function tornNote(tier = 1, rand = Math.random) {
  const n = Math.max(1, Math.min(3, tier)), per = n === 1 ? 3 : 2;
  return Array.from({ length: n }, () => Array.from({ length: per }, () => Math.floor(rand() * GLYPH_COUNT)));
}

export const isLocked = (state, now = Date.now()) => !state.door && state.lockedAt != null && now - state.lockedAt < LOCK_MS;

/** New pieces in the same places, with glyphs that are not the old ones; the order stays. */
export function retear(state, now = Date.now(), rand = Math.random) {
  const old = JSON.stringify(state.pieces);
  for (let k = 0; k < 10 && JSON.stringify(state.pieces) === old; k++) state.pieces = tornNote(state.pieces.length, rand);
  state.gen = (state.gen ?? 1) + 1;
  state.genAt = now;
  state.genWhy = "reset";
}

/**
 * Types the glyphs at the exit terminal. Mutates the state and says what happened. One try per
 * shift: a wrong entry locks it, and every second one re-tears the note ("reset").
 */
export function enter(state, input, now = Date.now()) {
  if (state.door) return "already";
  const want = exitCode(state.pieces, state.order ?? [0, 1, 2]);
  if (!Array.isArray(input) || input.length !== want.length || !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)) return "bad";
  if (isLocked(state, now)) return "locked";
  if (input.every((g, i) => g === want[i])) { state.door = true; state.lockedAt = null; return "open"; }
  state.tries = (state.tries ?? 0) + 1;
  state.lockedAt = now;
  state.last = [...input];
  if (state.tries % RETEAR_EVERY === 0) { retear(state, now); return "reset"; }
  return "wrong";
}
/** The shift is over: the next worker gets the terminal back. True when the state changed. */
export function shiftEnded(state) {
  if (state.lockedAt == null) return false;
  state.lockedAt = null;
  return true;
}

/**
 * The offline stand-in for the server rules in src/lab9.ts. Solo play has no archive to hold the
 * overseer's practice tape, so the solo order is the plain reading order (solo runs are tier 1).
 */
export const local = {
  newState: (tier = 1) => ({ pieces: tornNote(tier), order: [0, 1, 2], door: false, tries: 0, lockedAt: null, last: null, gen: 1, genAt: Date.now(), genWhy: "open" }),
  publicWorld(world, state) {
    const w = {
      ...ensure(world), pieces: state.pieces, door: state.door, tries: state.tries, locked: isLocked(state), lockedAt: state.lockedAt ?? null, last: state.last ?? null,
      gen: state.gen ?? 1, genAt: state.genAt ?? 0, genWhy: state.genWhy ?? "open",
    };
    delete w.order;
    if (!w.door) w.out = false; // nobody leaves through a shut door
    return w;
  },
  canClear: (state, world) => state.door && world.out === true,
  enter,
  shiftEnded,
};

/** The keypad (client.js): as many glyphs as the note has, one try per shift. */
export const padLength = (world) => code(world).length || 3;
export const padTries = (world) => (world && locked(world) ? t("0회 · 이번 근무 잠김") : t("1회 · 틀리면 이번 근무 동안 잠김"));

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
  return false; // open, and the fake wall
}

const self = { tileAt, solidAt, doorOpen };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export function nearTerminal(p) {
  return E.near(p, TERMINAL);
}

/** Whether this worker, standing where they are, can read piece i of the note. */
export function readsPiece(p, character, i) {
  const piece = PIECES[i];
  if (!piece || !p.ground) return false; // you read it standing in front of it, not in mid-air
  const dx = Math.abs(p.x - piece.x);
  if (piece.from === "floor") return dx < 40 && Math.abs(p.y - 20 * T) < 2;
  if (piece.from === "ledge") return dx < 30 && Math.abs(p.y - 16 * T) < 2;
  if (piece.from === "light") return character === "light" && dx < 40 && Math.abs(p.y - 20 * T) < 2;
  return false;
}

export function hint(world, p, character, now) {
  if (nearTerminal(p) && !world.door && locked(world, now)) return t("출구 단말기 잠김 · 다음 근무에 풀림");
  if (nearTerminal(p) && !world.door) return character === "key" ? t("E: 출구 단말기") : t("출입 카드 필요");
  if (world.door && p.x > 36 * T) return t("→ 퇴근");
  return "";
}

/** The use key. api: { world, p, character, say, openPad } */
export function use(api) {
  const { world, p, character } = api;
  if (!nearTerminal(p)) return;
  if (world.door) return api.say(t("문은 열려 있습니다."));
  if (character !== "key") return api.say(t("출구 단말기는 출입 카드로만 조작할 수 있습니다."));
  if (locked(world, api.now)) return api.say(t("출구 단말기는 이번 근무 동안 잠겨 있습니다. 다음 근무자에게 넘기십시오."));
  api.openPad();
}

/** Every frame while working: walking out through the open door ends the building. */
export function tick(api) {
  if (api.world.door && !api.world.out && api.p.x >= OUT_X) api.leave();
}

/**
 * The last employee, years ago, as the echo recorder sees it: from the entrance, through the
 * fake wall, to the exit terminal, out of the door. A 12-second loop, the same on every screen.
 */
const GHOST = [[0, 2 * T + 8], [3600, 30 * T], [4600, 34 * T], [5200, TERMINAL.x], [6800, TERMINAL.x], [7600, 39 * T + 6], [12000, 39 * T + 6]];
export function ghostAt(now) {
  const t = ((now % 12000) + 12000) % 12000;
  let i = 0;
  while (i < GHOST.length - 2 && GHOST[i + 1][0] <= t) i++;
  const [t0, x0] = GHOST[i], [t1, x1] = GHOST[i + 1];
  const k = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 0;
  return { x: x0 + (x1 - x0) * k, y: 20 * T, face: x1 >= x0 ? 1 : -1, character: "echo" };
}

/** What the overseer says about a change, or null. */
export function narrate(prev, next) {
  if (next.out && !prev.out) return t("인수인계를 완료했습니다. 이제 퇴근하셔도 됩니다.");
  if (next.door && !prev.door) return t("출구가 열렸습니다. 그 그림은 처음부터 이 문을 가리키고 있었습니다.");
  // the room opens (or someone walks in): the overseer asks about the marks and points at lab 1's record
  if (!(prev.pieces ?? []).length && (next.pieces ?? []).length) return t("이 표시의 의미를 아는 근무자가 있습니까? 실험실 1 기록에 보존 표시를 해 두었습니다.");
  if ((next.gen ?? 1) > (prev.gen ?? 1)) return t("틀렸습니다. 오답이 두 번 쌓여 쪽지 조각을 새것으로 바꿔 걸었습니다. 이전 조각을 옮겨 그린 쪽지는 이제 틀립니다. 단말기는 이번 근무 동안 잠깁니다.");
  if ((next.tries ?? 0) > (prev.tries ?? 0)) return t("틀렸습니다. 이번 근무 동안 출구 단말기를 잠급니다. 저도 그 그림을 오래 보았습니다. 아직 모르겠습니다.");
  return null;
}

/** True when this equipment cannot move the lab forward from here. */
export function useless(world, character) {
  const n = (world.pieces ?? []).length;
  if (world.door) return false; // anyone can walk out
  return (character === "tall" && n < 2) || (character === "light" && n < 3) || !characters.includes(character);
}

export function mood(prev, next) {
  if ((next.tries ?? 0) > (prev.tries ?? 0)) return "Charging";
  if ((next.door && !prev.door) || (next.out && !prev.out)) return "BackFlip";
  return null;
}

// ---------- drawing ----------

/** The room in 2D (no WebGL). */
export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

export function drawBase(ctx, { world, actor, echo }) {
  E.drawTiles(ctx, self, world, actor);
  E.drawActor2D(ctx, echo, 0.45); // the last employee's ghost (echo recorder only, client.js)
  ctx.fillStyle = "#39404e"; ctx.fillRect(TERMINAL.x - 7, TERMINAL.y - 22, 14, 22);
  ctx.fillStyle = world.door ? "#5bd67a" : world.locked ? "#e06060" : "#e0b83a";
  ctx.fillRect(TERMINAL.x - 5, TERMINAL.y - 19, 10, 6);
  E.drawActor2D(ctx, actor);
}

/** The alcove's darkness, with a hole where the light worker stands. */
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
 * On top of the room: the note's pieces, then the darkness. Everyone sees that the paper is
 * there; only a worker standing in front of a piece sees what is drawn on it. The CCTV never
 * does: the system cannot read drawings.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  let first = 0; // the flat index of each piece's first glyph: the marks run on across pieces
  (world.pieces ?? []).forEach((glyphs, i) => {
    const piece = PIECES[i];
    const readable = !cctv && actor && readsPiece(actor, actor.character, i);
    drawPiece(ctx, piece, i, glyphs, readable, first);
    first += glyphs.length;
  });
  if (!opts.noDarkness) drawDarkness(ctx, opts);
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

/** One torn piece of the old note: yellowed paper; up close, a child's drawing, its glyphs and their stamp marks. */
function drawPiece(ctx, piece, i, glyphs, readable, first = 0) {
  const { x, y, w, h } = piece, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  ctx.fillStyle = "#d9cfae"; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = "#b9ae8c"; // a torn edge
  for (let k = 0; k < w; k += 3) ctx.fillRect(x0 + k, y0 + h - 1 - (k % 2), 2, 1 + (k % 2));
  ctx.fillStyle = "#8a2f2f"; ctx.fillRect(Math.round(x) - 1, y0 - 1, 3, 3); // pin
  ctx.fillStyle = "#4a4a48"; ctx.font = "7px Galmuri7, sans-serif"; ctx.textAlign = "left";
  ctx.fillText("①②③"[i], x0 + 1, y0 + 7);
  if (!readable) {
    // from afar: scribbles you cannot make out
    ctx.fillStyle = "#4a4a4866";
    for (let k = 0; k < 4; k++) ctx.fillRect(x0 + 6 + k * 5, y0 + 8 + ((k * 7) % 8), 4, 1);
    return;
  }
  if (i === 0) { // the first piece has the picture: a door, and a house beyond it
    ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 19.5, y0 + 2.5, 6, 9); // door
    ctx.beginPath(); ctx.moveTo(x0 + 22.5, y0 + 6); ctx.lineTo(x0 + 27.5, y0 + 6); ctx.stroke(); // arrow
  }
  // each glyph, and under it lab 1's stamp mark: a number on its equipment's colour (lab1.js badge)
  const left = glyphs.length >= 3 ? 8 : 9, markY = y0 + h - 5;
  glyphs.forEach((g, k) => {
    const gx = x0 + left + k * 9, m = markOf(first + k);
    drawGlyph(ctx, g, gx, markY - 9, 6, "#1e1e1c", 1.2);
    ctx.fillStyle = E.EQUIP[MARK_WHO[m]].color; ctx.fillRect(gx - 4, markY - 4, 8, 8);
    ctx.fillStyle = "#14161a"; ctx.font = `8px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(m + 1), gx, markY + 0.5);
  });
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

// ---------- control console (see console.js) ----------

export function schematic({ world }) {
  const n = (world.pieces ?? []).length;
  const terminal = world.door ? [t("해제"), "ok"]
    : locked(world) ? [t("잠김 · 오입력 {n}회", { n: world.tries }), "bad"]
    : world.tries ? [t("오입력 {n}회", { n: world.tries }), "bad"] : [t("입력 대기"), "warn"];
  const map = [
    { kind: "zone", tone: "dark", x0: DARK.x0, y0: DARK.y0, x1: DARK.x1, y1: DARK.y1, label: t("조도 미달") },
    ...PIECES.slice(0, n).map((p, i) => ({ kind: "zone", tone: "blind", x0: p.x - p.w / 2, y0: p.y - p.h / 2, x1: p.x + p.w / 2, y1: p.y + p.h / 2, label: t("미분류 문서 {mark}", { mark: "①②③"[i] }) })),
    { kind: "device", x: TERMINAL.x, y: TERMINAL.y - 14, label: t("출구 단말기"), state: terminal[0], tone: terminal[1], color: E.EQUIP.key.color },
    { kind: "label", x: 38 * T + 8, y: 15 * T - 4, text: world.door ? t("출구 열림") : t("출구 잠김"), color: world.door ? "#5bd67a" : "#e06060" },
    { kind: "label", x: 13 * T + 8, y: 18 * T, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color },
  ];
  return {
    map,
    status: [
      { label: t("미분류 문서"), state: t("판독 불가 {n}건", { n }), tone: "warn" },
      // the system cannot read the drawing, but it knows its own stamp form; it does not know the order
      ...(n ? [{ label: t("미분류 표시"), state: t("실험실 1 결재 도장 ①②③"), tone: "warn" }] : []),
      // public: the note is torn afresh every second wrong entry, and everyone may count
      ...(n && !world.door ? [{ label: t("쪽지 교체"), state: t("{gen}번째 쪽지 · 교체까지 오답 {n}회", { gen: world.gen ?? 1, n: RETEAR_EVERY - ((world.tries ?? 0) % RETEAR_EVERY) }), tone: (world.gen ?? 1) > 1 ? "warn" : "idle" }] : []),
      { label: t("출구 단말기"), state: terminal[0], tone: terminal[1] },
      // what was typed is the terminal's input record: the control desk's sheet only
      ...(world.last ? [{ label: t("마지막 오입력"), state: world.last.map((g) => g + 1).join(" · "), tone: "bad", ctrl: true }] : []),
      { label: t("출구"), state: world.door ? t("열림") : t("잠김"), tone: world.door ? "ok" : "bad" },
      { label: t("퇴근"), state: world.out ? t("완료") : t("대기"), tone: world.out ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { ux, uy } = kit;
  const terminal = kit.terminal(ux(TERMINAL.x), uy(TERMINAL.y));
  kit.lamps([[6, 9.96], [16, 9.96], [27, 9.96], [35.5, 6.96]]);
  const FLOOR = uy(20 * T);
  for (const x of [10.5, 27.5]) kit.column(x, FLOOR, 8);
  kit.vent(4.5, 8.6);
  kit.fan(29.5, 7.2);
  kit.prop("chair", 9.6, FLOOR, { ry: Math.PI / 2 }); // someone once sat and looked at the note
  return {
    update(world) {
      terminal.setColor(world.door ? "#5bd67a" : world.locked || world.tries ? "#e06060" : "#e0b83a");
    },
  };
}
