// Lab 3 "Glyphs": an information handover puzzle.
// The light can see the glyph code, the access card can type it in, and the
// walking aid can climb to the exit lever. Each piece takes one shift.
//
// The catch (depth pass, reports/퍼즐 깊이 설계 리서치.md): a veteran expects the light to copy
// the four glyphs and the card to type them. But ultraviolet ink does not wash off: the wall
// carries two rows, this issue's and the last one's, each marked with a small pip tag, and they
// look exactly alike. Only the terminal knows this issue's tag (it shows it to the card standing
// at it; the control desk sees it as wiring). So a note without the tags is a coin toss, and
// typing last issue's row is a thinking mistake: the terminal locks for the rest of the shift.
// Every new issue (a passed round, three misses) paints over the older row, so the code that
// was just current stays on the wall as the decoy, and a note from before the change still
// matches something on the wall: its tag is what gives it away (「오래됨」, the tape's strip).
// Field path without the desk: the light copies both rows with their tags; the card picks.
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.
//
// Other modules use this file's keypad glyphs (drawGlyph, GLYPH_COUNT, CODE_LENGTH, MAX_TRIES):
// keep those exports as they are.

import * as E from "./engine.js";
import { t } from "./i18n.js";

export * from "./engine.js";
const { T, P, TILE, litBy } = E;
const { SOLID, BRIDGE, DOOR } = TILE;

export const id = 3;
export const name = t("기호");
export const characters = ["key", "tall", "light"];

export const GLYPH_COUNT = 6;
export const CODE_LENGTH = 4;
export const MAX_TRIES = 3; // wrong entries before the wall is painted over
export const PER_SHIFT = 2; // plain wrong entries one shift may make before the terminal locks for it
export const LOCK_MS = 60_000; // fallback when no shift end arrives: a lock never outlives a shift by much
export const TAGS = 6; // pip tags 1..6, like a die: no words, no digits
export const WALL_ROWS = 2; // this issue and the last
/** The wall as the light reads it: [tag, four glyphs] per row, top row first. */
export const WALL_LENGTH = WALL_ROWS * (1 + CODE_LENGTH);

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 15, 3, 19, 0], // entrance
  [4, 1, 13, 19, 0], // dark shaft
  [14, 18, 22, 19, 0], // hall with the terminal
  [24, 3, 38, 19, 0], // high room behind the door
  [23, 16, 23, 19, DOOR],
  // light bridges: solid only while lit, and only from above (you can jump up through them)
  ...[[4, 17], [7, 14], [4, 11], [7, 8], [6, 5]].map(([x, y]) => [x, y, x + 2, y, BRIDGE]),
  [9, 4, 12, 4, SOLID], // ledge under the glyph wall
  [28, 16, 30, 16, SOLID], // ledges only the walking aid can climb
  [33, 12, 35, 12, SOLID],
  [37, 8, 38, 8, SOLID],
]);

// the shaft above the walkway; the walkway itself (rows 18-19) stays lit so everyone can cross it
export const DARK = { x0: 4 * T, y0: 1 * T, x1: 14 * T, y1: 18 * T };
export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const TERMINAL = { x: 18 * T + 8, y: 20 * T };
export const LEVER = { x: 38 * T + 8, y: 8 * T };
// two rows of four glyphs, each with a pip tag at its left (tagX: the tag's centre)
export const GLYPH_WALL = { x: 9 * T + 4, y: 1 * T + 10, gap: 18, size: 12, top: 4 * T, rowGap: 20, tagX: 9 * T - 4 };
export const sign = { text: "LAB 03", x: 29.5, y: E.ROWS - 6.5 };

