// The white-collar view: the control console everyone sees while they are not working.
// It is a printed drawing sheet (reports/인디 게임 그래픽 아트 디렉션.md): cream paper, ink lines
// in two weights plus a heavy frame, grid references A-H / 1-5, a title block with revision
// rows, and a 결재란 (approval box) that the overseer seals when a shift ends. Like a plant
// control screen, it stays grey while things are normal; colour means something is wrong, or
// marks a piece of equipment. The live 3D room shows in a small monochrome CCTV window
// (client.js and index.html place the 3D canvas there; this file only leaves the space).
//
// It shows what the system knows (layout, device states, wiring, timers, paths), never what
// you need a body to see (ultraviolet glyphs, the inside of the dark shaft, drawings on walls).
// Each lab adds its own devices through lab.schematic({ world, now, actor, echo }):
//   { map: [item...], status: [{ label, state, tone, bar? }] }
//   map items: zone {x0,y0,x1,y1,label,tone:"dark"|"blind"}, wire {pts,on},
//              device {x,y,label,state,tone,color}, box {x0,y0,x1,y1,label,tone}, label {x,y,text,color}
// Clearance (docs: reports/퍼즐 깊이 설계 리서치.md S1): any map item or status row may carry
// ctrl: true. Those are the wiring layer: shown only to the control-desk worker (opts.clearance),
// and redacted for everyone else. A redacted wire or label is left out; a redacted device keeps
// its icon and label but its state reads as a black bar; a redacted status row keeps its label.
// Rule of thumb for lab authors: where things are is public; what is connected to what, hidden
// timers and true values are ctrl.
// Map coordinates are world pixels; layout numbers are stage pixels (640 x 352). Everything is
// drawn on whole pixels so lines and the pixel font stay crisp.

import { T, COLS, ROWS, W, H, P, TILE, EQUIP, TRAP_NAME, trapState, PHASE_OF, PHASE_COLOR, phaseSolid } from "./engine.js";
import { roomCode } from "./labs.js";
import { t, tr, FONT_FALLBACK } from "./i18n.js";

const TILE_PX = 11; // one tile on the sheet
export const LAYOUT = {
  map: { x: 24, y: 42, s: TILE_PX / T }, // 440 x 242
  inset: { x: 472, y: 42, w: 156, h: Math.round(156 * (H / W)) }, // the CCTV window (index.html matches it)
  side: { x: 472, w: 156 },
  sheet: { x0: 4, y0: 24, x1: 636, y1: 324 },
};

/** The camera that maps world pixels onto the sheet, in the client's {x, y, zoom} form. */
export function consoleShot() {
  const { x, y, s } = LAYOUT.map;
  return { x: (W / 2 - x) / s, y: (H / 2 - y) / s, zoom: s };
}

/** Sheet colours: four neutrals, the safety colours, and seal ink. */
export const INK = {
  desk: "#2a2926", paper: "#e9e4d6", shade: "#d6d0c0", mid: "#a8a59c", line: "#4a4a48", ink: "#1e1e1c",
  red: "#c8402e", yellow: "#e8b830", blue: "#2f5fa8", green: "#3f8f4a", seal: "#b8302a",
};
const TONE = { bad: INK.red, warn: INK.yellow }; // "ok" and "idle" stay ink: normal is not news
const MARK = { bad: "■", warn: "▲" }; // shape first, colour second
export const FONTS = {
  title: `12px Galmuri11, ${FONT_FALLBACK}`,
  bold: `bold 12px Galmuri11, ${FONT_FALLBACK}`,
  label: `10px Galmuri9, ${FONT_FALLBACK}`,
  small: `8px Galmuri7, ${FONT_FALLBACK}`,
  mono: `10px GalmuriMono9, Consolas, monospace`,
};

