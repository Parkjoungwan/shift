// Lab 5 "Signature" (서명): a trust handover puzzle, and where the phase shifter is introduced.
// docs/level-design.md, docs/campaign.md.
//
// The room is always in one phase, blue or red (random when the lab opens). A blue bridge
// spans an electrified trench (the shock floor: always live, harmless while the bridge is
// there); red steps climb from the middle hall to door D; behind it, 4-tile shelves to the
// lever. The card signs at the terminal to open door D (more staff: more signatures, one per
// card shift). The walking aid needs both colours solid at once, and only the phase shifter
// can arrange that: two switches a shift, and one anchor that holds a colour solid in any
// phase. How the phase shifter leaves the room is the message to the next worker.
// The trust part (reports/퍼즐 깊이 설계 리서치.md S4): after every shift the overseer rewrites a
// forged directive by the entrance, on the same paper as a controller's. It is signed with the
// number of a real shift from this opening of the room, one that was NOT on the control desk
// (a phase shifter, a card, a walking aid, a light): the shift log and that shift's tape show its
// equipment, so the signature is provably false. And a third of the time the forgery tells the
// truth, so "it contradicts the lamp" is no rule either. The rule is "a signature you can find
// in the log as a control shift". Only before anyone has acted here is it left unsigned.
// The room's true phase is a true value: on the console it is ctrl (the control desk's); the
// field sees the blocks and the lamp, and everyone else sees them on the tape.
// Pure logic plus canvas drawing; no DOM access, so it can run under Node for tests.

import * as E from "./engine.js";
import { ALL_WORDS, TEMPLATES } from "./directives.js";
import { t, FONT_FALLBACK } from "./i18n.js";

export * from "./engine.js";
const { T, TILE, PHASE_COLOR, PHASE_NAME, phaseSolid } = E;
const { SOLID, DOOR, BLUE, RED } = TILE;

export const id = 5;
export const name = t("서명");
export const characters = ["phase", "key", "tall", "light"];
export const SWITCHES_PER_SHIFT = 2;

// ---------- map ----------

export const tileAt = E.makeGrid([
  [1, 16, 5, 19, 0], // entrance
  [6, 16, 17, 20, 0], // the trench...
  [6, 20, 17, 20, BLUE], // ...and the blue bridge over it
  [18, 12, 33, 19, 0], // the middle hall
  [24, 17, 25, 17, RED], // red steps up to the ledge
  [26, 14, 27, 14, RED],
  [22, 8, 33, 11, 0], // headroom over the steps, and the landing in front of door D
  [28, 11, 33, 11, SOLID], // the ledge
  [34, 8, 34, 10, DOOR], // door D
  [35, 1, 38, 10, 0], // the lever room
  [35, 7, 36, 7, SOLID], // 4-tile shelves (walking aid)
  [37, 3, 38, 3, SOLID],
]);

export const SPAWN = { x: 2 * T + 8, y: 20 * T };
export const TERMINAL = { x: 30 * T + 8, y: 20 * T }; // the card signs here: door D
export const LEVER = { x: 37 * T + 8, y: 3 * T };
/** Anchor sockets: the anchor planted in one holds that colour solid in any phase. */
export const SOCKETS = { blue: { x: 19 * T + 8, y: 20 * T }, red: { x: 22 * T + 8, y: 20 * T } };
export const sign = { text: "LAB 05", x: 21.5, y: E.ROWS - 4.5 };

// The trench floor is live. The bridge is the only thing between it and you.
export const traps = [
  { kind: "shock", x0: 6 * T, x1: 18 * T, y: 21 * T },
];

// ---------- world ----------

export function fresh() {
  return { lab: 5, phase: "blue", anchor: null, signs: 0, needed: 1, door: false, lever: false, used: { logId: 0, n: 0 } };
}
export function ensure(world) {
  return world && world.lab === 5 ? world : fresh();
}
export function progress(world) {
  return (world.anchor ? 1 : 0) + (world.signs ?? 0) + (world.lever ? 1 : 0);
}
export const bridgeUp = (world) => phaseSolid(world, BLUE);
export const stepsUp = (world) => phaseSolid(world, RED);
/** Switches left to this shift (logId) of the phase shifter. */
export const switchesLeft = (world, logId) => SWITCHES_PER_SHIFT - (world.used?.logId === logId ? world.used.n : 0);