// Traps (engine.js). The hall laser is the first trap anyone meets: in the open, on the CCTV,
// and well away from the entrance. The second guards the last jump in the high room.
export const traps = [
  { kind: "laser", x0: 263, y0: 18 * T, x1: 266, y1: 20 * T, on: 1400, off: 1600, phase: 0 },
  { kind: "laser", x0: 584, y0: 6 * T + 4, x1: 587, y1: 11 * T, on: 1200, off: 2000, phase: 700 },
  // hidden, one tile each: knowing where it is is enough (hop over it, or land past it)
  // on the walkway everyone crosses, and on the high room's floor just past the door
  { kind: "plate", x0: 12 * T, x1: 13 * T, y: 20 * T, hidden: true },
  { kind: "plate", x0: 26 * T, x1: 27 * T, y: 20 * T, hidden: true },
];

// ---------- world (shared, persisted between shifts) ----------

const pick = (n, rand) => Math.min(n - 1, Math.floor(rand() * n));

export function randomCode(rand = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => pick(GLYPH_COUNT, rand));
}

/** One row of a wall: { tag, glyphs }. */
export function wallRow(wall, row) {
  const at = row * (1 + CODE_LENGTH);
  return { tag: wall[at], glyphs: wall.slice(at + 1, at + 1 + CODE_LENGTH) };
}
/** The rows of a wall as the light read it. An older server sent the bare code: one row, no tag. */
export function wallRows(wall) {
  if (!Array.isArray(wall)) return [];
  if (wall.length === CODE_LENGTH) return [{ tag: 0, glyphs: [...wall] }];
  return Array.from({ length: WALL_ROWS }, (_, r) => wallRow(wall, r));
}
/** The code a wall gives for an issue tag (the terminal's): that row's glyphs, or null. */
export function codeFrom(wall, issue) {
  const row = wallRows(wall).find((r) => r.tag === issue);
  return row ? row.glyphs : null;
}

/** The secret state's code: the current row's glyphs. Its tag is the issue the terminal shows. */
export const answer = (state) => wallRow(state.code, state.row).glyphs;
export const issueOf = (state) => wallRow(state.code, state.row).tag;
/** The decoy: last issue's row, still on the wall. */
export const staleCode = (state) => wallRow(state.code, 1 - state.row).glyphs;

/**
 * A new issue paints over the older row: four new glyphs (never the same as the row it keeps)
 * and a new tag (never the kept row's, nor the one it paints over, so a note from either of the
 * last two issues cannot pass for this one).
 */
function issue(state, why, rand = Math.random) {
  const keep = state.row;
  const into = 1 - keep;
  const kept = wallRow(state.code, keep);
  const old = state.code[into * (1 + CODE_LENGTH)];
  const tags = Array.from({ length: TAGS }, (_, i) => i + 1).filter((g) => g !== kept.tag && g !== old);
  let glyphs = randomCode(rand);
  while (glyphs.join() === kept.glyphs.join()) glyphs = randomCode(rand);
  state.code.splice(into * (1 + CODE_LENGTH), 1 + CODE_LENGTH, tags[pick(tags.length, rand)], ...glyphs);
  state.row = into;
  state.genAt = Date.now();
  state.genWhy = why;
  state.tries = 0;
  state.seen = false;
}

/** A wall as the room opens: last issue's row (from before the opening) and this issue's, top or bottom at random. */
function paintFresh(state, rand) {
  state.row = pick(WALL_ROWS, rand); // the old row; issue() paints the other one
  state.code = Array(WALL_LENGTH).fill(0);
  state.code.splice(state.row * (1 + CODE_LENGTH), 1 + CODE_LENGTH, 1 + pick(TAGS, rand), ...randomCode(rand));
  issue(state, "open", rand);
}

/**
 * The shared world. It never holds the wall: the server keeps that and tells only the light
 * worker at the wall (see src/lab3.ts). issue (this issue's tag) and row ride along like the
 * other rooms' wiring: the terminal shows the tag to the card, the console to the control desk.
 */
export function fresh() {
  return { lab: 3, gen: 1, genAt: 0, genWhy: "open", tries: 0, seen: false, door: false, lever: false, passes: 0, needed: 1, issue: 0, row: 0, locked: false, stale: 0 };
}