const mx = (x) => LAYOUT.map.x + Math.round(x * LAYOUT.map.s);
const my = (y) => LAYOUT.map.y + Math.round(y * LAYOUT.map.s);
/** A crisp 1 px line between whole-pixel points. */
function line(ctx, x0, y0, x1, y1, color = INK.ink, width = 1, dash = null) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  const o = width % 2 ? 0.5 : 0;
  ctx.beginPath();
  ctx.moveTo(x0 + (x0 === x1 ? o : 0), y0 + (y0 === y1 ? o : 0));
  ctx.lineTo(x1 + (x0 === x1 ? o : 0), y1 + (y0 === y1 ? o : 0));
  ctx.stroke();
  ctx.setLineDash([]);
}
function box(ctx, x, y, w, h, color = INK.ink, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const o = width % 2 ? 0.5 : 0;
  ctx.strokeRect(x + o, y + o, w - (o ? 1 : 0), h - (o ? 1 : 0));
}
// max: squeeze the text horizontally to fit (longer languages in boxes sized for Korean)
function text(ctx, str, x, y, { font = FONTS.label, color = INK.ink, align = "left", bg = null, max = 0 } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (bg) {
    const w = Math.ceil(Math.min(ctx.measureText(str).width, max > 0 ? max : Infinity)) + 4;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w + 2 : x - 2;
    ctx.fillStyle = bg;
    ctx.fillRect(Math.round(left), y - 9, w, 12);
  }
  ctx.fillStyle = color;
  if (max > 0 && ctx.measureText(str).width > max) ctx.fillText(str, Math.round(x), Math.round(y), max);
  else ctx.fillText(str, Math.round(x), Math.round(y));
}

/**
 * opts: { lab, world, actor, echo (position now), now, time, reveal (0..1),
 *         kpi: { progress, shifts, timeoutRate, rejected }, worker: string, camLabel: string,
 *         day, shift, log (today's entries, newest first) }
 * scale: canvas pixels per stage pixel.
 */
export function drawConsole(ctx, scale, opts) {
  const { lab, world, now, reveal = 1 } = opts;
  const raw = lab.schematic ? lab.schematic(opts) : { map: [], status: [] };
  const sch = cleared(raw, !!opts.clearance);
  const L = LAYOUT, m = L.map, sh = L.sheet;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = INK.desk;
  ctx.fillRect(0, 0, W, H);
  // the sheet, with a hard 2 px shadow on the desk
  ctx.fillStyle = "#121210";
  ctx.fillRect(sh.x0 + 2, sh.y0 + 2, sh.x1 - sh.x0, sh.y1 - sh.y0);
  ctx.fillStyle = INK.paper;
  ctx.fillRect(sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0);
  box(ctx, sh.x0 + 3, sh.y0 + 3, sh.x1 - sh.x0 - 6, sh.y1 - sh.y0 - 6, INK.ink, 3); // the frame: the heaviest line

  // ---- the plan ----
  const mw = COLS * TILE_PX, mh = ROWS * TILE_PX;
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.x, m.y - 2, Math.round(mw * reveal), mh + 4);
  ctx.clip();
  drawPlan(ctx, lab, world, now, !!opts.clearance);
  for (const it of sch.map) if (it.kind === "zone") drawZone(ctx, it);
  drawTrapsPlan(ctx, lab, now, world);
  for (const it of sch.map) if (it.kind === "wire") drawWire(ctx, it);
  for (const it of sch.map) if (it.kind === "box") drawBox(ctx, it);
  drawEchoPath(ctx, world.echo, opts.echo);
  for (const it of sch.map) if (it.kind === "device") drawDevice(ctx, it);
  for (const it of sch.map) if (it.kind === "label") drawMapLabel(ctx, it);
  drawWorker(ctx, opts.actor);
  ctx.restore();
  box(ctx, m.x - 1, m.y - 1, mw + 2, mh + 2, INK.ink, 2);
  if (reveal < 1) { ctx.fillStyle = INK.ink; ctx.fillRect(m.x + Math.round(mw * reveal), m.y, 1, mh); }
  // grid references: A-H across, 1-5 down
  for (let i = 0; i < 8; i++) {
    const x0 = m.x + Math.round((mw * i) / 8);
    if (i) line(ctx, x0, m.y - 6, x0, m.y - 2, INK.line);
    text(ctx, String.fromCharCode(65 + i), x0 + mw / 16, m.y - 4, { font: FONTS.small, align: "center", color: INK.line });
  }
  for (let i = 0; i < 5; i++) {
    const y0 = m.y + Math.round((mh * i) / 5);
    if (i) line(ctx, m.x - 6, y0, m.x - 2, y0, INK.line);
    text(ctx, String(i + 1), m.x - 8, y0 + mh / 10 + 3, { font: FONTS.small, align: "center", color: INK.line });
  }

  // ---- right column: CCTV, device states, revisions, approval, title ----
  const s = L.side, iv = L.inset;
  ctx.fillStyle = INK.ink;
  ctx.fillRect(iv.x - 2, iv.y - 2, iv.w + 4, iv.h + 4);
  text(ctx, t("{cam} · 현장 · 녹화", { cam: opts.camLabel ?? "" }), iv.x, iv.y - 5, { font: FONTS.small, color: INK.line });
  ctx.fillStyle = INK.red;
  ctx.fillRect(iv.x + iv.w - 4, iv.y - 10, 4, 4); // rec

  let y = iv.y + iv.h + 14;
  text(ctx, t("장치 상태"), s.x, y, { font: FONTS.bold });
  y += 3;
  line(ctx, s.x, y, s.x + s.w, y, INK.ink, 2);
  for (const row of sch.status.slice(0, 6)) {
    y += 12;
    const tone = TONE[row.tone];
    const state = `${MARK[row.tone] ? MARK[row.tone] + " " : ""}${tr(row.state)}`;
    ctx.font = FONTS.label;
    const stateW = Math.min(s.w * 0.55, ctx.measureText(state).width);
    text(ctx, state, s.x + s.w, y, { color: tone ?? INK.ink, align: "right", max: s.w * 0.55 });
    text(ctx, tr(row.label), s.x, y, { color: INK.line, max: s.w - stateW - 4 });
    if (row.bar != null) {
      const bw = Math.round(s.w * Math.max(0, Math.min(1, row.bar)));
      ctx.fillStyle = INK.shade; ctx.fillRect(s.x, y + 2, s.w, 3);
      ctx.fillStyle = tone ?? INK.line; ctx.fillRect(s.x, y + 2, bw, 3);
      y += 4;
    }
    line(ctx, s.x, y + 2, s.x + s.w, y + 2, INK.shade);
  }

  drawTitleBlock(ctx, opts);
  drawFooter(ctx, opts);
}