// ---------- rules (the offline stand-in for src/lab5.ts; same logic) ----------

export function newState(tier = 1, rand = Math.random) {
  return { phase: rand() < 0.5 ? "blue" : "red", anchor: null, signs: [], needed: Math.max(1, Math.min(3, tier)), used: { logId: 0, n: 0 }, seen: [] };
}
const doorOf = (s) => s.signs.length >= s.needed;

/** How many acting shifts the overseer remembers, to sign its forgeries with. */
export const SEEN_MAX = 6;
/** A shift that did something here: its number and equipment are in the log and on its tape. */
function remember(state, logId, character) {
  if (!(logId > 0) || character === "control") return;
  const seen = (state.seen ?? []).filter((s) => s.logId !== logId);
  seen.push({ logId, character });
  state.seen = seen.slice(-SEEN_MAX);
}

export function act(state, character, what, logId = 0) {
  const result = act0(state, character, what, logId);
  if (result !== "bad") remember(state, logId, character);
  return result;
}
function act0(state, character, what, logId) {
  if (what === "switch") {
    if (character !== "phase") return "bad";
    if (state.used.logId !== logId) state.used = { logId, n: 0 };
    if (state.used.n >= SWITCHES_PER_SHIFT) return "limit";
    state.used.n++;
    state.phase = state.phase === "blue" ? "red" : "blue";
    return "switched";
  }
  if (what === "anchor:blue" || what === "anchor:red") {
    if (character !== "phase") return "bad";
    const c = what === "anchor:blue" ? "blue" : "red";
    if (state.anchor === c) { state.anchor = null; return "released"; }
    state.anchor = c;
    return "anchored";
  }
  if (what === "sign") {
    if (character !== "key") return "bad";
    if (doorOf(state) || state.signs.includes(logId)) return "already";
    state.signs.push(logId);
    return doorOf(state) ? "open" : "signed";
  }
  return "bad";
}

export function retier(state, tier) {
  if (doorOf(state)) return false;
  state.needed = Math.max(1, Math.min(3, tier));
  return true;
}

export function publicWorld(world, state) {
  const w = { ...ensure(world), lab: 5, phase: state.phase, anchor: state.anchor, signs: state.signs.length, needed: state.needed, door: doorOf(state), used: { ...state.used } };
  w.lever = doorOf(state) && w.lever === true;
  return w;
}
export const canClear = (state, world) => doorOf(state) && world.lever === true;

// ---------- the overseer's forgery (S4; same as src/lab5.ts) ----------

export const FORGE_AT = { x: 4 * T + 8, y: 20 * T };
/** How often a forgery tells the truth. */
export const FORGE_TRUTH = 1 / 3;
const PHASE_WORD = { blue: "청 위상", red: "적 위상" };
export const EQUIP_WORD = { phase: "위상 이동기", key: "출입 카드", tall: "보행 보조 장치", light: "조명" };
const phrase = (template, word) => [TEMPLATES.indexOf(template), ALL_WORDS.indexOf(word)];
const pick = (list, rand) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** The equipment the room needs next: the phase shifter readies a colour, the card signs, the walking aid climbs. */
export function neededNext(state) {
  const bridge = state.phase === "blue" || state.anchor === "blue";
  const steps = state.phase === "red" || state.anchor === "red";
  if (!doorOf(state)) return bridge ? "key" : "phase";
  return bridge && steps ? "tall" : "phase";
}
/** Equipment that cannot move the room forward now: what a lying forgery sends the next worker with. */
export function wastedNow(state) {
  const need = neededNext(state);
  if (!doorOf(state)) return ["tall", "light"];
  return need === "tall" ? ["phase", "light"] : ["light"];
}
/**
 * The numbers a forgery may sign with: shifts of this opening that were not on the control desk
 * (the ones that acted here, and the shift that just ended). 0 when there is none yet.
 */