/** The secret half, held by the server (or by the offline stand-in). tier: verification rounds (1-3). */
export function freshSecret(rand = Math.random, tier = 1) {
  const state = { gen: 1, genAt: 0, genWhy: "open", tries: 0, seen: false, door: false, passes: 0, needed: Math.max(1, Math.min(3, tier)), shiftWrong: 0, wrongAt: 0, stale: 0 };
  paintFresh(state, rand);
  return state;
}

/** A state saved by an older build (one bare row) gets a fresh wall. */
export function fix(state) {
  if (!Array.isArray(state.code) || state.code.length !== WALL_LENGTH || (state.row !== 0 && state.row !== 1)) {
    state.gen = (state.gen ?? 0) + 1;
    paintFresh(state, Math.random);
  }
  state.shiftWrong ??= 0;
  state.wrongAt ??= 0;
  state.stale ??= 0;
  return state;
}

/** Accepts anything the server hands back and returns a valid lab 3 world. */
export function ensure(world) {
  return world && world.lab === 3 ? world : fresh();
}

export const locked = (state, now = Date.now()) => (state.shiftWrong ?? 0) >= PER_SHIFT && now - (state.wrongAt ?? 0) < LOCK_MS;

/**
 * The fields of a secret state that everyone may see. gen / genAt / genWhy say when the glyphs last
 * changed and why ("open", "pass", "reset"): the tape's event strip marks it, and a note older
 * than genAt is provably stale. Never a glyph.
 */
export function publicFields(secret, now = Date.now()) {
  fix(secret);
  return {
    gen: secret.gen, genAt: secret.genAt ?? 0, genWhy: secret.genWhy ?? "open", tries: secret.tries, seen: secret.seen, door: secret.door,
    passes: secret.passes ?? 0, needed: secret.needed ?? 1, issue: issueOf(secret), row: secret.row, locked: !secret.door && locked(secret, now), stale: secret.stale ?? 0,
  };
}

export function progress(world) {
  return (world.passes ?? 0) * 2 + (world.seen ? 1 : 0) + (world.door ? 1 : 0) + (world.lever ? 1 : 0);
}

/**
 * Types a code at the terminal. Mutates a secret state and says what happened:
 * "open" | "pass" (one verification round; the older row is painted over) | "wrong" |
 * "stale" (last issue's row: a thinking mistake, the terminal locks for the shift) |
 * "reset" (the third miss paints over the older row) | "locked" | "already" | "bad".
 */
export function enterCode(world, input, rand = Math.random, now = Date.now()) {
  fix(world);
  if (world.door) return "already";
  if (!Array.isArray(input) || input.length !== CODE_LENGTH || !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)) return "bad";
  if (world.shiftWrong && now - world.wrongAt >= LOCK_MS) world.shiftWrong = 0;
  if (locked(world, now)) return "locked";
  const same = (code) => input.every((g, i) => g === code[i]);
  if (same(answer(world))) {
    world.tries = 0;
    world.passes = (world.passes ?? 0) + 1;
    if (world.passes >= (world.needed ?? 1)) {
      world.door = true;
      return "open";
    }
    // one round verified: fresh glyphs for the next round, over the older row (same rule as src/lab3.ts)
    world.gen++;
    issue(world, "pass", rand);
    return "pass";
  }
  const stale = same(staleCode(world));
  world.tries++;
  world.wrongAt = now;
  if (stale) {
    world.stale = (world.stale ?? 0) + 1;
    world.shiftWrong = PER_SHIFT; // a note from the wrong issue is not a typo: the shift is spent
  } else world.shiftWrong++;
  if (world.tries >= MAX_TRIES) {
    world.gen++;
    issue(world, "reset", rand); // the older row is painted over: every note about this issue is now last issue's
    return "reset";
  }
  return stale ? "stale" : "wrong";
}

/** A shift ended: the next card worker gets the terminal back. True when the state changed. */
export function shiftEnded(state) {
  if (!state.shiftWrong) return false;
  state.shiftWrong = 0;
  return true;
}