// ---------- title block: revisions, approval, drawing title ----------

function drawTitleBlock(ctx, opts) {
  const s = LAYOUT.side, x = s.x, w = s.w;
  const log = opts.log ?? [];
  // revisions: one row per shift today, newest on top (the last two fit; the log has the rest)
  let y = 226;
  box(ctx, x, y, w, 31, INK.ink, 1);
  ctx.fillStyle = INK.shade; ctx.fillRect(x + 1, y + 1, w - 2, 10);
  const cols = [x + 4, x + 22, x + 56, x + w - 4];
  text(ctx, t("개정"), cols[0], y + 9, { font: FONTS.small });
  text(ctx, t("근무"), cols[1], y + 9, { font: FONTS.small });
  text(ctx, t("담당"), cols[2], y + 9, { font: FONTS.small });
  text(ctx, t("사유"), cols[3], y + 9, { font: FONTS.small, align: "right" });
  log.slice(0, 2).forEach((e, i) => {
    const ry = y + 20 + i * 10;
    const rev = String.fromCharCode(65 + ((log.length - 1 - i) % 26));
    text(ctx, rev, cols[0], ry, { font: FONTS.small });
    text(ctx, `#${e.id}`, cols[1], ry, { font: FONTS.small });
    text(ctx, clip(ctx, `${e.nick}·${EQUIP[e.character]?.name ?? ""}`, 60, FONTS.small), cols[2], ry, { font: FONTS.small });
    text(ctx, e.rejected ? t("무효") : REASON[e.reason] ?? "", cols[3], ry, { font: FONTS.small, align: "right", color: e.rejected ? INK.red : INK.ink });
  });
  if (!log.length) text(ctx, t("개정 없음"), x + w / 2, y + 24, { font: FONTS.small, align: "center", color: INK.mid });

  // 결재란: 담당 (the worker), 검토 (the last controller), 승인 (the overseer's seal once a shift is done)
  y = 261;
  const cell = Math.floor((w - 14) / 3);
  box(ctx, x, y, w, 36, INK.ink, 1);
  line(ctx, x + 14, y, x + 14, y + 36, INK.ink);
  // the box's name, written down the narrow column one character at a time
  const head = [...t("결재")].slice(0, 3), step = head.length > 2 ? 9 : 12;
  head.forEach((ch, i) => text(ctx, ch, x + 7, y + 16 + i * step - (head.length > 2 ? 3 : 0), { font: FONTS.label, align: "center" }));
  const working = opts.shift;
  const last = log[0];
  const reviewer = log.find((e) => e.character === "control" && !e.rejected);
  const heads = [t("담당"), t("검토"), t("승인")];
  heads.forEach((head, i) => {
    const cx = x + 14 + i * cell;
    if (i) line(ctx, cx, y, cx, y + 36, INK.ink);
    line(ctx, cx, y + 11, cx + cell, y + 11, INK.ink);
    text(ctx, head, cx + cell / 2, y + 9, { font: FONTS.small, align: "center" });
    const mid = cx + cell / 2, my0 = y + 25;
    if (i === 0) {
      const who = working?.nick ?? last?.nick;
      if (who) text(ctx, clip(ctx, who, cell - 4, FONTS.small), mid, my0 + 3, { font: FONTS.small, align: "center" });
    } else if (i === 1) {
      if (reviewer) seal(ctx, mid, my0, clip(ctx, reviewer.nick, 22, FONTS.small), INK.blue, 0.1);
    } else if (working) {
      text(ctx, t("미결"), mid, my0 + 3, { font: FONTS.small, align: "center", color: INK.mid });
    } else if (last) {
      seal(ctx, mid, my0, t("감독"), last.rejected ? INK.mid : INK.seal, -0.12);
    }
  });

  // drawing title
  y = 300;
  box(ctx, x, y, w, 20, INK.ink, 2);
  line(ctx, x + 98, y, x + 98, y + 20, INK.ink);
  text(ctx, clip(ctx, `LAB ${roomCode(opts.lab.id)} ${tr(opts.lab.name) ?? ""}`, 92, FONTS.label), x + 4, y + 14, { font: FONTS.label });
  text(ctx, t("{n}회차", { n: opts.day ?? 1 }) + (opts.stages > 1 ? " · " + t("공정 {stage}/{stages}", { stage: opts.stage, stages: opts.stages }) : ""), x + 102, y + 9, { font: FONTS.small, max: w - 106 });
  text(ctx, t("작성 감독관"), x + 102, y + 18, { font: FONTS.small, color: INK.line, max: w - 106 });
}