export function forgers(state, ended = null) {
  const out = (state.seen ?? []).map((s) => s.logId);
  if (ended && ended.logId > 0 && ended.character !== "control" && !out.includes(ended.logId)) out.push(ended.logId);
  return out;
}

/**
 * The overseer's directive after a shift, posted by the entrance: { x, y, msg, logId }. logId is the
 * signature it claims: a real shift that was not the control desk (0 only when nobody has acted
 * yet). It names the phase or the next worker's equipment; a third of the time, truthfully.
 * ended: the shift that just ended, { logId, character }, when the caller passes it.
 */
export function forge(state, ended = null, rand = Math.random) {
  const signers = forgers(state, ended);
  const logId = signers.length ? pick(signers, rand) : 0;
  const truthful = rand() < FORGE_TRUTH;
  let msg;
  if (rand() < 0.5) {
    const phase = truthful ? state.phase : state.phase === "blue" ? "red" : "blue";
    msg = phrase("{} 있음", PHASE_WORD[phase]);
  } else {
    msg = phrase("다음 근무자는 {}", EQUIP_WORD[truthful ? neededNext(state) : pick(wastedNow(state), rand)]);
  }
  return { ...FORGE_AT, msg, logId };
}

export const local = { newState: (tier = 1) => newState(tier), publicWorld, canClear, act, retier, forge };

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
  if (v === BLUE || v === RED) return phaseSolid(world, v);
  return false;
}

const self = { tileAt, solidAt, doorOpen };
export function step(world, p, input, character, dt, now) {
  E.step(self, world, p, input, character, dt, now);
}

// ---------- what the player can do here ----------

export const nearTerminal = (p) => E.near(p, TERMINAL);
export const nearLever = (p) => E.near(p, LEVER);
export const nearSocket = (p) => (E.near(p, SOCKETS.blue) ? "blue" : E.near(p, SOCKETS.red) ? "red" : null);

export function hint(world, p, character, now, logId) {
  if (nearTerminal(p) && !world.door) return character === "key" ? t("E: 서명 ({n}/{need})", { n: world.signs, need: world.needed }) : t("출입 카드 필요");
  if (nearLever(p) && !world.lever) return world.door ? t("E: 퇴근 레버") : t("문 D 잠김");
  const socket = nearSocket(p);
  if (character === "phase") {
    if (socket) return world.anchor === socket ? t("E: {phase} 닻 뽑기", { phase: PHASE_NAME[socket] }) : t("E: {phase} 닻 꽂기", { phase: PHASE_NAME[socket] });
    return t("E: 위상 전환 (남은 {n}번)", { n: switchesLeft(world, logId) });
  }
  if (socket) return t("{phase} 위상 닻 소켓", { phase: PHASE_NAME[socket] });
  return "";
}

/** The use key. api: { world, p, character, logId, say, act, pullLever } */
export function use(api) {
  const { world, p, character } = api;
  if (nearTerminal(p) && !world.door) {
    if (character !== "key") return api.say(t("서명은 출입 카드로만 할 수 있습니다."));
    return api.act("sign");
  }
  if (nearLever(p) && !world.lever) {
    if (!world.door) return api.say(t("문 D가 잠겨 있습니다. 어떻게 여기까지 오셨는지 기록하겠습니다."));
    return api.pullLever();
  }
  if (character !== "phase") return;
  const socket = nearSocket(p);
  if (socket) return api.act(`anchor:${socket}`);
  if (switchesLeft(world, api.logId) <= 0) return api.say(t("이번 근무의 위상 전환을 모두 썼습니다."));
  api.act("switch");
}

/** What the overseer says when the server answers a lab.act. */
export function acted(what, result, world) {
  if (result === "limit") return t("이번 근무의 위상 전환을 모두 썼습니다.");
  if (result === "already" && what === "sign") return t("이 근무자는 이미 서명했습니다. 다음 출입 카드 근무자가 필요합니다.");
  return null;
}