/** The glyph wall (lab.read): only the light sees it, both rows with their tags. */
export function read(state, character) {
  if (character !== "light") return null;
  fix(state);
  state.seen = true;
  return { gen: state.gen, code: [...state.code] };
}

/** The offline stand-in for the server rules in src/lab3.ts. */
export const local = {
  newState: (tier = 1) => freshSecret(Math.random, tier),
  publicWorld(world, secret, now = Date.now()) {
    const w = { ...ensure(world), ...publicFields(secret, now) };
    delete w.code; delete w.shiftWrong; delete w.wrongAt;
    if (!w.door) w.lever = false;
    return w;
  },
  canClear: (secret, world) => secret.door && world.lever === true,
  enter: (secret, input) => enterCode(secret, input), // the terminal (client.js lab.enter)
  read, // the glyph wall (client.js lab.read)
  shiftEnded,
};

// ---------- player (local to one shift) ----------

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
}

export function doorOpen(world) {
  return !!world.door;
}

/**
 * feet: when given, the move is downward from that height and bridges whose top is at or
 * below it count as floor. Otherwise bridges are not solid (one-way platforms).
 */
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

export function nearTerminal(p) {
  return E.near(p, TERMINAL);
}
export function nearLever(p) {
  return E.near(p, LEVER);
}
/** The light reads the wall once it stands on the ledge below it. */
export function readsGlyphs(p, character) {
  return character === "light" && Math.abs(p.y - GLYPH_WALL.top) < 2 && p.x > 9 * T && p.x < 13 * T;
}
/** The card standing at the terminal reads this issue's tag on its screen. Nobody else does. */
export function readsIssue(p, character) {
  return character === "key" && nearTerminal(p);
}

export function hint(world, p, character) {
  if (nearTerminal(p) && !world.door) return world.locked ? t("단말기 잠김") : character === "key" ? t("E: 단말기") : t("출입 카드 필요");
  if (nearLever(p) && !world.lever) return t("E: 레버");
  return "";
}

/** The keypad (client.js): tries left, or that this shift is spent. Only the card at the terminal sees it. */
export const padTries = (world) => (world.locked ? t("0회 · 이번 근무 잠김") : t("{n}회", { n: MAX_TRIES - (world.tries ?? 0) }));

/** The use key. api: { world, p, character, say, openPad, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  if (nearTerminal(p)) {
    if (world.door) return api.say(t("문은 이미 열려 있습니다."));
    if (character !== "key") return api.say(t("단말기는 출입 카드로만 조작할 수 있습니다. 기록하겠습니다."));
    if (world.locked) return api.say(t("이번 근무에는 더 입력할 수 없습니다. 다음 근무자에게 넘기십시오."));
    return api.openPad();
  }
  if (nearLever(p) && !world.lever) api.pullLever();
}

/** Every frame while working: the light asks the server for the wall once per issue. */
export function tick(api) {
  const { world, p, character } = api;
  const known = api.secret && api.secret.gen === world.gen;
  if (!known && api.reading !== world.gen && readsGlyphs(p, character)) {
    api.setReading(world.gen);
    api.send({ t: "lab.read" });
  }
}

/** What the overseer says about a change, or null. */
export function narrate(prev, next) {
  if ((next.passes ?? 0) > (prev.passes ?? 0) && !next.door) {
    return t("검증 {done}/{need} 통과. 인력이 충원되어 검증을 한 번 더 합니다. 새 기호가 표시됩니다.", { done: next.passes, need: next.needed });
  }
  if (next.gen > prev.gen) return t("입력 3회 실패. 오래된 줄 위에 새 기호를 덧칠했습니다. 방금까지의 기호는 이제 지난 발급분입니다.");
  if ((next.stale ?? 0) > (prev.stale ?? 0)) return t("입력한 기호는 지난 발급분입니다. 벽에 남아 있었을 뿐입니다. 이번 근무의 단말기를 잠급니다.");
  if (next.locked && !prev.locked) return t("이번 근무의 단말기 입력이 잠겼습니다. 틀린 추측은 근무 하나의 비용입니다.");
  if (next.tries > prev.tries) return t("입력이 틀렸습니다. 남은 시도 {n}회.", { n: MAX_TRIES - next.tries });
  if (next.door && !prev.door) return t("문이 열렸습니다. 입력한 근무자는 기호를 본 적이 없습니다. 흥미롭군요.");
  if (next.seen && !prev.seen) return t("기호가 확인되었습니다. 다음 근무자에게 전달될지는 모르겠습니다.");
  if (next.lever && !prev.lever) return t("실험실 3 종료. 결과를 기록합니다.");
  return null;
}