const REASON = { clockout: t("퇴근"), cleared: t("종료"), idle: t("이탈"), timeup: t("시간"), disconnected: t("끊김"), admin: t("조치"), accident: t("산재") };

/** A round name seal, stamped slightly crooked. */
function seal(ctx, x, y, label, color, tilt) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(tilt);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.font = FONTS.small; ctx.textAlign = "center"; ctx.fillStyle = color;
  ctx.fillText(label, 0, 3);
  ctx.restore();
}

function clip(ctx, str, width, font) {
  ctx.font = font;
  if (ctx.measureText(str).width <= width) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + "…").width > width) s = s.slice(0, -1);
  return s + "…";
}

// ---------- footer: statistics as gauges, and the one document the system cannot read ----------

function drawFooter(ctx, opts) {
  const k = opts.kpi ?? {}, m = LAYOUT.map;
  const y = 296, x = m.x;
  // progress: one cell per step reached
  text(ctx, t("진행"), x, y + 8, { font: FONTS.small });
  const steps = Math.max(4, k.progress ?? 0);
  for (let i = 0; i < steps; i++) {
    const cx = x + 24 + i * 9;
    box(ctx, cx, y, 7, 9, INK.ink);
    if (i < (k.progress ?? 0)) { ctx.fillStyle = INK.ink; ctx.fillRect(cx + 2, y + 2, 3, 5); }
  }
  // time-out rate: a bar with the normal band (under 30 %) shaded; the needle turns red past it
  const gx = x + 92, gw = 120, rate = Math.max(0, Math.min(100, k.timeoutRate ?? 0));
  text(ctx, t("시간 초과율"), gx, y + 8, { font: FONTS.small });
  const bx = gx + 50;
  ctx.fillStyle = INK.shade; ctx.fillRect(bx, y + 1, Math.round(gw * 0.3), 7);
  box(ctx, bx, y, gw, 9, INK.ink);
  const nx = bx + Math.round((gw - 1) * (rate / 100));
  ctx.fillStyle = rate > 30 ? INK.red : INK.ink;
  ctx.fillRect(nx - 1, y - 2, 3, 13);
  text(ctx, `${rate}%`, bx + gw + 4, y + 8, { font: FONTS.small, color: rate > 30 ? INK.red : INK.ink });
  text(ctx, t("오늘 근무 {shifts} · 인수 거부 {rejected}", { shifts: k.shifts ?? 0, rejected: k.rejected ?? 0 }), x, y + 22, { font: FONTS.small, color: INK.line });
  // the unreadable document: a red-ink rubber stamp, never animated
  ctx.save();
  ctx.translate(x + 372, y + 12);
  ctx.rotate(-0.05);
  ctx.strokeStyle = INK.seal; ctx.lineWidth = 1;
  ctx.strokeRect(-52.5, -9.5, 105, 19);
  ctx.font = FONTS.small; ctx.textAlign = "center"; ctx.fillStyle = INK.seal;
  ctx.fillText(t("미분류 문서 1건 · 판독 불가"), 0, 3);
  ctx.restore();
}