/** What the overseer says about a change, or null. */
export function narrate(prev, next) {
  if (prev.lab !== 5) return null; // just arrived (or another lab's world): nothing changed yet
  if (next.lever && !prev.lever) return t("실험실 5 종료. 지시의 서명을 근무 기록과 대조하셨기를 바랍니다.");
  if (next.door && !prev.door) return t("문 D가 열렸습니다. 서명이 갖춰졌습니다.");
  if ((next.signs ?? 0) > (prev.signs ?? 0)) return t("서명 {n}/{need}. 인력이 충원되어 서명이 더 필요합니다. 다른 출입 카드 근무자가 서명하십시오.", { n: next.signs, need: next.needed });
  if (next.anchor !== prev.anchor) return next.anchor ? t("위상 닻: {phase} 고정. 그 색은 어느 위상에서도 남습니다.", { phase: PHASE_NAME[next.anchor] }) : t("위상 닻을 뽑았습니다.");
  // which phase is a true value (the lamp and the blocks say it in the field); everyone hears this
  if (next.phase !== prev.phase) return t("방의 위상이 바뀌었습니다. 어느 쪽인지 다음 근무자에게 알릴지는 당신의 몫입니다.");
  return null;
}

/** True when this equipment cannot move the lab forward from here. */
export function useless(world, character) {
  if (!characters.includes(character)) return true;
  if (character === "light") return true; // nothing to light here: scout, and write
  if (world.door) return character === "phase" && bridgeUp(world) && stepsUp(world);
  if (character === "tall") return true; // nothing behind door D yet
  return false;
}

export function mood(prev, next) {
  if ((next.door && !prev.door) || (next.lever && !prev.lever)) return "BackFlip";
  if (next.phase !== prev.phase) return "Charging";
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
  ctx.fillStyle = world.door ? "#5bd67a" : E.EQUIP.key.color; ctx.fillRect(TERMINAL.x - 5, TERMINAL.y - 19, 10, 6);
  E.drawLever2D(ctx, LEVER, world.lever);
  E.drawActor2D(ctx, actor);
}