/** True when this equipment cannot move the lab forward from here. */
export function useless(world, character) {
  return (character === "light" && (world.seen || world.door)) || (character === "key" && world.door) ||
    (character === "tall" && !world.door) || !characters.includes(character);
}

/** Which overseer animation a change deserves. */
export function mood(prev, next) {
  if ((next.passes ?? 0) > (prev.passes ?? 0)) return "BackFlip";
  if (next.gen > prev.gen) return "Attack";
  if (next.tries > prev.tries || (next.locked && !prev.locked)) return "Charging";
  if ((next.door && !prev.door) || (next.lever && !prev.lever)) return "BackFlip";
  return null;
}

// ---------- drawing ----------

/** Draws one of the six glyphs centred on (cx, cy). */
export function drawGlyph(ctx, id, cx, cy, size, color, width = 2) {
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (id) {
    case 0: ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); break; // circle
    case 1: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath(); break; // triangle
    case 2: ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); break; // square
    case 3: ctx.moveTo(cx - r * 0.8, cy - r * 0.8); ctx.lineTo(cx + r * 0.8, cy + r * 0.8); ctx.moveTo(cx + r * 0.8, cy - r * 0.8); ctx.lineTo(cx - r * 0.8, cy + r * 0.8); break; // cross
    case 4: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); break; // diamond
    case 5: ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); break; // plus
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * An issue tag: a small square with 1-6 pips laid out like a die. No digits, so it reads the
 * same in every language and is easy to copy onto a note. The wall and the terminal draw it the
 * same way, so the two are seen to belong together.
 */
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export function drawTag(ctx, n, cx, cy, size, color) {
  const h = size / 2, step = size * 0.26, dot = Math.max(1.1, size * 0.1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(cx - h) + 0.5, Math.round(cy - h) + 0.5, Math.round(size) - 1, Math.round(size) - 1);
  for (const [dx, dy] of PIPS[n] ?? []) {
    ctx.beginPath();
    ctx.arc(cx + dx * step, cy + dy * step, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws the whole room in 2D. Used when WebGL is not available.
 * opts: { world, actor: {x, y, face, character, nick} | null, cctv: bool, code: number[] | null, time }
 * code (the wall) is only known to the light worker who has read it. CCTV never shows it.
 */
export function draw(ctx, opts) {
  drawBase(ctx, opts);
  drawOverlay(ctx, opts);
}

/** The room, its devices and the actor: everything the 3D renderer replaces. */
export function drawBase(ctx, { world, actor }) {
  E.drawTiles(ctx, self, world, actor);
  ctx.fillStyle = "#39404e"; ctx.fillRect(TERMINAL.x - 7, TERMINAL.y - 22, 14, 22);
  ctx.fillStyle = world.door ? "#5bd67a" : world.tries || world.locked ? "#e06060" : "#e0b83a";
  ctx.fillRect(TERMINAL.x - 5, TERMINAL.y - 19, 10, 6);
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/**
 * The darkness over the shaft, with a soft hole where the light worker stands.
 * Draws with ctx's current transform, so it can go onto a low-resolution buffer too.
 */
export function drawDarkness(ctx, { actor, time = 0 }) {
  const dark = "rgba(4,5,8,0.96)";
  ctx.save();
  ctx.beginPath();
  ctx.rect(DARK.x0, DARK.y0, DARK.x1 - DARK.x0, DARK.y1 - DARK.y0);
  ctx.clip();
  if (actor?.character !== "light") {
    ctx.fillStyle = dark;
    ctx.fillRect(DARK.x0, DARK.y0, DARK.x1 - DARK.x0, DARK.y1 - DARK.y0);
    ctx.restore();
    return;
  }
  const { x, y } = E.center(actor);
  const r = E.LIGHT_R + Math.sin(time * 9) * 1.5;
  // everything outside the circle: fully dark
  ctx.beginPath();
  ctx.rect(DARK.x0, DARK.y0, DARK.x1 - DARK.x0, DARK.y1 - DARK.y0);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill("evenodd");
  // inside: clear in the middle, fading back to dark at the edge
  const grad = ctx.createRadialGradient(x, y, 8, x, y, r);
  grad.addColorStop(0, "rgba(4,5,8,0)");
  grad.addColorStop(0.7, "rgba(4,5,8,0.14)");
  grad.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

const UV_INK = "#d6a8ff";
/** Where row r of the wall sits (its glyphs' centre line). */
export const rowY = (r) => GLYPH_WALL.y + r * GLYPH_WALL.rowGap;

/**
 * What sits on top of the room in both 2D and 3D: the darkness (unless noDarkness),
 * the ultraviolet wall (light worker only, never on CCTV), the terminal's screen (the card
 * standing at it only, never on CCTV) and the name tag. Both rows of the wall are drawn the
 * same way: nothing in the light's view says which one is this issue's.
 */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv, code = null } = opts;
  if (!opts.noDarkness) drawDarkness(ctx, opts);

  if (!cctv && code && actor?.character === "light") {
    const lit = (x, y) => Math.hypot(x - actor.x, y - (actor.y - P.h / 2)) < E.LIGHT_R;
    wallRows(code).forEach(({ tag, glyphs }, r) => {
      const y = rowY(r);
      if (tag && lit(GLYPH_WALL.tagX, y)) drawTag(ctx, tag, GLYPH_WALL.tagX, y, 11, UV_INK);
      glyphs.forEach((g, i) => {
        const gx = GLYPH_WALL.x + i * GLYPH_WALL.gap + GLYPH_WALL.size / 2;
        if (lit(gx, y)) drawGlyph(ctx, g, gx, y, GLYPH_WALL.size, UV_INK, 2);
      });
    });
  }

  // the terminal's screen: this issue's tag, for the card standing at it
  if (!cctv && actor && readsIssue(actor, actor.character) && !world?.door && world?.issue) {
    const x = TERMINAL.x, y = TERMINAL.y - 36;
    ctx.save();
    ctx.fillStyle = "#14171d"; ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.restore();
    drawTag(ctx, world.issue, x, y, 14, UV_INK);
  }

  if (actor?.nick && cctv) E.drawNameTag(ctx, actor); // the worker knows who they are; the label is for the cameras
}

// ---------- control console (see console.js) ----------

/**
 * What the system knows about this room. The glyphs themselves are never on it. Public: that
 * the wall has two rows (eight glyphs, unreadable), how often it was issued, the terminal's
 * state. Wiring (ctrl, the control desk only): which row the terminal checks and that row's tag.
 */
export function schematic({ world }) {
  const doorX = 23 * T + 8;
  const tries = world.tries ?? 0;
  const terminal = world.door ? [t("해제"), "ok"] : world.locked ? [t("이번 근무 잠김"), "bad"] : tries ? [t("실패 {n}/{max}", { n: tries, max: MAX_TRIES }), "bad"] : [t("입력 대기"), "warn"];
  const glyphEnd = GLYPH_WALL.x + CODE_LENGTH * GLYPH_WALL.gap;
  const row = world.row === 1 ? 1 : 0;
  const live = !world.door && world.issue;
  return {
    map: [
      { kind: "zone", tone: "dark", x0: DARK.x0, y0: DARK.y0, x1: DARK.x1, y1: DARK.y1, label: t("조도 미달") },
      { kind: "zone", tone: "blind", x0: GLYPH_WALL.tagX - 7, y0: rowY(0) - 10, x1: glyphEnd, y1: rowY(WALL_ROWS - 1) + 9, label: t("판독 불가 {n}건", { n: WALL_ROWS * CODE_LENGTH }) },
      { kind: "wire", on: !!world.door, pts: [TERMINAL.x, TERMINAL.y - 22, TERMINAL.x, 15 * T, doorX, 15 * T, doorX, 16 * T] },
      // the terminal checks one row of the wall: this is the wiring the desk alone may see
      ...(live ? [
        { kind: "wire", ctrl: true, on: false, pts: [TERMINAL.x, TERMINAL.y - 22, TERMINAL.x, 15 * T + 8, 15 * T, 15 * T + 8, 15 * T, rowY(row), glyphEnd, rowY(row)] },
        { kind: "label", ctrl: true, x: 15 * T + 2, y: rowY(row) - 8, text: row ? t("검사: 아래 줄") : t("검사: 위 줄"), color: E.EQUIP.key.color },
      ] : []),
      { kind: "device", x: TERMINAL.x, y: TERMINAL.y - 14, label: t("단말기"), state: terminal[0], tone: terminal[1], color: E.EQUIP.key.color },
      { kind: "label", x: doorX, y: 15 * T - 4, text: world.door ? t("문 D 열림") : t("문 D 잠김"), color: world.door ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      { kind: "label", x: 31 * T, y: 18 * T, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color },
    ],
    status: [
      { label: t("자외선 표시"), state: t("판독 불가 · {n}줄", { n: WALL_ROWS }), tone: "warn" },
      // how many times the glyphs have been issued: a note written before the last issue is stale
      { label: t("기호 발급"), state: t("{n}차", { n: world.gen ?? 1 }), tone: "idle" },
      // this issue's tag (pips on the wall) and the row the terminal checks: wiring, desk only
      ...(live ? [{ label: t("검사 줄"), state: t("점 {n}개 · {row}", { n: world.issue, row: row ? t("아래 줄") : t("위 줄") }), tone: "idle", ctrl: true }] : []),
      ...((world.needed ?? 1) > 1 ? [{ label: t("검증"), state: t("{done}/{need}회", { done: world.passes ?? 0, need: world.needed }), tone: world.door ? "ok" : "idle", bar: (world.passes ?? 0) / world.needed }] : []),
      { label: t("단말기"), state: terminal[0], tone: terminal[1] },
      { label: t("문 D"), state: world.door ? t("열림") : t("잠김"), tone: world.door ? "ok" : "bad" },
      { label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" },
    ],
  };
}

// ---------- 3D (see render3d.js for the kit) ----------

export function build3d(kit) {
  const { THREE, add, ux, uy } = kit;
  const terminal = kit.terminal(ux(TERMINAL.x), uy(TERMINAL.y));
  const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
  kit.lamps([[18, 3.96], [28, 18.96], [34, 18.96], [2, 6.96]]);
  const FLOOR = uy(20 * T);
  // the desk around the terminal: just enough to say "someone works here"
  kit.prop("computer-wide", 15.4, FLOOR);
  kit.prop("chair", 16.7, FLOOR, { ry: Math.PI });
  kit.prop("computer-system", 20.6, FLOOR);
  kit.rails([[28, 30, 16], [33, 35, 12], [37, 38, 8]]);
  // the high room: a wall fan and vents so the climb has something to look at
  kit.fan(26, 10);
  kit.vent(32, 17.6);
  kit.vent(36.5, 4.2);
  void THREE; void add;
  return {
    update(world, _actor, dt) {
      terminal.setColor(world.door ? "#5bd67a" : world.tries || world.locked ? "#e06060" : "#e0b83a");
      lever.update(world.lever, dt);
    },
  };
}