// ---------- the plan ----------

function drawPlan(ctx, lab, world, now, clearance = true) {
  const m = LAYOUT.map, t = TILE_PX;
  // a fake wall is on the plan as rock: the system does not know it is hollow
  const solid = (x, y) => { const v = lab.tileAt(x, y); return v === TILE.SOLID || v === TILE.FAKE; };
  // solid rock: section hatching, as on a drawing of a cut
  ctx.fillStyle = INK.shade;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (solid(x, y)) ctx.fillRect(m.x + x * t, m.y + y * t, t, t);
  ctx.save();
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (solid(x, y)) ctx.rect(m.x + x * t, m.y + y * t, t, t);
  ctx.clip();
  ctx.strokeStyle = INK.mid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -COLS * t; d < COLS * t + ROWS * t; d += 6) { ctx.moveTo(m.x + d + 0.5, m.y + ROWS * t); ctx.lineTo(m.x + d + ROWS * t + 0.5, m.y); }
  ctx.stroke();
  ctx.restore();
  // a light 1-tile grid over the open space only
  ctx.fillStyle = "#dcd6c6";
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!solid(x, y)) { ctx.fillRect(m.x + x * t, m.y + y * t, t, 1); ctx.fillRect(m.x + x * t, m.y + y * t, 1, t); }

  // walls: every edge between rock and open space, in the heavy line
  ctx.fillStyle = INK.ink;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!solid(x, y)) continue;
      const px = m.x + x * t, py = m.y + y * t;
      if (y > 0 && !solid(x, y - 1)) ctx.fillRect(px, py, t, 2);
      if (y < ROWS - 1 && !solid(x, y + 1)) ctx.fillRect(px, py + t - 2, t, 2);
      if (x > 0 && !solid(x - 1, y)) ctx.fillRect(px, py, 2, t);
      if (x < COLS - 1 && !solid(x + 1, y)) ctx.fillRect(px + t - 2, py, 2, t);
    }
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = lab.tileAt(x, y), px = m.x + x * t, py = m.y + y * t;
      if (v === TILE.DOOR) {
        const open = lab.doorOpen(world, x, y, now);
        if (open) { ctx.fillStyle = INK.line; for (let i = 0; i < t; i += 3) ctx.fillRect(px + 5, py + i, 1, 1); }
        else { ctx.fillStyle = INK.ink; ctx.fillRect(px + 4, py, 3, t); }
      } else if (PHASE_OF[v]) {
        // phase blocks: hatched in their colour while solid, a dashed outline while not
        const color = PHASE_COLOR[PHASE_OF[v]];
        // which phase is solid is a true value: without clearance every block is drawn the same
        if (clearance && phaseSolid(world, v)) { ctx.fillStyle = color; ctx.fillRect(px + 1, py + 1, t - 2, t - 2); }
        else { ctx.fillStyle = color; for (let i = 0; i < t; i += 3) { ctx.fillRect(px + i, py, 1, 1); ctx.fillRect(px + i, py + t - 1, 1, 1); } }
      } else if (v === TILE.BRIDGE) {
        // hard-light bridges: on the plan they always exist, drawn as a dashed hidden line
        ctx.fillStyle = INK.line;
        for (let i = 0; i < t; i += 4) ctx.fillRect(px + i, py, 2, 1);
      }
    }
  }
}