/** On top of the room: the phase lamp over the hall, the anchor sockets, the signature count. */
export function drawOverlay(ctx, opts) {
  const { world, actor, cctv } = opts;
  ctx.save();
  // the phase lamp: the room's state, big and plain, for anyone who looks
  const lx = 11 * T + 8, ly = 13 * T;
  ctx.fillStyle = "#1e1e1c"; ctx.fillRect(lx - 16, ly - 9, 32, 16);
  ctx.fillStyle = PHASE_COLOR[world.phase] ?? "#888"; ctx.fillRect(lx - 14, ly - 7, 28, 12);
  ctx.fillStyle = "#f4ecd8"; ctx.font = `8px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(t("{phase} 위상", { phase: PHASE_NAME[world.phase] ?? "?" }), lx, ly);
  // the notice over the entrance, where the overseer posts its directive: how to tell
  const notice = t("지시 서명은 근무 기록과 대조할 것");
  ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`;
  const nw = Math.ceil(ctx.measureText(notice).width) + 6, nx = Math.max(nw / 2 + 2, 3 * T + 8), ny = 15 * T + 8;
  ctx.fillStyle = "#e9e4d6"; ctx.fillRect(Math.round(nx - nw / 2), ny - 5, nw, 10);
  ctx.fillStyle = "#1e1e1c"; ctx.fillText(notice, nx, ny);
  // sockets: a ring in their colour, filled while the anchor is in
  for (const [c, s] of Object.entries(SOCKETS)) {
    ctx.strokeStyle = PHASE_COLOR[c]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y - 4, 4, 0, Math.PI * 2); ctx.stroke();
    if (world.anchor === c) { ctx.fillStyle = PHASE_COLOR[c]; ctx.fillRect(s.x - 1, s.y - 16, 2, 12); ctx.beginPath(); ctx.arc(s.x, s.y - 4, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  // the signature sheet on door D's terminal
  ctx.fillStyle = "#e9e4d6"; ctx.fillRect(TERMINAL.x - 10, TERMINAL.y - 36, 20, 10);
  ctx.fillStyle = "#1e1e1c"; ctx.font = `7px Galmuri7, ${FONT_FALLBACK}`;
  ctx.fillText(`${world.signs ?? 0}/${world.needed ?? 1}`, TERMINAL.x, TERMINAL.y - 31);
  ctx.restore();
  if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
}

// ---------- control console (see console.js) ----------

export function schematic({ world }) {
  const doorX = 34 * T + 8;
  const sign = world.door ? [t("해제"), "ok"] : [t("서명 {n}/{need}", { n: world.signs ?? 0, need: world.needed ?? 1 }), world.signs ? "warn" : "idle"];
  return {
    map: [
      { kind: "device", x: TERMINAL.x, y: TERMINAL.y - 14, label: t("서명 단말기"), state: sign[0], tone: sign[1], color: E.EQUIP.key.color },
      { kind: "device", x: SOCKETS.blue.x, y: SOCKETS.blue.y - 10, label: t("닻 소켓 청"), state: world.anchor === "blue" ? t("고정") : t("비어 있음"), tone: world.anchor === "blue" ? "ok" : "idle", color: PHASE_COLOR.blue },
      { kind: "device", x: SOCKETS.red.x, y: SOCKETS.red.y - 10, label: t("닻 소켓 적"), state: world.anchor === "red" ? t("고정") : t("비어 있음"), tone: world.anchor === "red" ? "ok" : "idle", color: PHASE_COLOR.red },
      { kind: "label", x: doorX, y: 7 * T - 4, text: world.door ? t("문 D 열림") : t("문 D 잠김"), color: world.door ? "#5bd67a" : "#e06060" },
      { kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color },
      // the true phase and what it leaves standing: the control desk's (the field sees the blocks)
      { kind: "label", ctrl: true, x: 11 * T + 8, y: 15 * T, text: bridgeUp(world) ? t("청 발판 있음") : t("청 발판 없음 · 감전"), color: bridgeUp(world) ? PHASE_COLOR.blue : "#e06060" },
      { kind: "label", ctrl: true, x: 26 * T, y: 12 * T + 10, text: stepsUp(world) ? t("적 발판 있음") : t("적 발판 없음"), color: stepsUp(world) ? PHASE_COLOR.red : "#9a9a9a" },
    ],
    status: [
      { label: t("방 위상"), ctrl: true, state: `${PHASE_NAME[world.phase] ?? "?"}`, tone: "warn" },
      { label: t("위상 닻"), state: world.anchor ? t("{phase} 고정", { phase: PHASE_NAME[world.anchor] }) : t("없음"), tone: world.anchor ? "ok" : "idle" },
      { label: t("청 발판 (감전 구간)"), ctrl: true, state: bridgeUp(world) ? t("있음") : t("없음"), tone: bridgeUp(world) ? "ok" : "bad" },
      { label: t("적 발판"), ctrl: true, state: stepsUp(world) ? t("있음") : t("없음"), tone: stepsUp(world) ? "ok" : "idle" },
      { label: t("문 D 서명"), state: sign[0], tone: sign[1], bar: Math.min(1, (world.signs ?? 0) / (world.needed ?? 1)) },
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
  kit.lamps([[3, uy(16 * T) - 0.04], [20, uy(12 * T) - 0.04], [30, uy(8 * T) - 0.04], [36.5, uy(1 * T) - 0.04]]);
  kit.rails([[28, 33, 11], [35, 36, 7], [37, 38, 3]]);
  kit.column(18.5, FLOOR, 8);
  kit.vent(13, uy(17 * T));
  kit.fan(36.5, uy(5 * T));
  kit.prop("computer-system", 32.4, FLOOR);
  return {
    update(world, _actor, dt) {
      terminal.setColor(world.door ? "#5bd67a" : world.signs ? "#e0b83a" : "#8a8f99");
      lever.update(world.lever, dt);
    },
  };
}