function hatch(ctx, x0, y0, x1, y1, color, gap) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -(y1 - y0); d < x1 - x0; d += gap) { ctx.moveTo(x0 + d + 0.5, y1); ctx.lineTo(x0 + d + (y1 - y0) + 0.5, y0); }
  ctx.stroke();
  ctx.restore();
}

function drawZone(ctx, z) {
  const x0 = mx(z.x0), y0 = my(z.y0), x1 = mx(z.x1), y1 = my(z.y1);
  const dark = z.tone === "dark";
  hatch(ctx, x0, y0, x1, y1, dark ? INK.mid : INK.yellow, dark ? 5 : 3);
  box(ctx, x0, y0, x1 - x0, y1 - y0, dark ? INK.line : INK.ink, 1);
  if (z.label) text(ctx, `${dark ? "" : "▲ "}${tr(z.label)}`, (x0 + x1) / 2, dark ? y1 - 4 : y1 + 10, { font: FONTS.small, align: "center", bg: INK.paper });
}

/** Traps on the plan: a red-hatched danger zone with its cycle written beside it, filled while it fires. */
function drawTrapsPlan(ctx, lab, now, world = null) {
  for (const trap of lab.traps ?? []) {
    if (trap.hidden) continue; // the system does not know about these
    const s = trapState(trap, now, world, lab);
    if (s.stopped) { // held by its safety interlock
      const x0 = mx(trap.x0), x1 = mx(trap.x1), top = my(trap.top);
      box(ctx, x0, top, x1 - x0, my(trap.bottom) - top, INK.line, 1);
      text(ctx, "■ " + t("{trap} 정지 · 안전 매트", { trap: TRAP_NAME[trap.kind] ?? t("함정") }), (x0 + x1) / 2, top - 3, { font: FONTS.small, align: "center", color: INK.ink, bg: INK.paper });
      continue;
    }
    if (trap.kind === "shock") { // a live floor: a red band with sparks marked on the plan
      const x0 = mx(trap.x0), x1 = mx(trap.x1), y = my(trap.y);
      ctx.fillStyle = INK.red; ctx.fillRect(x0, y - 3, x1 - x0, 3);
      text(ctx, "⚡ " + t("{trap} · 상시 통전", { trap: TRAP_NAME.shock }), (x0 + x1) / 2, y + 9, { font: FONTS.small, align: "center", color: INK.red, bg: INK.paper });
      continue;
    }
    const y0 = trap.kind === "press" ? trap.top : trap.y0, y1 = trap.kind === "press" ? trap.bottom : trap.y1;
    const x0 = mx(trap.x0) - 1, x1 = Math.max(mx(trap.x1), x0 + 3), top = my(y0), bottom = my(y1);
    if (s.active) { ctx.fillStyle = INK.red; ctx.fillRect(x0, top, x1 - x0, bottom - top); }
    else hatch(ctx, x0, top, x1, bottom, INK.red, 3);
    box(ctx, x0, top, x1 - x0, bottom - top, INK.red, 1);
    const cycle = trap.kind === "laser"
      ? t("{on}/{off}초", { on: (trap.on / 1000).toFixed(1), off: (trap.off / 1000).toFixed(1) })
      : t("{sec}초 주기", { sec: (trap.period / 1000).toFixed(1) });
    text(ctx, `■ ${TRAP_NAME[trap.kind] ?? t("함정")} ${cycle}`, (x0 + x1) / 2, top - 3, { font: FONTS.small, align: "center", color: INK.red, bg: INK.paper });
  }
}

function drawWire(ctx, w) {
  // live wiring is drawn solid, dead wiring as a hidden line
  const pts = w.pts.map((v, i) => (i % 2 ? my(v) : mx(v)));
  ctx.strokeStyle = w.on ? INK.ink : INK.mid;
  ctx.lineWidth = 1;
  ctx.setLineDash(w.on ? [] : [3, 2]);
  ctx.beginPath();
  ctx.moveTo(pts[0] + 0.5, pts[1] + 0.5);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + 0.5, pts[i + 1] + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBox(ctx, b) {
  const x0 = mx(b.x0), y0 = my(b.y0), x1 = mx(b.x1), y1 = my(b.y1);
  const c = TONE[b.tone] ?? INK.ink;
  box(ctx, x0, y0, x1 - x0, y1 - y0, c, 2);
  if (b.label) text(ctx, tr(b.label), (x0 + x1) / 2, y0 + 11, { font: FONTS.small, align: "center", color: c });
}

function drawDevice(ctx, d) {
  const x = mx(d.x), y = my(d.y), tone = TONE[d.tone];
  ctx.fillStyle = INK.paper; ctx.fillRect(x - 4, y - 4, 9, 9);
  box(ctx, x - 4, y - 4, 9, 9, INK.ink, 1);
  // the equipment that works it, as a swatch; the state, as a filled mark only when abnormal
  if (d.color) { ctx.fillStyle = d.color; ctx.fillRect(x - 2, y - 2, 5, 5); }
  // devices sit close together; longer languages are squeezed to the Korean width
  text(ctx, tr(d.label), x, y - 7, { font: FONTS.small, align: "center", bg: INK.paper, max: 32 });
  if (d.state) text(ctx, `${MARK[d.tone] ? MARK[d.tone] + " " : ""}${tr(d.state)}`, x, y + 14, { font: FONTS.small, align: "center", color: tone ?? INK.ink, bg: INK.paper, max: 32 });
}

const LABEL_TONE = { "#e06060": INK.red, "#f0c040": INK.yellow };
function drawMapLabel(ctx, it) {
  const equip = Object.values(EQUIP).find((e) => e.color === it.color);
  const x = mx(it.x), y = my(it.y), label = tr(it.text);
  if (equip) {
    // an equipment zone: ink text with the equipment's swatch
    ctx.font = FONTS.small;
    const w = Math.ceil(ctx.measureText(label).width);
    text(ctx, label, x + 4, y, { font: FONTS.small, align: "center", bg: INK.paper });
    ctx.fillStyle = it.color; ctx.fillRect(Math.round(x - w / 2 - 4), y - 6, 5, 5);
  } else {
    text(ctx, label, x, y, { font: FONTS.small, align: "center", color: LABEL_TONE[it.color] ?? INK.ink, bg: INK.paper });
  }
}

/** The sheet as this viewer may see it: ctrl items kept, redacted or dropped (see the header). */
function cleared(sch, clearance) {
  if (clearance) return sch;
  const map = [];
  for (const it of sch.map ?? []) {
    if (!it.ctrl) map.push(it);
    else if (it.kind === "device") map.push({ ...it, state: REDACTED, tone: "idle" });
    else if (it.kind === "zone" || it.kind === "box") map.push({ ...it, label: it.label ? REDACTED : it.label, tone: it.kind === "box" ? "idle" : it.tone });
    // wires and labels: the connection itself is the secret
  }
  const status = (sch.status ?? []).map((r) => (r.ctrl ? { ...r, state: REDACTED, tone: "idle", bar: undefined } : r));
  return { ...sch, map, status };
}
const REDACTED = "█▀█▀";

function drawEchoPath(ctx, rec, now) {
  if (!rec?.frames?.length) return;
  const c = EQUIP.echo.color;
  ctx.fillStyle = c;
  rec.frames.forEach(([x, y], i) => { if (i % 3 === 0) ctx.fillRect(mx(x), my(y - P.h / 2), 2, 2); });
  if (now) {
    const x = mx(now.x), y = my(now.y - P.h / 2);
    box(ctx, x - 4, y - 4, 9, 9, c, 1);
    text(ctx, t("잔상"), x, y - 7, { font: FONTS.small, align: "center", color: INK.ink, bg: INK.paper });
  }
}

function drawWorker(ctx, a) {
  if (!a) return;
  const x = mx(a.x), y = my(a.y - P.h / 2), color = EQUIP[a.character]?.color ?? INK.ink;
  // a crosshair in ink around the equipment's colour: where the body is
  ctx.fillStyle = INK.ink;
  ctx.fillRect(x - 8, y, 5, 1); ctx.fillRect(x + 4, y, 5, 1); ctx.fillRect(x, y - 8, 1, 5); ctx.fillRect(x, y + 4, 1, 5);
  ctx.fillStyle = color; ctx.fillRect(x - 2, y - 2, 5, 5);
  box(ctx, x - 3, y - 3, 7, 7, INK.ink, 1);
  text(ctx, `${a.logId ? `#${a.logId} ` : ""}${EQUIP[a.character]?.name ?? ""}`, x, y - 11, { font: FONTS.small, align: "center", bg: INK.paper });
}
