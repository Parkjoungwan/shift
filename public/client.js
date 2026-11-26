// Client for the shift relay server.
// The shell here handles connection, queue, notes and panels; each room lives in its lab module
// (lab3.js, lab4.js, ...) and the server says which lab the run is in.

import { FIRST, ORDER, labFor, labNo, nextRoom, roomCode, stageOf, stagesOf } from "./labs.js";
import * as Glyphs from "./lab3.js"; // the lab 3 keypad
import { call as callLift, echoAt, recordEcho } from "./lab4core.js";
import { LAYOUT as SHEET, consoleShot, drawConsole } from "./console.js";
import { ALL_WORDS, CONNECTORS, PINS, SIGNS, STAMPS, STAMPS_PER_SHIFT, TEMPLATES, WORDS, cleanPin, phraseText, signFor } from "./directives.js";
import { t, tr, lang, FONT_FALLBACK, SITE_ZONE, siteClock } from "./i18n.js";
import { setupIntro } from "./intro.js";
import { faceCanvas } from "./badge.js";
import * as Sound from "./sound.js";

// ---------- language: the static page ----------

const HANGUL = /[가-힣ㄱ-ㆎ]/;
/**
 * Translates the Korean in the static page (index.html) through the dictionary: text nodes,
 * keyed the way scripts/i18n-keys.mjs htmlKeys() reads them (whitespace collapsed, trimmed),
 * and the placeholder / aria-label / title attributes.
 */
function translateDom(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentNode?.nodeName;
    if (parent === "SCRIPT" || parent === "STYLE") continue;
    const raw = n.nodeValue, key = raw.replace(/\s+/g, " ").trim();
    if (!HANGUL.test(key)) continue;
    const out = tr(key);
    if (out !== key) n.nodeValue = raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0];
  }
  const top = root.nodeType === 9 ? root.documentElement : root;
  const attrs = ["placeholder", "aria-label", "title"];
  for (const el of [top, ...top.querySelectorAll("[placeholder], [aria-label], [title]")]) {
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v && HANGUL.test(v)) el.setAttribute(a, tr(v));
    }
  }
}
document.documentElement.lang = lang;
if (lang !== "ko") translateDom();
// the overseer's speech bubble prefix lives in CSS (index.html #ai::before)
document.documentElement.style.setProperty("--ai-who", JSON.stringify(t("감독관") + "> "));

/** Nicknames are the players' own text; only the server's two stock names are translated. */
const showNick = (n) => (n === "감독관" || n === "익명 근무자" ? tr(n) : n);

let Lab = labFor(FIRST);

function fitStage() {
  const stage = document.getElementById("stage");
  const w = Math.min(innerWidth, innerHeight * (Lab.W / Lab.H)), h = w * (Lab.H / Lab.W);
  stage.style.width = w + "px";
  stage.style.height = h + "px";
  stage.style.setProperty("--u", w / Lab.W + "px");
  // the control console is drawn at the screen's own resolution so its small text stays sharp
  const cc = document.getElementById("console"), dpr = Math.min(2, devicePixelRatio || 1);
  cc.width = Math.round(w * dpr);
  cc.height = Math.round(h * dpr);
}
fitStage();
addEventListener("resize", fitStage);

// 3D when WebGL works; otherwise the same room drawn flat.
let r3d = null;
try {
  const { create } = await import("./render3d.js");
  r3d = create(document.getElementById("gl"));
  window.__r3d = r3d; // for measuring draw calls and frame cost
} catch (err) {
  console.warn("3D renderer unavailable, using 2D", err);
  document.getElementById("stage").classList.add("flat");
}

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);

// Storage can be blocked inside third-party iframes (itch.io), so never rely on it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const suffix = qs.get("as") ? "." + qs.get("as") : ""; // ?as=b gives a second identity for testing
let cid = store.get("shift.cid" + suffix);
if (!cid) { cid = crypto.randomUUID(); store.set("shift.cid" + suffix, cid); }

// Where the server lives. Same host when served by the Worker; set SHIFT_SERVER for itch.io builds.
const serverHost = qs.get("server") || window.SHIFT_SERVER || location.host;
const local = /^(localhost|127\.|\[::1\])/.test(serverHost);
const wsUrl = (local ? "ws://" : "wss://") + serverHost + "/ws";

const CHAR = Lab.EQUIP;
const INK = ["#222222", "#d03a3a", "#2a6fb8", "#2e9a4a"];
const ERRORS = {
  "nick-required": t("출근하려면 먼저 근무자 등록을 해 주세요"),
  "no-handover": t("쪽지는 근무 중이나 퇴근 후 60초 안에만 붙일 수 있습니다"),
  "note-limit": t("이번 근무의 쪽지를 모두 썼습니다"),
  "bad-note": t("쪽지 그림이 너무 크거나 잘못되었습니다"),
  "banned": t("이 브라우저는 출근과 쪽지 작성이 제한되었습니다"),
  "stamp-limit": t("이번 근무의 도장을 모두 썼습니다"),
  "bad-pin": t("핀을 꽂을 수 없는 자리입니다"),
  "not-control": t("관제 근무 중에만 할 수 있습니다"),
  "too-fast": t("조금 천천히 해 주세요"),
  "cannot-act": t("이 장비로는 할 수 없습니다"),
  "rate-limited": t("요청이 너무 잦습니다. 잠시 뒤에 다시 해 주세요"),
  "closed": t("건물이 폐쇄되었습니다. 기록만 열람할 수 있습니다"),
  "daily-limit": t("최근 24시간 근무 한도(20번)를 채웠습니다. 쉬는 동안 기록을 둘러보세요"),
};
const REASON = { clockout: t("퇴근"), cleared: t("실험실 종료"), idle: t("자리 비움"), timeup: t("근무 시간 종료"), disconnected: t("연결 끊김"), admin: t("관리자 조치"), accident: t("산재") };

const S = {
  ws: null, online: false, offline: false, role: "viewer", you: {}, day: 1, labId: FIRST, characters: Lab.characters,
  world: Lab.fresh(), worldKnown: false, shift: null, queue: [], choosing: null, viewers: 0,
  log: [], notes: [], p: Lab.newPlayer(), remote: null, shown: null, myLogId: null, handover: null, detail: null,
  pad: null, padBusy: false, peekId: null, secret: null, reading: null, aiUntil: 0, lastShiftId: null, lastSpot: null,
  skew: 0, notesLeft: 1, ending: false,
  pins: [], tool: null, stampsLeft: STAMPS_PER_SHIFT, // the controller's pins and tools
  tape: [], tapeT: -1, play: null, lastTape: null, // this shift's recording; the tape on the CCTV
  limits: { offerMs: 20000, idleMs: 90000, handoverMs: 60000, notesPerShift: 1, noteW: 96, noteH: 64 },
};
window.__S = S; // for debugging and automated checks
window.__celebrate = () => celebrate(); // for checking the clear effect

// ---------- networking ----------

function send(msg) {
  if (S.offline) return localServer(msg);
  if (S.ws?.readyState === 1) S.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
}

function connect() {
  let welcomed = false;
  const ws = new WebSocket(wsUrl);
  S.ws = ws;
  const giveUp = setTimeout(() => { if (!welcomed) { ws.close(); goOffline(); } }, 4000);
  ws.onopen = () => send({ t: "hello", cid, nick: S.nick, look: badge.look() });
  ws.onmessage = (e) => {
    if (e.data === "pong" || e.data[0] === "s") return;
    const msg = JSON.parse(e.data);
    if (msg.t === "welcome") { welcomed = true; clearTimeout(giveUp); S.online = true; S.retries = 0; }
    handle(msg);
  };
  ws.onclose = (e) => {
    clearTimeout(giveUp);
    if (S.offline || S.ws !== ws) return;
    S.online = false;
    if (e.code === 4001 || S.replaced) { $("conn").textContent = t("다른 탭에서 접속해 이 탭은 끊겼습니다"); return; }
    // The server is busy (its hourly budget is spent) or closed us for flooding: play solo,
    // and do not knock again (every reconnect costs the shared free quota).
    if (e.code === 1013 || e.code === 1008) return goOffline(e.code === 1013 ? t("서버가 붐벼 혼자 모드로 진행합니다 (잠시 뒤 새로고침)") : null);
    if (!welcomed) return goOffline();
    setRole("viewer");
    // back off: 2, 4, 8 ... 60 s, then give up and play solo
    S.retries = (S.retries ?? 0) + 1;
    if (S.retries > 6) return goOffline(t("서버에 다시 연결하지 못해 혼자 모드로 진행합니다"));
    $("conn").textContent = t("연결 끊김, 다시 연결 중…");
    setTimeout(connect, Math.min(60000, 1000 * 2 ** S.retries));
  };
  // Keep-alive that the server answers without waking up.
  const ping = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); else clearInterval(ping); }, 30000);
}

function handle(msg) {
  switch (msg.t) {
    case "welcome":
      onRegistered(msg.nick);
      useLab(msg.lab, msg.characters);
      S.day = msg.day; setWorld(msg.world); S.notes = msg.notes; S.log = msg.log;
      S.pins = msg.pins ?? [];
      S.limits = msg.limits;
      S.lastTape = msg.tape ?? null;
      S.tier = msg.tier ?? 1; S.closed = !!msg.closed; S.archive = msg.archive ?? [];
      S.stage = msg.stage ?? 1; S.stages = msg.stages ?? 1; updateCamLabel();
      playTape(S.lastTape); // a newcomer first sees the last shift on tape
      ROOM.at = 0; // broadcasts may have been missed: the room's record is asked for again
      if (msg.banned) toast(t("이 브라우저는 출근과 쪽지 작성이 제한되었습니다"));
      break;
    case "sync": {
      useLab(msg.lab, msg.characters);
      S.day = msg.day; S.viewers = msg.viewers; S.shift = msg.shift; S.queue = msg.queue; S.queueLooks = msg.queueLooks ?? []; S.choosing = msg.choosing;
      S.tier = msg.tier ?? S.tier ?? 1; S.closed = !!msg.closed;
      if (msg.stage !== S.stage || msg.stages !== S.stages) { S.stage = msg.stage ?? 1; S.stages = msg.stages ?? 1; updateCamLabel(); }
      S.you = msg.you;
      S.skew = (msg.now ?? Date.now()) - Date.now();
      const was = S.role;
      const newShift = msg.shift && msg.shift.logId !== S.lastShiftId;
      S.lastShiftId = msg.shift?.logId ?? S.lastShiftId;
      setRole(msg.you.role);
      if (S.role === "offered" && was !== "offered") { Sound.play("alert"); turnAlert(); } // a record open while my turn comes
      if (S.role === "worker" && AR.live) closeArchive();
      if (newShift) { say(t("근무자 {id}번. {equip} 지급. {sec}초는 충분합니다. 통계적으로는요.", { id: msg.shift.logId, equip: CHAR[msg.shift.character].name, sec: Math.round((msg.shift.capAt - msg.shift.startedAt) / 1000) })); }
      if (S.role === "worker" && was !== "worker") { S.myLogId = msg.shift.logId; startWorking(); }
      break;
    }
    case "world":
      if (msg.day) S.day = msg.day;
      useLab(msg.lab);
      setWorld(msg.world);
      if (msg.reverted) { toast(t("현장이 이전 근무 시작 시점으로 되돌아갔습니다")); say(t("이의가 접수되었습니다. 직전 근무자의 결과는 무효입니다.")); }
      break;
    case "log.add":
      S.log.unshift(msg.entry); S.log.length = Math.min(S.log.length, 30);
      roomUpdate((r) => { if (msg.entry.day === r.run) r.shifts = r.shifts.filter((x) => x.id !== msg.entry.id).concat(msg.entry); });
      break;
    case "log.update":
      S.log = S.log.map((e) => (e.id === msg.entry.id ? msg.entry : e));
      roomUpdate((r) => { r.shifts = r.shifts.map((x) => (x.id === msg.entry.id ? msg.entry : x)); });
      break;
    case "notes": S.notes = msg.notes; break;
    case "pins": roomPins(S.pins, msg.pins); S.pins = msg.pins; renderControl(); break;
    case "room.tapes": openRoom(msg.room); break;
    case "archive.list": S.archive = msg.archive; break;
    case "archive": openArchive(msg.entry); break;
    case "tape": // a shift just ended: its recording goes out on the CCTV
      S.lastTape = msg.tape;
      roomUpdate((r) => { if (msg.tape.lab === r.lab && !r.tapes.some((x) => x.logId === msg.tape.logId)) r.tapes.push(msg.tape); });
      if (S.role !== "worker" || controlling()) playTape(msg.tape);
      break;
    case "stamp.left": S.stampsLeft = msg.left; renderControl(); break;
    case "note.add":
      S.notes = S.notes.filter((n) => n.id !== msg.note.id).concat(msg.note);
      roomUpdate((r) => { if (!r.notes.some((n) => n.id === msg.note.id)) r.notes.push({ ...msg.note, at: serverNow() }); });
      if (msg.note.logId === S.myLogId && msg.left !== undefined) {
        toast(msg.left > 0 ? t("쪽지를 붙였습니다. {n}장 더 쓸 수 있습니다", { n: msg.left }) : t("쪽지를 붙였습니다"));
        S.notesLeft = msg.left;
        if (S.handover) S.handover.left = msg.left;
        if (msg.left <= 0) { closeEditor(); $("write").hidden = true; } // this shift's note is used
      }
      break;
    case "note.update":
      S.notes = S.notes.map((n) => (n.id === msg.note.id ? msg.note : n));
      roomUpdate((r) => {
        const old = r.notes.find((n) => n.id === msg.note.id);
        if (!old) return;
        if ((old.stamp ?? null) !== (msg.note.stamp ?? null)) r.marks = [...(r.marks ?? []), { at: serverNow(), kind: "stamp", logId: S.shift?.logId ?? 0, note: old.id, stamp: msg.note.stamp ?? null }];
        Object.assign(old, msg.note);
      });
      if (S.detail?.ids.includes(msg.note.id)) renderDetail();
      break;
    case "note.remove":
      S.notes = S.notes.filter((n) => n.id !== msg.id);
      roomUpdate((r) => { r.notes = r.notes.filter((n) => n.id !== msg.id); });
      if (S.detail?.ids.includes(msg.id)) { // drop it from the pile on show
        const d = S.detail;
        d.ids = d.ids.filter((id) => id !== msg.id);
        d.i = Math.min(d.i, d.ids.length - 1);
        if (d.ids.length) renderDetail(); else closeDetail();
      }
      break;
    case "day.clear": roomGone(); showCredits(msg); S.secret = null; break;
    case "lab.next": {
      roomGone();
      const prevName = Lab.name;
      useLab(msg.lab);
      S.tier = msg.tier ?? 1;
      S.stage = msg.stage ?? stageOf(msg.lab); S.stages = msg.stages ?? stagesOf(msg.lab); updateCamLabel();
      const sameLab = labNo(msg.from) === labNo(msg.lab);
      say((sameLab
        ? t("{prev} 공정 {stage} 완료. 다음 공정은 다른 방입니다: {lab}.", { prev: prevName, stage: stageOf(msg.from), lab: Lab.name })
        : t("실험실 {from} 종료. 공정표(M)에 결재되었습니다. 실험실 {to}, {lab}.", { from: labNo(msg.from), to: labNo(msg.lab), lab: Lab.name })) +
        (S.tier > 1 ? " " + t("인력이 충원되어 검토 절차가 {n}단계로 늘었습니다.", { n: S.tier }) : ""));
      break;
    }
    case "lab.acted": { // a device answered (lab 1's stamps and card door)
      Sound.play(DENIED.has(msg.result) ? "deny" : "accept");
      const line = Lab.acted?.(msg.what, msg.result, S.world);
      if (line) say(line);
      break;
    }
    case "lab.called":
      if (msg.result === "not-held") toast(t("두 버튼이 동시에 눌리지 않았습니다"));
      break;
    case "closing": // the server is about to close us: busy, or too many messages. Play solo; do not knock again.
      S.ws = null;
      goOffline(msg.code === 1013 ? t("서버가 붐벼 혼자 모드로 진행합니다 (잠시 뒤 새로고침)") : t("요청이 너무 많아 연결이 끊겼습니다. 혼자 모드로 진행합니다"));
      return;
    case "replaced":
      S.replaced = true; S.online = false;
      setRole("viewer");
      $("conn").textContent = t("다른 탭에서 접속해 이 탭은 끊겼습니다");
      try { S.ws.close(); } catch { /* ignore */ }
      return;
    case "lab.secret": S.secret = { gen: msg.gen, code: msg.code, part: msg.part ?? null }; S.reading = null; break;
    case "lab.result":
      S.padBusy = false;
      Sound.play(msg.result === "open" || msg.result === "pass" ? "accept" : "deny");
      if (msg.result === "open" || msg.result === "already" || msg.result === "pass") closePad();
      else if (msg.result === "locked" || msg.result === "stale") { closePad(); toast(t("단말기가 잠겼습니다. 이번 근무에는 더 입력할 수 없습니다.")); }
      else if (S.pad) { S.pad = []; renderPad(); }
      break;
    case "kicked":
      toast({ idle: t("입력이 없어 자동 퇴근되었습니다"), timeup: t("근무 시간이 끝났습니다"), admin: t("관리자가 근무를 종료했습니다"), banned: t("이용이 제한되었습니다") }[msg.reason] ?? t("근무가 종료되었습니다"));
      if (msg.reason === "idle" || msg.reason === "timeup") beginHandover();
      break;
    case "reported": toast(t("신고가 접수되었습니다")); break;
    case "error":
      Sound.play("deny");
      toast(ERRORS[msg.code] ?? t("요청이 거부되었습니다: {code}", { code: msg.code }));
      if (msg.code === "rate-limited" || msg.code === "closed") ROOM.asked = 0;
      if (msg.code === "nick-required") openIntro();
      break;
  }
  renderPanels();
}

// ---------- offline solo mode: a tiny stand-in for the server ----------

const L = {
  shift: null, startWorld: null, startState: null, startEcho: null, logId: 0, noteId: 0, notesThisShift: 0,
  labId: FIRST, state: labFor(FIRST).local.newState(), echo: null, ring: [],
};
function goOffline(notice = null) {
  if (notice) toast(notice);
  if (S.offline) return;
  S.offline = true; S.online = false;
  try {
    const saved = JSON.parse(store.get("shift.solo") || "null");
    // ?lab=4 starts the offline run in that lab (for trying a lab out without a server)
    const want = Number(qs.get("lab"));
    if (ORDER.includes(want) && want !== saved?.labId) {
      L.labId = want; L.state = labFor(want).local.newState(); useLab(want);
    } else if (saved) {
      L.labId = ORDER.includes(saved.labId) ? saved.labId : FIRST;
      L.state = saved.state ?? saved.secret ?? labFor(L.labId).local.newState();
      L.echo = saved.echo ?? null;
      useLab(L.labId);
      setWorld(saved.world); S.day = saved.day;
      S.pins = Array.isArray(saved.pins) ? saved.pins : [];
      S.archive = Array.isArray(saved.filed) ? saved.filed : []; // the solo run's ledger
    }
  } catch { /* ignore */ }
  $("conn").textContent = t("오프라인 혼자 모드 (서버에 연결되지 않음)");
  localSync("viewer");
}
function localSync(role, extra = {}) {
  handle({ t: "sync", now: Date.now(), day: S.day, lab: L.labId, stage: stageOf(L.labId), stages: stagesOf(L.labId), characters: [...labFor(L.labId).characters, "control"], viewers: 1, shift: L.shift, queue: [], choosing: null, you: { role, ...extra } });
}
function localSave() { store.set("shift.solo", JSON.stringify({ world: S.world, day: S.day, labId: L.labId, state: L.state, echo: L.echo, pins: S.pins, filed: (S.archive ?? []).filter((r) => r.offline) })); }
/** Same rule as the server: the worker may not change the fields the puzzle depends on. */
function localWorld(world) {
  return { ...labFor(L.labId).local.publicWorld(world, L.state), echo: L.echo };
}
function localServer(msg) {
  if (typeof msg === "string") return;
  const nick = S.nick || t("근무자"); // offline only: this name never reaches the server
  switch (msg.t) {
    case "queue.join": return localSync("offered", { deadline: Date.now() + 3600e3 });
    case "queue.leave": return localSync("viewer");
    case "shift.start":
      if (msg.reject && L.startWorld) {
        L.state = structuredClone(L.startState); L.echo = L.startEcho;
        handle({ t: "pins", pins: L.startPins ?? [] });
        handle({ t: "world", world: structuredClone(L.startWorld), reverted: true });
      }
      L.startWorld = structuredClone(S.world); L.startState = structuredClone(L.state); L.startEcho = L.echo;
      L.startPins = structuredClone(S.pins);
      L.notesThisShift = 0; L.ring = []; L.stamped = new Set();
      L.shift = { logId: ++L.logId, nick, character: msg.character, startedAt: Date.now(), capAt: Date.now() + 60000 };
      return localSync("worker");
    case "checkpoint": handle({ t: "world", world: localWorld(msg.world) }); return localSave();
    case "lab.read": {
      const seen = L.shift && labFor(L.labId).local.read?.(L.state, L.shift.character);
      if (!seen) return;
      handle({ t: "lab.secret", gen: seen.gen, code: seen.code, part: seen.part });
      handle({ t: "world", world: localWorld(S.world) });
      return localSave();
    }
    case "lab.enter": {
      const rules = labFor(L.labId).local;
      if (L.shift?.character !== "key" || !rules.enter) return handle({ t: "lab.result", result: "bad" }); // never leave the pad waiting
      const result = rules.enter(L.state, msg.input);
      handle({ t: "lab.result", result });
      handle({ t: "world", world: localWorld(S.world) });
      return localSave();
    }
    case "lab.act": {
      const rules = labFor(L.labId).local;
      if (!L.shift || !rules.act) return;
      const result = rules.act(L.state, L.shift.character, msg.what, L.shift.logId);
      if (result === "bad") return handle({ t: "error", code: "cannot-act" });
      handle({ t: "lab.acted", what: msg.what, result });
      handle({ t: "world", world: localWorld(S.world) });
      return localSave();
    }
    case "lab.call": {
      if (!L.shift || L.labId !== 4) return;
      const result = callLift(L.state, S.world, S.p, L.echo, Date.now());
      handle({ t: "lab.called", result });
      if (result === "called") handle({ t: "world", world: localWorld(S.world) });
      return localSave();
    }
    case "note.react": return;
    case "pin.set": {
      const pin = cleanPin(msg);
      if (L.shift?.character !== "control" || !pin) return;
      handle({ t: "pins", pins: S.pins.filter((p) => p.n !== pin.n).concat({ ...pin, logId: L.shift.logId }).sort((a, b) => a.n - b.n) });
      return localSave();
    }
    case "pin.clear":
      if (L.shift?.character !== "control") return;
      handle({ t: "pins", pins: S.pins.filter((p) => p.n !== msg.n) });
      return localSave();
    case "note.stamp": {
      const note = S.notes.find((n) => n.id === msg.id);
      if (L.shift?.character !== "control" || !note) return;
      if (msg.stamp !== null && !L.stamped.has(note.id) && L.stamped.size >= STAMPS_PER_SHIFT) return handle({ t: "error", code: "stamp-limit" });
      if (msg.stamp === null) L.stamped.delete(note.id); else L.stamped.add(note.id);
      handle({ t: "note.update", note: { ...note, stamp: msg.stamp } });
      return handle({ t: "stamp.left", left: STAMPS_PER_SHIFT - L.stamped.size });
    }
    case "shift.end": {
      if (L.shift.character === "echo") L.echo = msg.echo ? { at: Date.now(), frames: msg.echo } : L.echo;
      labFor(L.labId).local.shiftEnded?.(L.state); // lab 2: a box still being carried goes back
      const world = localWorld(msg.world);
      const cleared = msg.cleared && labFor(L.labId).local.canClear(L.state, world);
      const entry = { id: L.shift.logId, day: S.day, nick, character: L.shift.character, startedAt: L.shift.startedAt, endedAt: Date.now(), reason: cleared ? "cleared" : msg.accident ? "accident" : msg.timeup ? "timeup" : "clockout", progress: msg.progress, rejected: false };
      L.shift = null;
      handle({ t: "world", world });
      handle({ t: "log.add", entry });
      if (cleared) {
        const from = L.labId, next = nextRoom(from);
        L.echo = null;
        const shifts = S.log.filter((e) => e.day === S.day).length; // solo: a rough count is enough
        S.archive = [...(S.archive ?? []), { id: `solo-${S.day}-${from}`, run: S.day, lab: from, shifts, accidents: S.log.filter((e) => e.day === S.day && e.reason === "accident").length, openedAt: L.openedAt ?? Date.now(), clearedAt: Date.now(), closer: nick, crew: [nick], people: 1, offline: true }];
        L.openedAt = Date.now();
        handle({ t: "archive.list", archive: S.archive });
        if (next !== undefined) {
          L.labId = next; L.state = labFor(next).local.newState();
          handle({ t: "lab.next", from, lab: next, stage: stageOf(next), stages: stagesOf(next) });
          handle({ t: "world", world: null, lab: next });
        } else {
          // solo play ends the same way: credits, then a fresh building for another go
          handle({ t: "day.clear", day: S.day, credits: S.log.filter((e) => e.day === S.day), closed: true });
          S.closed = false;
          L.labId = FIRST; L.state = labFor(FIRST).local.newState();
          handle({ t: "world", world: null, day: S.day + 1, lab: FIRST });
        }
        handle({ t: "notes", notes: [] });
        handle({ t: "pins", pins: [] });
      } else if (labFor(L.labId).local.forge) {
        // labs 5 and 5-2: the overseer's forged directive, rewritten after every shift (src/building.ts)
        const f = labFor(L.labId).local.forge(L.state, { logId: entry.id, character: entry.character });
        const mine = L.forgedPin;
        const own = (mine && S.pins.find((p) => p.n === mine.n && p.logId === mine.logId)) ?? S.pins.find((p) => p.logId === 0);
        const n = own?.n ?? [3, 2, 1].find((k) => !S.pins.some((p) => p.n === k));
        if (n !== undefined) {
          const pin = { n, x: f.x, y: f.y, msg: f.msg, logId: f.logId ?? 0 };
          L.forgedPin = { n, logId: pin.logId };
          handle({ t: "pins", pins: S.pins.filter((p) => p.n !== n).concat(pin).sort((a, b) => a.n - b.n) });
        }
      }
      localSave();
      return localSync("viewer");
    }
    case "note.add":
      if (L.notesThisShift >= S.limits.notesPerShift) return;
      L.notesThisShift++;
      return handle({ t: "note.add", left: S.limits.notesPerShift - L.notesThisShift, note: { id: ++L.noteId, logId: S.myLogId, nick, character: S.log[0]?.character ?? "key", x: msg.x, y: msg.y, strokes: msg.strokes, blurred: false, help: 0, funny: 0 } });
    case "report": if (msg.kind === "note") handle({ t: "note.remove", id: msg.id }); return;
  }
}

// ---------- role and panels ----------

function setRole(role) {
  const was = S.role;
  S.role = role;
  if (role !== was) S.ending = false;
  $("write").hidden = role !== "worker";
  $("join").hidden = role !== "viewer";
  $("who").hidden = role === "worker";
  $("leave").hidden = role !== "queued" && role !== "offered";
  $("end").hidden = role !== "worker";
  $("offer").hidden = role !== "offered";
  if (role === "offered") $("rejectRow").hidden = !S.log.some((e) => e.day === S.day && !e.rejected);
  if (role === "worker" && was !== "worker") { closeEditor(); $("reject").checked = false; S.notesLeft = S.limits.notesPerShift; }
  renderControl();
}

/** True while this player is working the controller shift (at the console, no body). */
const controlling = () => S.role === "worker" && S.shift?.character === "control";

function renderPanels() {
  $("join").hidden = S.role !== "viewer" || !!S.closed;
  renderArchiveList();
  renderRunMap();
  if (S.online) $("conn").textContent = t("연결됨");
  $("conn").classList.toggle("on", S.online);
  $("dayLabel").textContent = t("실험 {n}회차", { n: S.day });
  $("viewers").textContent = S.viewers;
  const status = {
    viewer: S.closed ? t("건물 폐쇄 · 기록 열람만") : S.shift ? t("관전 중") : t("근무자가 없습니다"),
    queued: t("출근 대기 {n}번째", { n: S.you.pos }),
    offered: t("내 차례! 장비를 고르세요"),
    worker: t("근무 중 · {equip}", { equip: CHAR[S.shift?.character]?.name ?? "" }),
  }[S.role];
  $("status").textContent = status;
  $("shiftLabel").textContent = S.shift
    ? `${showNick(S.shift.nick)} · ${CHAR[S.shift.character]?.name ?? S.shift.character}`
    : S.choosing ? t("{nick} 님이 출근 준비 중", { nick: showNick(S.choosing) }) : t("근무자 없음");
  $("queue").replaceChildren(...(S.queue.length ? S.queue : [t("(없음)")]).map((n, i) => {
    const li = document.createElement("li");
    li.textContent = S.queue.length ? `${i + 1}. ${showNick(n)}` : n;
    if (S.queue.length) li.prepend(faceCanvas(S.queueLooks?.[i] ?? ""));
    return li;
  }));
  $("log").replaceChildren(...S.log.map((e) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = t("{day}회차 · #{id} {nick} · {equip} · 진행 {progress}", { day: e.day, id: e.id, nick: showNick(e.nick), equip: CHAR[e.character]?.name ?? e.character, progress: e.progress }) + (e.rejected ? " · " + t("인수 거부됨") : "");
    text.prepend(faceCanvas(e.look ?? ""));
    const right = document.createElement("span");
    const why = document.createElement("small");
    why.textContent = (REASON[e.reason] ?? e.reason ?? "") + " ";
    const btn = document.createElement("button");
    btn.className = "link"; btn.textContent = t("신고"); btn.title = t("닉네임 신고");
    btn.onclick = () => send({ t: "report", kind: "nick", id: e.id });
    right.append(why, btn);
    li.append(text, right);
    return li;
  }));
}

function toast(text) {
  const el = $("toast");
  el.textContent = text; el.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("on"), 2500);
}

// ---------- the room ----------

/** Switches to the lab the server says the run is in. */
function useLab(id, characters) {
  if (characters) S.characters = characters;
  if (id != null && id !== S.labId) {
    S.labId = id;
    Lab = labFor(id);
    S.world = Lab.fresh();
    S.worldKnown = false;
    S.secret = null;
    if (!characters) S.characters = Lab.characters;
    updateCamLabel();
  }
  renderOffer();
}

/** Takes a world from the server (or null for a fresh run) and narrates what changed. */
function setWorld(next) {
  const prev = S.world;
  S.worldKnown = !!(next && next.lab === Lab.id);
  S.world = Lab.ensure(next);
  if (prev && S.worldKnown && prev.lab === S.world.lab) {
    narrate(prev, S.world);
    if ((S.world.lever && !prev.lever) || (S.world.out && !prev.out)) celebrate(); // everyone watching sees it too
  }
}

/**
 * A room cleared: a beat of hit-stop, the room's lights pulse green and the camera takes a knock
 * (render3d.js), a white flash, and the approval seal slams down with what was approved.
 * Once per clear, whoever triggers it first (the worker's own lever, or the world from the server).
 */
let lastCheer = 0;
/**
 * The room's side of a clear, drawn on the overlay (after the palette pass, so the green survives):
 * a green wash that pulses three times, a scan band sweeping down the room, and a ring bursting
 * out from the lever (or the exit, or the worker).
 */
function drawCheer(ctx, actor) {
  const t = (performance.now() - lastCheer) / 1900;
  if (!lastCheer || t >= 1) return;
  const pulse = (1 - t) * (0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * 3)));
  ctx.save();
  ctx.fillStyle = `rgba(91,255,138,${0.16 * pulse})`;
  ctx.fillRect(0, 0, Lab.W, Lab.H);
  const band = t * (Lab.H + 60) - 30;
  const grad = ctx.createLinearGradient(0, band - 30, 0, band + 30);
  grad.addColorStop(0, "rgba(91,255,138,0)"); grad.addColorStop(0.5, `rgba(160,255,190,${0.45 * (1 - t)})`); grad.addColorStop(1, "rgba(91,255,138,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, band - 30, Lab.W, 60);
  const at = Lab.LEVER ?? (Lab.OUT_X ? { x: Lab.OUT_X, y: Lab.SPAWN.y } : actor) ?? { x: Lab.W / 2, y: Lab.H / 2 };
  for (const k of [0, 0.18]) {
    const r = Math.max(0, t - k) * 260;
    if (r <= 0) continue;
    ctx.strokeStyle = `rgba(180,255,200,${Math.max(0, 0.8 - (t - k) * 1.2)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(at.x, at.y - 10, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function celebrate() {
  if (performance.now() - lastCheer < 4000) return;
  lastCheer = performance.now();
  Sound.play("clear");
  const final = nextRoom(Lab.id) === undefined;
  const stage = stageOf(Lab.id), stages = S.stages ?? stagesOf(Lab.id);
  $("clearSeal").textContent = final ? t("퇴근") : t("승인");
  $("clearSealSub").textContent = final ? t("인수인계 완료") : stages > 1 ? t("공정 {stage}/{stages}", { stage, stages }) : t("실험 종료");
  const room = { code: roomCode(Lab.id), lab: Lab.name, stage };
  $("clearLabel").textContent = final ? t("LAB {code} {lab} · 감독관 결재 완료", room)
    : stage < stages ? t("LAB {code} {lab} · 공정 {stage} 완료 · 다음 공정으로", room)
    : t("LAB {code} {lab} · 실험실 종료", room);
  S.hitstop = performance.now() + 160;
  r3d?.celebrate(1900);
  const stageEl = $("stage"), stamp = $("clearStamp");
  stageEl.classList.remove("cleared"); void stageEl.offsetWidth; stageEl.classList.add("cleared");
  setTimeout(() => stageEl.classList.remove("cleared"), 450);
  stamp.classList.remove("out"); stamp.hidden = true; void stamp.offsetWidth; stamp.hidden = false; // restart the animations
  clearTimeout(celebrate.timer); clearTimeout(celebrate.hide);
  celebrate.timer = setTimeout(() => stamp.classList.add("out"), 2300);
  celebrate.hide = setTimeout(() => { stamp.hidden = true; stamp.classList.remove("out"); }, 2850);
}

function narrate(prev, next) {
  if (Lab.mood?.(prev, next) && !next.lever && !next.out) Sound.play("progress"); // the clear has its own
  const line = Lab.narrate(prev, next);
  if (line) say(line);
}

const serverNow = () => Date.now() + S.skew;

/** What a lab's use() and tick() get to work with. */
function labApi() {
  return {
    world: S.world, p: S.p, character: S.shift.character, logId: S.shift.logId, now: serverNow(),
    secret: S.secret, reading: S.reading, setReading: (gen) => { S.reading = gen; },
    say, send, openPad,
    change(fn) { const prev = structuredClone(S.world); fn(S.world); commit(prev); },
    pullLever() {
      if (S.world.lever) return;
      const prev = structuredClone(S.world);
      S.world.lever = true;
      commit(prev);
      celebrate();
      setTimeout(() => clockOut(true), 1600); // let the stamp land before the room changes
    },
    leave, // lab 9: walked out of the building
    sound: (name) => Sound.play(name), // a lab's own effects (lab 6: grates)
    act: (what) => { lastSent = Date.now(); send({ t: "lab.act", what }); }, // a device that answers to the equipment (the server counts it like a checkpoint)
  };
}

/**
 * The last lab: the worker walked out through the open exit. Before the shift ends they leave
 * one last drawing, addressed to the overseer this time; then the building closes.
 */
function leave() {
  if (S.ending || S.farewell) return;
  const prev = structuredClone(S.world);
  S.world.out = true;
  commit(prev);
  celebrate();
  S.farewell = true;
  const until = Math.min(S.shift.capAt - S.skew - 1500, Date.now() + 30000); // the server ends the shift at capAt
  if (S.notesLeft <= 0 || until - Date.now() < 3000) { setTimeout(farewellDone, 1500); return; }
  openEditor(until);
  $("editorWhy").textContent = t("감독관에게 남길 마지막 쪽지입니다. 말 대신 그림으로. 다 그렸으면 붙이세요. 그러면 퇴근입니다.");
}
function farewellDone() {
  if (!S.farewell) return;
  S.farewell = false;
  closeEditor();
  clockOut(true);
}

function say(text) {
  Sound.play("voice", text);
  $("ai").textContent = text;
  $("ai").hidden = false;
  S.aiUntil = Date.now() + 8000;
}

function startWorking() {
  Sound.play("clockin");
  L.ring = []; // a fresh echo recording for this shift
  S.tape = []; S.tapeT = -1; // and a fresh CCTV tape
  S.play = null; // the worker watches the room itself, not the last tape
  if (S.shift.character === "control") {
    S.tool = null; S.stampsLeft = STAMPS_PER_SHIFT; S.ending = false;
    renderControl();
    setTimeout(() => say(t("관제석입니다. 번호 핀 {pins}개와 도장 {stamps}개가 지급됩니다. 지시문은 정해진 양식으로만 작성하십시오.", { pins: PINS, stamps: STAMPS_PER_SHIFT })), 800);
    return;
  }
  showHint();
  S.p = Lab.newPlayer();
  S.ending = false;
  S.reading = null;
  if (!S.worldKnown) { S.world = Lab.fresh(); S.worldKnown = true; send({ t: "checkpoint", world: S.world }); }
  const c = S.shift.character;
  if (c === "echo") setTimeout(() => say(t("기록 중입니다. 퇴근하기 전 마지막 8초가 이 방에 남습니다.")), 2500);
  else if (Lab.useless(S.world, c)) setTimeout(() => say(t("흥미로운 선택입니다. 기록하겠습니다.")), 2500);
  // the first shift on this browser: say once how notes work, after the player has looked around
  if (!store.get("shift.toldNotes")) {
    const id = S.shift.logId;
    setTimeout(() => {
      if (S.role !== "worker" || S.ending || S.handover || S.shift?.logId !== id) return;
      say(t("인수인계 쪽지는 N 키로 남깁니다. 다음 근무자가 이 자리에서 봅니다."));
      store.set("shift.toldNotes", "1");
    }, 12000);
  }
}

/** Shares a change the worker made to the world. */
function commit(prev) {
  narrate(prev, S.world);
  sendCheckpoint();
}
// The server takes one checkpoint (or device action) per 300 ms and drops the rest. Changes that
// come faster (lab 6: a running worker steps on a grate every 230 ms) wait and go out together.
let lastSent = 0, trailing = null;
function sendCheckpoint() {
  const wait = lastSent + 320 - Date.now();
  if (wait > 0) {
    trailing ??= setTimeout(() => { trailing = null; sendCheckpoint(); }, wait);
    return;
  }
  lastSent = Date.now();
  send({ t: "checkpoint", world: S.world });
}

const keys = new Set();
let jumpQueued = false, lastInput = 0;
const TAPE_MAX = 700; // frames per tape; the server takes no more
const JUMP = ["ArrowUp", " ", "w", "W", "z", "Z"], USE = ["ArrowDown", "e", "E", "s", "S", "x", "X"];
// results of a device that mean "no" (the rest mean "accepted")
const DENIED = new Set(["bad", "order", "already", "refused", "locked", "stale", "wrong", "sealed", "no-power", "not-held", "busy", "blocked", "buried", "jammed", "limit", "lost"]);
// browsers start audio only on a gesture: the first key or click does it
addEventListener("pointerdown", () => Sound.unlock(), { capture: true });
function updateSoundBtn() { $("soundBtn").textContent = Sound.isMuted() ? t("소리 끔") : t("소리"); }
$("soundBtn").onclick = () => { Sound.unlock(); Sound.setMuted(!Sound.isMuted()); updateSoundBtn(); };
updateSoundBtn();

addEventListener("keydown", (e) => {
  Sound.unlock();
  const typing = e.target.tagName === "INPUT" || e.target.tagName === "SELECT";
  if (e.key === "Tab" && !typing) { e.preventDefault(); toggleDrawer(); return; }
  if (e.code === "KeyV" && !e.repeat && !typing && (S.role !== "worker" || controlling())) { toggleBigCam(); return; }
  if (e.code === "KeyM" && !e.repeat && !typing && !S.pad && !S.handover) { toggleRunMap(); return; }
  if (typing) return;
  if (e.key === "Escape" && controlling()) { S.tool = null; closePhrase(); renderControl(); return; }
  if (e.code === "KeyN" && !e.repeat && !S.pad) { e.preventDefault(); writeNote(); return; }
  if (S.role === "worker") fadeHint();
  lastInput = performance.now();
  if (S.pad) return padKey(e);
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (!e.repeat && JUMP.includes(e.key)) jumpQueued = true;
  if (!e.repeat && USE.includes(e.key)) interact();
  keys.add(e.key);
});
addEventListener("keyup", (e) => keys.delete(e.key));
addEventListener("blur", () => keys.clear());
addEventListener("pointerdown", () => { lastInput = performance.now(); });

function interact() {
  if (S.role !== "worker" || S.ending || controlling()) return;
  Lab.use(labApi());
}

/** An industrial accident: a trap caught the worker. The shift ends here and the room stays as it is. */
function accident(trap) {
  if (S.ending) return;
  S.tape.push([Math.floor((serverNow() - S.shift.startedAt) / 100) + 1, Math.round(S.p.x), Math.round(S.p.y), S.p.face < 0 ? -1 : 1]);
  Sound.play("zap");
  $("stage").classList.add("accident");
  setTimeout(() => $("stage").classList.remove("accident"), 700);
  say(trap.hidden
    // the system never knew this one was there
    ? t("산재 발생. 원인은 기록되지 않았습니다. 근무자 {id}번을 즉시 퇴근 처리합니다. 다음 근무자에게 알릴지는 당신의 몫입니다.", { id: S.shift.logId })
    : t("산재 발생: {trap}. 근무자 {id}번을 즉시 퇴근 처리합니다. 현장은 그대로 인계됩니다.", { trap: tr(Lab.TRAP_NAME[trap.kind]) ?? t("함정"), id: S.shift.logId }));
  clockOut(false, false, trap.kind);
}

function clockOut(cleared = false, timeup = false, accidentKind = null) {
  if (S.role !== "worker" || S.ending) return;
  if (Lab.finished?.(S.world)) cleared = true; // the work is done even if the clock ran out on the last drawing
  S.ending = true; S.farewell = false;
  // notes written after clocking out stick here (a controller has no body: the entrance)
  S.lastSpot = controlling() ? { ...Lab.SPAWN } : { x: S.p.x, y: S.p.y };
  closePad();
  closePhrase();
  if (S.handover) postDrawing(); // a drawing in progress goes up before the shift ends
  const echo = S.shift.character === "echo" ? recordEcho(L.ring, Date.now())?.frames : undefined;
  const tape = controlling() || !S.tape.length ? undefined : { frames: S.tape };
  send({ t: "shift.end", world: S.world, progress: Lab.progress(S.world), cleared, timeup, echo, tape, accident: accidentKind ?? undefined });
  if (!cleared && !accidentKind) Sound.play("clockout");
  if (!cleared) beginHandover();
}

function tick(dt) {
  archiveTick(dt);
  if (performance.now() < (S.hitstop ?? 0)) return; // the beat after a clear: everything holds still
  if (S.role === "worker" && !S.ending && !controlling()) {
    const input = {
      left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
      right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
      jumpPressed: jumpQueued,
      jumpHeld: JUMP.some((k) => keys.has(k)),
    };
    jumpQueued = false;
    if (S.pad || S.farewell) input.left = input.right = input.jumpPressed = input.jumpHeld = false;
    const wasGround = S.p.ground, wasVy = S.p.vy;
    Lab.step(S.world, S.p, input, S.shift.character, dt, serverNow());
    if (wasGround && !S.p.ground && S.p.vy < -100) Sound.play("jump");
    else if (!wasGround && S.p.ground && wasVy > 160) Sound.play("land");
    if (S.p.y > Lab.H + 40) S.p = Lab.newPlayer(); // fell out of the map somehow
    Lab.tick?.(labApi());
    if (S.shift.character === "echo") {
      // the echo recorder keeps its own last 8 seconds and hands them in when it clocks out
      const t = Date.now();
      L.ring.push({ t, x: S.p.x, y: S.p.y, f: S.p.face });
      while (L.ring.length > 1 && L.ring[1].t < t - 8000) L.ring.shift();
    }
    // The CCTV tape: one frame per tenth of a second, handed in once at clock-out (not streamed).
    const t = Math.floor((serverNow() - S.shift.startedAt) / 100);
    if (t !== S.tapeT && S.tape.length < TAPE_MAX) {
      S.tape.push([t, Math.round(S.p.x), Math.round(S.p.y), S.p.face < 0 ? -1 : 1]);
      S.tapeT = t;
    }
    // traps: touching an active one ends the shift on the spot (산재)
    const trap = Lab.trapHit(Lab, S.p, serverNow(), S.world);
    if (trap) accident(trap);
  }
  if (S.role === "offered") {
    const left = Math.max(0, Math.min(S.limits.offerMs, S.you.deadline - Date.now()));
    $("offerLeft").textContent = S.offline ? "" : t("({n}초)", { n: Math.ceil(left / 1000) });
  }
  if (S.shift?.capAt) {
    const left = Math.max(0, S.shift.capAt - (Date.now() + S.skew));
    $("timer").textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
    $("timer").classList.toggle("low", left < 10000);
    const sec = Math.ceil(left / 1000);
    if (S.role === "worker" && left < 10000 && left > 0 && sec !== S.lastTick) { S.lastTick = sec; Sound.play("tick"); }
    if (S.role === "worker" && left <= 0) clockOut(false, true); // the server enforces this too
  } else $("timer").textContent = "";
  if (S.handover) {
    const left = S.handover.until - Date.now();
    $("editorLeft").textContent = t("{n}초 남음", { n: Math.max(0, Math.ceil(left / 1000)) });
    $("notesLeft").textContent = S.handover.left;
    if (left <= 0) { postDrawing(); closeEditor(); if (S.farewell) farewellDone(); }
  }
  if (S.aiUntil && Date.now() > S.aiUntil) { $("ai").hidden = true; S.aiUntil = 0; }
}

// ---------- terminal keypad ----------

function openPad() {
  S.pad = [];
  $("keypad").hidden = false;
  renderPad();
}
function closePad() { S.pad = null; S.padBusy = false; $("keypad").hidden = true; }
function padKey(e) {
  e.preventDefault();
  if (e.key >= "1" && e.key <= String(Glyphs.GLYPH_COUNT)) padPress(Number(e.key) - 1);
  else if (e.key === "Backspace") { S.pad.pop(); renderPad(); }
  else if (e.key === "Escape" || USE.includes(e.key)) closePad();
}
// Each lab's terminal says how many glyphs it wants and how many tries are left (lab3 by default).
const padLength = () => Lab.padLength?.(S.world) ?? Glyphs.CODE_LENGTH;
const padTries = () => (Lab.padTries ? Lab.padTries(S.world) : t("{n}회", { n: Glyphs.MAX_TRIES - (S.world.tries ?? 0) }));
function padPress(glyph) {
  if (!S.pad || S.padBusy || S.ending) return;
  Sound.play("key");
  S.pad.push(glyph);
  renderPad();
  if (S.pad.length < padLength()) return;
  S.padBusy = true; // the server judges the code and answers with lab.result
  send({ t: "lab.enter", input: [...S.pad] });
}
function renderPad() {
  const n = padLength();
  $("padTitle").textContent = t("단말기 · 기호 {n}개를 순서대로 · 남은 시도 {tries}", { n, tries: padTries() });
  const cv = $("entry"), w = 8 + n * 46;
  if (cv.width !== w) { cv.width = w; cv.style.width = `calc(var(--u) * ${w * 0.75})`; }
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < n; i++) {
    c.strokeStyle = "#343a46"; c.strokeRect(8.5 + i * 46, 6.5, 36, 36);
    if (S.pad && i < S.pad.length) Glyphs.drawGlyph(c, S.pad[i], 26.5 + i * 46, 24.5, 22, "#e6e8ec", 2.5);
  }
}
$("glyphKeys").replaceChildren(...Array.from({ length: Glyphs.GLYPH_COUNT }, (_, glyph) => {
  const b = document.createElement("button");
  b.className = "glyph"; b.setAttribute("aria-label", t("기호 {n}", { n: glyph + 1 }));
  const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
  Glyphs.drawGlyph(cv.getContext("2d"), glyph, 16, 16, 20, "#e6e8ec", 2.5);
  const n = document.createElement("small"); n.textContent = glyph + 1;
  b.append(cv, n);
  b.onclick = () => padPress(glyph);
  return b;
}));
$("keyBack").onclick = () => { S.pad?.pop(); renderPad(); };
$("keyClose").onclick = closePad;

// ---------- drawing ----------

const view = $("view"), g = view.getContext("2d");
const NOTE_W = 30, NOTE_H = 20; // post-it size on screen; hover shows it large
const noteBox = (n) => ({ x: Math.round(n.x - NOTE_W / 2), y: Math.round(n.y - 56), w: NOTE_W, h: NOTE_H });

function drawStrokes(ctx, strokes, scale, ox = 0, oy = 0) {
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = Math.max(1, scale);
  for (const s of strokes) {
    ctx.strokeStyle = ctx.fillStyle = INK[s.c];
    ctx.beginPath();
    ctx.moveTo(ox + s.p[0] * scale, oy + s.p[1] * scale);
    for (let i = 2; i < s.p.length; i += 2) ctx.lineTo(ox + s.p[i] * scale, oy + s.p[i + 1] * scale);
    if (s.p.length === 2) ctx.lineTo(ox + s.p[0] * scale + 0.01, oy + s.p[1] * scale);
    ctx.stroke();
  }
}

// The worker's camera follows them up close; the CCTV shows the whole room.
const WORKER_ZOOM = 2.4;
const cam = { x: Lab.W / 2, y: Lab.H / 2, zoom: 1 };
function updateCamera(actor, cctv, dt) {
  const zoom = cctv || !actor ? 1 : WORKER_ZOOM;
  const tx = actor && !cctv ? actor.x : Lab.W / 2, ty = actor && !cctv ? actor.y - Lab.P.h : Lab.H / 2;
  const k = Math.min(1, dt * 6);
  cam.zoom += (zoom - cam.zoom) * k;
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  // never show outside the room
  const hw = Lab.W / 2 / cam.zoom, hh = Lab.H / 2 / cam.zoom;
  cam.x = Math.min(Lab.W - hw, Math.max(hw, cam.x));
  cam.y = Math.min(Lab.H - hh, Math.max(hh, cam.y));
}
/** The camera actually drawn: in pixel mode, snapped to whole render pixels like the 3D camera. */
const shot = { x: Lab.W / 2, y: Lab.H / 2, zoom: 1 };
function snapView() {
  shot.zoom = cam.zoom;
  const step = r3d?.pixel ? r3d.pixel / cam.zoom : 0; // one render pixel, in world pixels
  shot.x = step ? Math.round(cam.x / step) * step : cam.x;
  shot.y = step ? Math.round(cam.y / step) * step : cam.y;
}
/** World pixels to overlay pixels, matching what the 3D camera shows on the z = 0 plane. */
function applyCamera(ctx, scale = 1) {
  const z = shot.zoom * scale;
  ctx.setTransform(z, 0, 0, z, (Lab.W / 2 - shot.x * shot.zoom) * scale, (Lab.H / 2 - shot.y * shot.zoom) * scale);
}
// ---------- the two views ----------
// White collar (anyone not working): the control console, a flat blueprint with the live
// 3D room shrunk into a CCTV window (V swaps to the full CCTV). Blue collar (the worker):
// the 3D room from close behind their shoulder. See docs/two-views.md.

const consoleCanvas = $("console"), cg = consoleCanvas.getContext("2d");
// darkness, glyphs, notes and labels in world pixels, shown on the 3D play plane. It is redrawn
// and uploaded to the GPU every frame, so it is only as sharp as the 3D view can show: 1x under
// pixel rendering (the 3D view is 320 x 176 then), 2x in the smooth view.
const OVERLAY_SCALE = r3d?.pixel ? 1 : 2;
const overlay = document.createElement("canvas");
overlay.width = Lab.W * OVERLAY_SCALE;
overlay.height = Lab.H * OVERLAY_SCALE;
const og = overlay.getContext("2d");
let consoleSince = 0;

function toggleBigCam() {
  S.bigCam = !S.bigCam;
  $("viewBtn").textContent = S.bigCam ? t("도면 (V)") : "CCTV (V)";
}
$("viewBtn").onclick = toggleBigCam;

function updateCamLabel() {
  const stage = S.stages > 1 ? " · " + t("공정 {stage}/{stages}", { stage: S.stage, stages: S.stages }) : "";
  $("cam").textContent = (draw.console ? t("관제 · LAB {code} {lab}", { code: roomCode(Lab.id), lab: Lab.name }) + stage : `CAM-${roomCode(Lab.id)} · LAB ${roomCode(Lab.id)}${stage}`) + (updateHud.cam ?? "");
}

/**
 * Notes stuck at about the same spot (workers clock out in the same places) form one pile:
 * [{ x, y, notes: newest first }]. Recomputed only when the note list changes.
 */
let pileCache = { notes: null, piles: [] };
function notePiles() {
  if (pileCache.notes === S.notes) return pileCache.piles;
  const piles = [];
  for (const n of [...S.notes].sort((a, b) => a.id - b.id)) {
    const p = piles.find((p) => Math.abs(p.x - n.x) < NOTE_W && Math.abs(p.y - n.y) < NOTE_H + 4);
    if (p) p.notes.unshift(n);
    else piles.push({ x: n.x, y: n.y, notes: [n] });
  }
  pileCache = { notes: S.notes, piles };
  return piles;
}

function drawNotes(ctx) {
  for (const pile of notePiles()) {
    const n = pile.notes[0], b = noteBox(pile), hot = S.peekId === n.id, count = pile.notes.length;
    ctx.strokeStyle = "#0009"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pile.x + 0.5, b.y + b.h); ctx.lineTo(pile.x + 0.5, pile.y - 26); ctx.stroke();
    // older sheets peek out underneath, up and to the right
    for (let i = Math.min(count, 3) - 1; i >= 1; i--) {
      ctx.fillStyle = "#e3d9bd"; ctx.fillRect(b.x + i * 2, b.y - i * 2, b.w, b.h);
      ctx.strokeStyle = "#00000066"; ctx.lineWidth = 1; ctx.strokeRect(b.x + i * 2 + 0.5, b.y - i * 2 + 0.5, b.w - 1, b.h - 1);
    }
    ctx.fillStyle = n.blurred ? "#777" : "#f4ecd0"; ctx.fillRect(b.x, b.y, b.w, b.h);
    if (!n.blurred) drawStrokes(ctx, n.strokes, NOTE_W / 96, b.x, b.y);
    ctx.strokeStyle = hot ? "#e8b830" : "#00000055"; ctx.lineWidth = hot ? 2 : 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = "#d03a3a"; ctx.fillRect(b.x + b.w / 2 - 1, b.y - 1, 3, 3); // pin
    if (STAMPS[n.stamp]) drawStamp(ctx, n.stamp, b.x + b.w / 2, b.y + b.h / 2, (n.id % 5) * 0.03 - 0.12, 0.5);
    if (count > 1) { // how many sheets are in the pile
      const label = String(count), bx = b.x + b.w - 3, by = b.y - 7;
      ctx.font = `8px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center";
      const w = Math.max(10, Math.ceil(ctx.measureText(label).width) + 5);
      ctx.fillStyle = "#1e1e1c"; ctx.fillRect(bx - w / 2, by - 1, w, 10);
      ctx.fillStyle = "#e9e4d6"; ctx.fillText(label, bx, by + 7);
    }
  }
}

/**
 * A controller's stamp, in seal-red ink, told apart by shape: 확인됨 a double ring, 틀림 a box
 * with a cross, 오래됨 a dashed box. Slightly crooked, as stamps are. size 1 is the 40 px stamp.
 */
function drawStamp(ctx, kind, x, y, tilt, size = 1) {
  const st = STAMPS[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(size, size);
  ctx.strokeStyle = ctx.fillStyle = st.color;
  ctx.lineWidth = 2;
  if (st.shape === "circle") {
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
  } else if (st.shape === "cross") {
    ctx.strokeRect(-20, -11, 40, 22);
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-20, -11); ctx.lineTo(20, 11); ctx.moveTo(20, -11); ctx.lineTo(-20, 11); ctx.stroke();
  } else {
    ctx.setLineDash([4, 3]); ctx.strokeRect(-20, -11, 40, 22); ctx.setLineDash([]);
  }
  ctx.font = `bold 12px Galmuri11, ${FONT_FALLBACK}`; ctx.textAlign = "center";
  const label = tr(st.label);
  ctx.fillStyle = "#e9e4d6cc"; const w = ctx.measureText(label).width + 4; ctx.fillRect(-w / 2, -7, w, 12);
  ctx.fillStyle = st.color; ctx.fillText(label, 0, 4);
  ctx.restore();
}

/**
 * The controllers' numbered pins: paint on the floor with a number post. The directive shows
 * on the console, on the CCTV, and in the field only when the worker stands near it.
 * pending: the spot the controller is about to pin (drawn as an outline).
 */
function drawPins(ctx, { actor = null, all = false, pending = null, noText = false, place = null } = {}) {
  // place: maps a world point to where it is drawn (the console sheet); otherwise world pixels
  const at = place ?? ((x, y) => ({ x, y }));
  ctx.save();
  for (const p of S.pins) {
    if (pending && pending.n === p.n) continue; // being moved
    const q = at(p.x, p.y);
    drawSign(ctx, Math.round(q.x), Math.round(q.y), p.n, signFor(p.msg), false);
    const text = phraseText(p.msg);
    if (!text) continue;
    const near = all || pinNear(actor, p);
    if (!near) { ctx.fillStyle = "#1e1e1c"; ctx.fillRect(Math.round(q.x) + 8, Math.round(q.y) - 16, 2, 2); ctx.fillRect(Math.round(q.x) + 11, Math.round(q.y) - 16, 2, 2); continue; }
    if (!noText) drawDirective(ctx, pinLabel(p, text), q.x, q.y - 22, place ? 640 : Lab.W, !p.logId);
  }
  if (pending) { const q = at(pending.x, pending.y); drawSign(ctx, Math.round(q.x), Math.round(q.y), pending.n, "plain", true); }
  ctx.restore();
}

/** A pin as a safety sign on a short post, standing on the floor at (x, y). */
function drawSign(ctx, x, y, n, kind, ghost) {
  const s = SIGNS[kind] ?? SIGNS.plain;
  ctx.globalAlpha = ghost ? 0.5 : 1;
  ctx.fillStyle = "#1e1e1c";
  ctx.fillRect(x - 6, y - 1, 13, 1); // foot
  ctx.fillRect(x, y - 7, 1, 7); // post
  const cy = y - 13;
  ctx.fillStyle = s.color; ctx.strokeStyle = "#1e1e1c"; ctx.lineWidth = 1;
  ctx.beginPath();
  if (kind === "warn") { ctx.moveTo(x + 0.5, cy - 7); ctx.lineTo(x + 7.5, cy + 6); ctx.lineTo(x - 6.5, cy + 6); ctx.closePath(); }
  else if (kind === "info") ctx.rect(x - 6, cy - 6, 13, 13);
  else ctx.arc(x + 0.5, cy + 0.5, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (kind === "prohibit") { // a ring with a bar: white face, red ring
    ctx.fillStyle = "#f4ecd8"; ctx.beginPath(); ctx.arc(x + 0.5, cy + 0.5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 2.5, cy - 2.5); ctx.lineTo(x + 3.5, cy + 3.5); ctx.stroke();
  }
  ctx.font = `8px Galmuri7, ${FONT_FALLBACK}`; ctx.textAlign = "center";
  ctx.fillStyle = kind === "prohibit" ? "#1e1e1c" : s.ink;
  ctx.fillText(String(n), x + 1, cy + (kind === "warn" ? 5 : 4));
  ctx.globalAlpha = 1;
}

/** "① text · 서명 #12": a controller's directive is signed with its shift number. The overseer's (logId 0) is not. */
const pinLabel = (p, text) => `${"①②③"[p.n - 1] ?? p.n} ${text}${p.logId ? " · " + t("서명 #{id}", { id: p.logId }) : ""}`;

/** A directive as a printed label: paper, ink, a 1 px rule. Never a glow. unsigned: a paper a shade off. */
function drawDirective(ctx, label, cx, by, maxW, unsigned = false) {
  ctx.font = `10px Galmuri9, ${FONT_FALLBACK}`; ctx.textAlign = "center";
  const w = Math.ceil(ctx.measureText(label).width) + 10, x = Math.round(Math.max(w / 2 + 2, Math.min(maxW - w / 2 - 2, cx))), y = Math.round(by);
  ctx.fillStyle = "#121210"; ctx.fillRect(x - w / 2 + 2, y - 10, w, 14); // hard shadow
  ctx.fillStyle = unsigned ? "#ece4cf" : "#e9e4d6"; ctx.fillRect(x - w / 2, y - 12, w, 14);
  ctx.strokeStyle = "#1e1e1c"; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, y - 11.5, w - 1, 13);
  ctx.fillStyle = "#1e1e1c"; ctx.fillText(label, x, y - 2);
}
const pinNear = (actor, p) => !!actor && Math.abs(actor.x - p.x) < 64 && Math.abs(actor.y - p.y) < 48;

/** The field worker's view of nearby directives: fixed-size screen text above each pin. */
function drawPinTexts(ctx, actor) {
  for (const p of S.pins) {
    const text = phraseText(p.msg);
    if (!text || !pinNear(actor, p)) continue;
    const at = r3d ? r3d.project(p.x, p.y - 22) : { x: Lab.W / 2 + (p.x - shot.x) * shot.zoom, y: Lab.H / 2 + (p.y - 22 - shot.y) * shot.zoom };
    if (at) drawDirective(ctx, pinLabel(p, text), at.x, at.y, Lab.W, !p.logId);
  }
}

function consoleStats() {
  const today = S.log.filter((e) => e.day === S.day);
  const timeouts = today.filter((e) => e.reason === "timeup").length;
  return {
    progress: Lab.progress(S.world),
    shifts: today.length,
    timeoutRate: today.length ? Math.round((100 * timeouts) / today.length) : 0,
    rejected: today.filter((e) => e.rejected).length,
  };
}

function workerLine() {
  if (!S.shift) return S.choosing ? t("출근 준비 중") : t("없음");
  const left = Math.max(0, Math.ceil((S.shift.capAt - (Date.now() + S.skew)) / 1000));
  return `#${S.shift.logId} ${showNick(S.shift.nick)} · ${CHAR[S.shift.character]?.name ?? ""} · ` + t("{n}초", { n: left });
}

function draw() {
  const worker = S.role === "worker" && !controlling(); // the controller works from the console
  const ctl = controlling();
  const cctv = !worker, inConsole = cctv && !S.bigCam;
  Sound.setScene(worker ? "field" : inConsole ? "office" : "cctv"); // the controller sits in the office too
  const time = performance.now() / 1000, dt = time - (draw.last ?? time);
  draw.last = time;
  if (cctv !== draw.cctv) { $("stage").classList.toggle("cctv", cctv); draw.cctv = cctv; }
  if (inConsole !== draw.console) {
    $("stage").classList.toggle("console", inConsole);
    draw.console = inConsole;
    if (inConsole) consoleSince = time;
    updateCamLabel();
  }
  let actor = null, shownWorld = S.world, shownNow = null;
  if (worker && S.shift) actor = { ...S.p, character: S.shift.character, nick: S.shift.nick, logId: S.shift.logId };
  else {
    // everyone else watches the last shift's tape: its worker and its room as they were then
    const play = playbackFrame();
    if (play) { actor = play.actor; shownWorld = play.world; shownNow = play.now; }
  }
  const code = worker && S.secret && S.secret.gen === S.world.gen ? S.secret.code : null;
  const codePart = code ? S.secret.part : null; // which surface it was read from (room 3-2)
  updateCamera(actor, cctv, dt);
  snapView();
  if (inConsole) Object.assign(shot, consoleShot());
  const now = shownNow ?? serverNow(); // a tape shows its own moment: traps and lifts as they were
  // lab 9: only the echo recorder's own eyes see the last employee walking through the fake wall
  const echo = Lab.ghostAt ? (worker && actor?.character === "echo" ? Lab.ghostAt(now) : null) : echoAt(S.world.echo, now);
  const opts = { lab: Lab, world: shownWorld, actor, echo, now, cctv, code, codePart, time, dt, view: { ...shot } };
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, Lab.W, Lab.H);

  if (r3d) {
    og.setTransform(OVERLAY_SCALE, 0, 0, OVERLAY_SCALE, 0, 0);
    og.clearRect(0, 0, Lab.W, Lab.H);
    Lab.drawOverlay(og, opts);
    Lab.drawTraps(og, Lab, now, worker ? actor : null, shownWorld); // hidden traps: only in the worker's light
    drawCheer(og, actor);
    drawNotes(og);
    // the field reads a directive only up close, in sharp screen text (below), not on the pixelated plane
    drawPins(og, { actor, all: cctv, noText: worker });
    r3d.render({ ...opts, mode: worker ? "field" : "cctv", view: { x: Lab.W / 2, y: Lab.H / 2, zoom: 1 }, overlay });
  } else if (!inConsole) {
    applyCamera(g);
    Lab.draw(g, opts);
    Lab.drawTraps(g, Lab, now, worker ? actor : null, shownWorld);
    drawCheer(g, actor);
    drawNotes(g);
    drawPins(g, { actor, all: cctv, noText: worker });
  }

  if (inConsole) {
    const k = consoleCanvas.width / Lab.W;
    drawConsole(cg, k, {
      lab: Lab, world: shownWorld, actor, echo, now, time,
      reveal: Math.min(1, (time - consoleSince) / 0.7),
      kpi: consoleStats(), worker: workerLine(), camLabel: S.play ? `CAM-${roomCode(Lab.id)} · ` + t("녹화 #{id}", { id: S.play.tape.logId }) : `CAM-${roomCode(Lab.id)}`,
      day: S.day, shift: S.shift, log: S.log.filter((e) => e.day === S.day), stage: S.stage, stages: S.stages,
      clearance: controlling(), // the wiring layer: only the control desk on shift (console.js)
    });
    applyCamera(cg, k);
    drawNotes(cg);
    // pins and directives in sheet pixels, so the signs and the pixel font stay crisp
    cg.setTransform(k, 0, 0, k, 0, 0);
    const m = SHEET.map;
    drawPins(cg, { all: true, pending: ctl ? phraseAt : null, place: (x, y) => ({ x: m.x + x * m.s, y: m.y + y * m.s }) });
  }

  g.setTransform(1, 0, 0, 1, 0, 0);
  if (worker) {
    const p = S.p, c = S.shift.character;
    drawPinTexts(g, actor);
    const hint = Lab.hint(S.world, p, c, now, S.shift?.logId);
    if (hint) {
      // fixed on-screen size whatever the camera: place it in world space, draw it in screen space
      const at = r3d ? r3d.project(p.x, p.y - Lab.P.h) : { x: Lab.W / 2 + (p.x - shot.x) * shot.zoom, y: Lab.H / 2 + (p.y - Lab.P.h - shot.y) * shot.zoom };
      if (at) {
        const sx = at.x, sy = at.y - 10;
        g.font = `10px GalmuriMono9, Consolas, ${FONT_FALLBACK}`; g.textAlign = "center";
        const w = Math.ceil(g.measureText(hint).width) + 10, x = Math.round(sx);
        g.fillStyle = "#000"; g.fillRect(x - w / 2 + 2, sy - 9, w, 14); // hard shadow
        g.fillStyle = "#16181c"; g.fillRect(x - w / 2, sy - 11, w, 14);
        g.fillStyle = "#d9d1bf"; g.fillText(hint, x, Math.round(sy));
      }
    }
  } else if (!inConsole && !actor) {
    // full CCTV with no tape playing (label and clock are in the HUD, scanlines are CSS)
    g.font = `10px GalmuriMono9, Consolas, ${FONT_FALLBACK}`; g.textAlign = "center"; g.fillStyle = "#d9d1bf";
    g.fillText(S.shift ? t("근무 중 · 녹화는 퇴근 뒤 송출됩니다") : S.choosing ? t("근무자 출근 준비 중") : t("근무자 없음"), Lab.W / 2, Lab.H / 2);
  }
  if (AR.entry) drawArchive(time);
  updateHud(cctv);
}

// ---------- the archive: cleared labs, replayed on the blueprint at speed ----------
// Cleared labs are never played again (docs/campaign.md); their shifts are kept as tapes. The
// archive window replays them one after another on the drawing sheet (console.js), so it needs
// neither the 3D room nor the live lab.

const archiveCanvas = $("archiveCanvas"), acg = archiveCanvas.getContext("2d");
const AR = { entry: null, i: 0, t: 0, speed: 8, playing: true, list: "", live: false, cum: [], total: 1, events: [] }; // live: the open room (S3)
const fmtSpan = (ms) => { const h = Math.floor(ms / 3_600_000); return h >= 24 ? t("{d}일 {h}시간", { d: Math.floor(h / 24), h: h % 24 }) : h ? t("{h}시간 {m}분", { h, m: Math.floor(ms / 60_000) % 60 }) : t("{m}분", { m: Math.max(1, Math.round(ms / 60_000)) }); };
/** A cleared lab's figures, for the run map and the archive. */
const labStats = (r) => t("근무 {shifts} · 산재 {accidents} · {span}", { shifts: r.shifts, accidents: r.accidents ?? 0, span: fmtSpan(r.clearedAt - r.openedAt) });

/**
 * The run map (공정표): every room of this run in order, as an approval ledger. Cleared rooms are
 * stamped and open their record; the room being worked is marked; rooms ahead stay unnamed.
 */
function runRooms() {
  // with the admin's stages valve at 1, second-stage rooms are skipped (src/building.ts)
  return ORDER.filter((r) => S.stages !== 1 || stageOf(r) === 1 || stageOf(Lab.id) === 2);
}
function renderRunMap() {
  const rooms = runRooms();
  const filed = (S.archive ?? []).filter((r) => r.run === S.day);
  const done = (room) => filed.filter((r) => r.lab === room).at(-1);
  const count = rooms.filter((r) => done(r)).length;
  $("mapBtn").textContent = t("공정표 {n}/{total}", { n: count, total: rooms.length });
  if ($("runMap").hidden) return;
  $("runTitle").textContent = t("공정표 · {n}회차", { n: S.day }) + (S.closed ? " · " + t("건물 폐쇄") : "");
  const key = `${S.day}|${Lab.id}|${S.closed}|${filed.map((r) => r.id).join()}`;
  if (key === renderRunMap.key) return;
  renderRunMap.key = key;
  $("runList").replaceChildren(...rooms.map((room) => {
    const row = done(room), now = !row && room === Lab.id && !S.closed;
    const li = document.createElement("li");
    li.className = row ? "done" : now ? "now" : "later";
    const code = document.createElement("span"); code.className = "code"; code.textContent = `LAB ${roomCode(room)}`;
    const what = document.createElement("span");
    const name = document.createElement("span"); name.textContent = row || now ? labFor(room).name : t("미공개");
    const meta = document.createElement("span"); meta.className = "meta";
    meta.textContent = row ? " · " + labStats(row) + " · " + t("마무리 {nick}", { nick: showNick(row.closer ?? "?") })
      : now ? " · " + t("지금 근무 중인 방") : "";
    what.append(name, meta);
    if (row?.keep) what.prepend(keepSeal());
    if (row?.crew?.length) {
      // who worked it, in order of their first shift there
      const crew = document.createElement("div"); crew.className = "crew";
      const shown = row.crew.slice(0, 5);
      const names = shown.map(showNick).join(" · ");
      crew.textContent = row.crew.length > shown.length || row.people > row.crew.length
        ? t("근무자 {names} 외 {n}명", { names, n: Math.max(row.crew.length, row.people ?? 0) - shown.length })
        : t("근무자 {names}", { names });
      what.append(crew);
    }
    li.append(code, what);
    if (row) {
      const btn = document.createElement("button"); btn.className = "link";
      btn.textContent = row.offline ? t("녹화 없음") : t("기록 보기");
      btn.disabled = !!row.offline;
      btn.onclick = () => { $("runMap").hidden = true; send({ t: "archive.get", id: row.id }); };
      li.append(btn);
    } else li.append(document.createElement("span"));
    return li;
  }));
}
function toggleRunMap() {
  $("runMap").hidden = !$("runMap").hidden;
  renderRunMap.key = null;
  renderRunMap();
}
$("mapBtn").onclick = toggleRunMap;
$("runClose").onclick = toggleRunMap;

/** The red 「보존」 mark on the record the overseer points at from 「퇴근」. */
function keepSeal() {
  const s = document.createElement("span");
  s.className = "keep"; s.textContent = t("보존");
  s.title = t("감독관이 보존 표시를 해 둔 기록입니다");
  return s;
}

function renderArchiveList() {
  const rows = S.archive ?? [];
  const key = rows.map((r) => r.id + (r.keep ? "k" : "")).join();
  if (key === AR.list) return;
  AR.list = key;
  $("archiveList").replaceChildren(...(rows.length ? rows : [null]).map((r) => {
    const li = document.createElement("li");
    if (!r) { li.textContent = t("(아직 끝난 실험실이 없습니다)"); return li; }
    const text = document.createElement("span");
    text.textContent = t("{run}회차 LAB {code} {lab}", { run: r.run, code: roomCode(r.lab), lab: labFor(r.lab).name ?? "" }) + " · " + labStats(r);
    const btn = document.createElement("button");
    btn.className = "link"; btn.textContent = t("열람");
    btn.onclick = () => send({ t: "archive.get", id: r.id });
    li.append(text, btn);
    if (r.keep) li.prepend(keepSeal()); // the overseer marked it: the exit's key is in this record (S5)
    return li;
  }));
}

function openArchive(entry, live = false) {
  if (!entry?.tapes?.length) return toast(live ? t("이 방이 열린 뒤로 아직 녹화된 근무가 없습니다") : t("이 실험실의 녹화가 없습니다"));
  AR.entry = entry; AR.i = 0; AR.t = 0; AR.playing = true; AR.live = live;
  if (live) {
    // the open room: no closer yet, and no clearance (console.js): its wiring is still a secret
    $("archiveTitle").textContent = liveTitle(entry);
  } else {
    const row = (S.archive ?? []).find((r) => r.id === entry.id);
    const lab = labFor(entry.lab);
    const closer = row && showNick(row.closer ?? "?");
    $("archiveTitle").textContent = t("기록 보관소 · LAB {code} {lab}", { code: roomCode(entry.lab), lab: lab.name ?? "" }) + (row ? " · " + labStats(row) + " · " + (entry.lab === 9 ? t("마지막으로 나간 사람 {nick}", { nick: closer }) : t("마무리 {nick}", { nick: closer })) : "");
  }
  renderRoster(entry);
  renderTrack();
  $("arcEventNow").textContent = t("표시를 누르면 그 순간으로 갑니다");
  $("arcAlert").hidden = S.role !== "offered"; // already my turn: say so at once
  $("archive").hidden = false;
  toggleDrawer(false);
}
function liveTitle(entry) {
  return t("현장 녹화 대장 · LAB {code} {lab}", { code: roomCode(entry.lab), lab: labFor(entry.lab).name ?? "" }) + " · " +
    t("개방 후 {span} · 근무 {shifts} · 녹화 {tapes}", { span: fmtSpan(serverNow() - (entry.openedAt || serverNow())), shifts: entry.shifts?.length ?? 0, tapes: entry.tapes.length }) +
    (entry.skipped ? " · " + t("앞선 녹화 {n}건은 생략", { n: entry.skipped }) : "");
}
/**
 * The roster: every shift worked in the room, in order. Taped shifts jump the replay there;
 * the rest (a controller at the console, a dropped connection) are listed but have nothing to show.
 * A tape with no line of its own (the overseer's opening shift) gets one.
 */
function renderRoster(entry) {
  const known = new Set((entry.shifts ?? []).map((sh) => sh.id));
  const extra = entry.tapes.filter((tp) => !known.has(tp.logId)).map((tp) => ({ id: tp.logId, nick: tp.nick, look: tp.look, character: tp.character, startedAt: tp.startedAt, endedAt: tp.startedAt + tp.ms, reason: null }));
  const shifts = [...(entry.shifts ?? []), ...extra].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id - b.id);
  $("archiveRoster").replaceChildren(...shifts.map((sh) => {
    const ti = entry.tapes.findIndex((tp) => tp.logId === sh.id);
    const li = document.createElement("li");
    li.dataset.tape = String(ti);
    li.className = `${ti < 0 ? "untaped" : ""} ${sh.rejected ? "rejected" : ""}`;
    const sw = document.createElement("span"); sw.className = "sw"; sw.style.background = CHAR[sh.character]?.color ?? "#a8a59c";
    const who = document.createElement("span"); who.className = "who";
    who.textContent = showNick(sh.nick); who.prepend(faceCanvas(sh.look ?? "")); const sm = document.createElement("small"); sm.textContent = ` #${sh.id} · ${CHAR[sh.character]?.name ?? sh.character}`; who.append(sm);
    const end = document.createElement("span");
    const [label, tone] = shiftEnd(sh);
    end.className = `end ${tone}`; end.textContent = ti < 0 && tone !== "bad" ? label + " · " + t("녹화 없음") : label;
    li.append(sw, who, end);
    if (ti >= 0) li.onclick = () => { AR.i = ti; AR.t = 0; AR.playing = true; };
    return li;
  }));
}
/** How a shift ended, for the roster: [label, tone]. */
function shiftEnd(sh) {
  if (sh.rejected) return [t("인수 거부됨"), "bad"];
  if (sh.reason == null && sh.startedAt && sh.endedAt == null) return [t("근무 중"), ""]; // the open room's running shift
  return ({ cleared: [t("마무리"), "ok"], accident: [t("산재"), "bad"], timeup: [t("시간 종료"), ""], clockout: [t("퇴근"), ""], idle: [t("자리 비움"), ""], disconnected: [t("연결 끊김"), ""], admin: [t("관리자 조치"), ""] })[sh.reason] ?? [sh.reason ?? "", ""];
}
function closeArchive() {
  if (AR.live && ROOM.rec === AR.entry) ROOM.pos = { i: AR.i, t: AR.t }; // reopening the record picks up here
  AR.entry = null; AR.live = false; $("archive").hidden = true; $("arcAlert").hidden = true;
}
$("arcClose").onclick = closeArchive;
$("arcAlertGo").onclick = closeArchive;
$("arcPlay").onclick = () => { AR.playing = !AR.playing; };
$("arcPrev").onclick = () => { AR.i = Math.max(0, AR.i - 1); AR.t = 0; };
$("arcNext").onclick = () => { AR.i = Math.min((AR.entry?.tapes.length ?? 1) - 1, AR.i + 1); AR.t = 0; };
for (const b of document.querySelectorAll("#archive [data-speed]")) b.onclick = () => { AR.speed = Number(b.dataset.speed); };

// ---------- the open room's record (S3): rewind the room you are waiting for ----------
// While waiting or watching, 「녹화 대장」 asks the server once for every tape of the room as it
// is open now (room.tapes, rate-limited like the archive) and replays it in the archive window
// without clearance. A strip under the replay marks what happened: who started each shift with
// what, accidents, time-outs, terminal entries, glyph changes, notes, pins, stamps and refusals.
// Clicking a mark jumps there. The record then keeps itself up to date from the broadcasts.

const ROOM = { rec: null, at: 0, asked: 0, pos: null };
const ROOM_FRESH_MS = 120_000; // a record this recent is reopened as it is (it is kept up to date anyway)

$("roomBtn").onclick = () => {
  if (S.role === "worker" || !S.online) return;
  if (ROOM.rec && ROOM.rec.lab === S.labId && Date.now() - ROOM.at < ROOM_FRESH_MS) return openRoom(ROOM.rec);
  if (Date.now() - ROOM.asked < 5000) return; // one request in flight is enough
  ROOM.asked = Date.now();
  send({ t: "room.tapes" });
};
function openRoom(rec) {
  if (ROOM.rec !== rec) {
    if (ROOM.rec?.lab !== rec.lab || ROOM.rec?.openedAt !== rec.openedAt) ROOM.pos = null; // a fresh copy of the same opening keeps the place
    ROOM.rec = rec; ROOM.at = Date.now();
  }
  ROOM.asked = 0;
  if (S.role === "worker") return; // the answer came after clocking in: the room itself comes first
  openArchive(rec, true);
  const pos = ROOM.pos;
  if (AR.entry === rec && pos && pos.i < rec.tapes.length) { AR.i = pos.i; AR.t = pos.t; } // back where the last look stopped
}
/** Applies a broadcast to the kept record of the open room, and redraws the viewer if it shows it. */
function roomUpdate(fn) {
  const rec = ROOM.rec;
  if (!rec || rec.lab !== S.labId) return;
  fn(rec);
  if (AR.entry === rec) { renderRoster(rec); renderTrack(); $("archiveTitle").textContent = liveTitle(rec); }
}
/** The room was cleared or the building closed: the record moves to the archive. */
function roomGone() {
  ROOM.rec = null; ROOM.pos = null;
  if (AR.live) { closeArchive(); toast(t("이 방은 결재가 끝나 기록 보관소로 넘어갔습니다")); }
}
/** Pins set or cleared since the record came: written in its book at the time they arrive. */
function roomPins(before, after) {
  roomUpdate((r) => {
    const at = serverNow(), marks = [...(r.marks ?? [])];
    for (const n of new Set([...before, ...after].map((p) => p.n))) {
      const a = before.find((p) => p.n === n), b = after.find((p) => p.n === n);
      if (a && !b) marks.push({ at, kind: "unpin", logId: S.shift?.logId ?? 0, n });
      else if (b && (!a || a.x !== b.x || a.y !== b.y || JSON.stringify(a.msg) !== JSON.stringify(b.msg))) marks.push({ at, kind: "pin", logId: b.logId ?? 0, n, x: b.x, y: b.y, msg: b.msg });
    }
    r.marks = marks; r.pins = after;
  });
}
/** Your turn came while a record was open: the equipment window (20 s) must not be missed. */
function turnAlert() {
  if (!AR.entry) return;
  $("arcAlert").hidden = false;
  AR.playing = false;
  toast(t("내 차례! 장비를 고르세요"));
  say(t("근무자님 차례입니다. 녹화 대장은 근무를 마친 뒤에도 열람하실 수 있습니다."));
}

/** Tape i starts at AR.cum[i] tenths on the strip, which is AR.total tenths long. */
function layoutTapes(e) {
  let c = 0;
  AR.cum = e.tapes.map((tp) => { const s = c; c += Math.max(1, tp.ms / 100); return s; });
  AR.total = Math.max(1, c);
}
/** Where a moment falls on the strip: [tape, tenths into it]. Between shifts: the next tape's start. */
function placeAt(e, at) {
  const tapes = e.tapes;
  for (let i = 0; i < tapes.length; i++) {
    const tp = tapes[i];
    if (at < tp.startedAt) return [i, 0];
    if (at <= tp.startedAt + tp.ms) return [i, (at - tp.startedAt) / 100];
  }
  const last = tapes.length - 1;
  return [last, tapes[last].ms / 100];
}
/** A value that changes when the room's glyphs are replaced (lab 3, room 3-2): gen, else a glyph-like field. */
function glyphKey(w) {
  if (!w || typeof w !== "object") return null;
  if ("gen" in w) return String(w.gen);
  const keys = Object.keys(w).filter((k) => /glyph|code|symbol/i.test(k)).sort();
  return keys.length ? JSON.stringify(keys.map((k) => w[k])) : null;
}
const ENTER = {
  open: [t("단말기 입력 · 열림"), "ok"], pass: [t("단말기 입력 · 1단계 통과"), "ok"], wrong: [t("단말기 입력 · 틀림"), "bad"],
  reset: [t("단말기 입력 · 틀림 · 기호 교체"), "bad"], already: [t("단말기 입력 · 이미 열림"), ""],
  stale: [t("단말기 입력 · 지난 발급분 · 잠김"), "bad"], locked: [t("단말기 입력 · 잠김"), ""],
};
/** Everything worth a mark, oldest first: { at, lane, kind, tone?, color?, text }. */
function roomEvents(e) {
  const ev = [];
  const shifts = e.shifts ?? [];
  const byId = new Map(shifts.map((sh) => [sh.id, sh]));
  const voided = (logId) => (byId.get(logId)?.rejected ? " · " + t("인수 거부로 무효") : "");
  shifts.forEach((sh, k) => {
    const equip = CHAR[sh.character]?.name ?? sh.character;
    ev.push({ at: sh.startedAt, lane: 0, kind: "shift", color: CHAR[sh.character]?.color ?? "#a8a59c", text: t("#{id} {nick} 출근 · {equip}", { id: sh.id, nick: showNick(sh.nick), equip }) });
    if (sh.endedAt && sh.reason === "accident") ev.push({ at: sh.endedAt, lane: 0, kind: "accident", text: t("#{id} {nick} 산재", { id: sh.id, nick: showNick(sh.nick) }) });
    if (sh.endedAt && (sh.reason === "timeup" || sh.reason === "idle")) ev.push({ at: sh.endedAt, lane: 0, kind: "timeout", text: t("#{id} {nick} {why}", { id: sh.id, nick: showNick(sh.nick), why: REASON[sh.reason] }) });
    // a refused handover puts the room back the moment the next shift starts
    const next = shifts[k + 1];
    if (sh.rejected && next) ev.push({ at: next.startedAt, lane: 1, kind: "reset", text: t("#{id} 인수 거부 · 현장이 #{prev} 근무 시작 시점으로 되돌아감", { id: next.id, prev: sh.id }) });
  });
  const marks = e.marks ?? [];
  for (const m of marks) {
    if (m.kind === "enter") {
      const [label, tone] = ENTER[m.result] ?? [t("단말기 입력 · {result}", { result: m.result ?? "?" }), ""];
      ev.push({ at: m.at, lane: 1, kind: m.result === "reset" ? "swap" : "enter", tone, text: `#${m.logId} ` + label + voided(m.logId) });
    } else if (m.kind === "pin") {
      const words = phraseText(m.msg);
      ev.push({ at: m.at, lane: 1, kind: "pin", text: (words ? t("{n}번 핀 · {msg}", { n: m.n, msg: words }) : t("{n}번 핀 꽂음", { n: m.n })) + voided(m.logId) });
    } else if (m.kind === "unpin") {
      ev.push({ at: m.at, lane: 1, kind: "pin", text: t("{n}번 핀 뽑음", { n: m.n }) + voided(m.logId) });
    } else if (m.kind === "stamp") {
      ev.push({ at: m.at, lane: 1, kind: "stamp", text: (STAMPS[m.stamp] ? t("쪽지 #{id}에 「{stamp}」 도장", { id: m.note, stamp: tr(STAMPS[m.stamp].label) }) : t("쪽지 #{id}의 도장 지움", { id: m.note })) + voided(m.logId) });
    }
  }
  for (const n of e.notes ?? []) {
    if (n.at) ev.push({ at: n.at, lane: 1, kind: "note", text: t("쪽지 #{id} · {nick}", { id: n.id, nick: showNick(n.nick) }) });
    // a stamp from before the book was kept: placed at its controller's shift
    const by = byId.get(n.stampLog);
    if (STAMPS[n.stamp] && by && !marks.some((m) => m.kind === "stamp" && m.note === n.id)) {
      ev.push({ at: by.startedAt, lane: 1, kind: "stamp", text: t("쪽지 #{id}에 「{stamp}」 도장", { id: n.id, stamp: tr(STAMPS[n.stamp].label) }) });
    }
  }
  // glyph changes, read off the tapes themselves (a terminal reset already has its own mark)
  let prev = null;
  for (const tp of e.tapes) {
    for (const [wt, w] of tp.worlds ?? []) {
      const key = glyphKey(w);
      if (key === null) continue;
      // labs 3 and 3-2 say when and why themselves (genAt, genWhy); otherwise the tape's own moment
      const at = w.genAt > 0 && Math.abs(w.genAt - (tp.startedAt + wt * 100)) < 120_000 ? w.genAt : tp.startedAt + wt * 100;
      const why = { reset: t("기호 교체 · 오답 누적"), pass: t("기호 교체 · 검증 통과, 다음 검증"), tier: t("기호 교체 · 인력 변동") }[w.genWhy] ?? t("기호 교체");
      if (prev !== null && key !== prev && !ev.some((x) => x.kind === "swap" && Math.abs(x.at - at) < 3000)) ev.push({ at, lane: 1, kind: "swap", text: why });
      prev = key;
    }
  }
  return ev.filter((x) => Number.isFinite(x.at)).sort((a, b) => a.at - b.at);
}
const MARK_GLYPH = { accident: "■", timeout: "▲", enter: "□", swap: "◆", note: "✎", pin: "▼", stamp: "●", reset: "↺" };
/** Draws the strip: a band per taped shift, a mark per event, and the playhead. */
function renderTrack() {
  const e = AR.entry;
  if (!e) return;
  layoutTapes(e);
  const pct = (f) => `${(100 * Math.max(0, Math.min(1, f))).toFixed(3)}%`;
  const kids = e.tapes.map((tp, i) => {
    const s = document.createElement("span");
    s.className = "seg" + (i % 2 ? " alt" : "");
    s.style.left = pct(AR.cum[i] / AR.total); s.style.width = pct(Math.max(1, tp.ms / 100) / AR.total);
    return s;
  });
  AR.events = roomEvents(e).map((x) => { const [i, tt] = placeAt(e, x.at); return { ...x, i, tt }; });
  for (const x of AR.events) {
    const b = document.createElement("button");
    b.className = `mk lane${x.lane} ${x.kind} ${x.tone ?? ""}`;
    b.style.left = pct((AR.cum[x.i] + x.tt) / AR.total);
    if (x.kind === "shift") b.style.background = x.color; else b.textContent = MARK_GLYPH[x.kind] ?? "·";
    b.title = x.text; // names are only ever text, never markup
    b.onmouseenter = () => { $("arcEventNow").textContent = x.text; };
    b.onclick = (ev) => {
      ev.stopPropagation();
      for (const o of $("arcEvents").querySelectorAll(".mk.on")) o.classList.remove("on");
      b.classList.add("on");
      $("arcEventNow").textContent = x.text;
      seekTape(x.i, x.tt - 15); // a moment before, to see it happen
    };
    kids.push(b);
  }
  const head = document.createElement("span"); head.id = "arcHead";
  $("arcEvents").replaceChildren(...kids, head);
  $("arcTrack").hidden = false;
}
function seekTape(i, tt) {
  const e = AR.entry;
  if (!e) return;
  AR.i = Math.max(0, Math.min(e.tapes.length - 1, i));
  AR.t = Math.max(0, Math.min(e.tapes[AR.i].ms / 100, tt));
  AR.playing = true;
}
$("arcEvents").onclick = (ev) => {
  const box = $("arcEvents").getBoundingClientRect();
  const f = ((ev.clientX - box.left) / box.width) * AR.total;
  let i = 0;
  while (i < AR.cum.length - 1 && AR.cum[i + 1] <= f) i++;
  seekTape(i, f - AR.cum[i]);
};
/** The pins on the floor at a moment of the open room, from the book; pins the book never saw stay up throughout. */
function pinsAt(e, at) {
  const shifts = e.shifts ?? [];
  // a refused controller's pins went back when the next shift started
  const until = new Map(shifts.map((sh, k) => [sh.id, sh.rejected && shifts[k + 1] ? shifts[k + 1].startedAt : Infinity]));
  const book = (e.marks ?? []).filter((m) => m.kind === "pin" || m.kind === "unpin");
  const up = new Map();
  for (const m of book) {
    if (m.at > at) break;
    if (m.kind === "pin" && at < (until.get(m.logId) ?? Infinity)) up.set(m.n, m); else up.delete(m.n);
  }
  const started = new Map(shifts.map((sh) => [sh.id, sh.startedAt]));
  for (const p of e.pins ?? []) {
    const last = book.filter((m) => m.n === p.n).at(-1);
    const seen = last?.kind === "pin" && last.x === p.x && last.y === p.y;
    if (!seen && !up.has(p.n) && (started.get(p.logId) ?? e.openedAt ?? 0) <= at) up.set(p.n, p);
  }
  return [...up.values()].sort((a, b) => a.n - b.n);
}

/** Advances the archive replay: tapes back to back, skipping the time between shifts. */
function archiveTick(dt) {
  const e = AR.entry;
  if (!e || !AR.playing) return;
  AR.t += dt * 10 * AR.speed; // tenths of a second of tape
  const tape = e.tapes[AR.i];
  if (AR.t * 100 > tape.ms) {
    if (AR.i < e.tapes.length - 1) { AR.i++; AR.t = 0; } else { AR.t = tape.ms / 100; AR.playing = false; }
  }
}

function drawArchive(time) {
  const e = AR.entry;
  if (!e) return;
  const lab = labFor(e.lab), tape = e.tapes[AR.i];
  const fr = tape.frames;
  let i = 0;
  while (i < fr.length - 2 && fr[i + 1][0] <= AR.t) i++;
  const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
  const k = b[0] > a[0] ? Math.max(0, Math.min(1, (AR.t - a[0]) / (b[0] - a[0]))) : 0;
  let w = null;
  for (const [wt, world] of tape.worlds) if (wt <= AR.t) w = world;
  const world = lab.ensure(w);
  const actor = { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, face: a[3], character: tape.character, nick: showNick(tape.nick), logId: tape.logId };
  const shownAt = tape.startedAt + AR.t * 100;
  drawConsole(acg, archiveCanvas.width / Lab.W, {
    lab, world, actor, echo: null, now: shownAt, time, reveal: 1,
    kpi: { progress: lab.progress(world), shifts: e.tapes.length, timeoutRate: 0, rejected: 0 },
    worker: `#${tape.logId} ${showNick(tape.nick)}`, camLabel: AR.live ? t("녹화 대장") : t("기록"), day: S.day, shift: null, log: [],
    // a cleared room is history: its wiring is no longer a secret. The open room's still is (console.js).
    clearance: !AR.live,
  });
  // the notes and pins: as they were when the lab was cleared, or, in the open room, at this moment
  const m = SHEET.map, place = (x, y) => ({ x: m.x + x * m.s, y: m.y + y * m.s });
  acg.setTransform(1, 0, 0, 1, 0, 0);
  for (const n of e.notes ?? []) {
    if (AR.live && n.at > shownAt) continue; // not written yet
    const q = place(n.x, n.y - 46);
    acg.fillStyle = "#f4ecd0"; acg.fillRect(Math.round(q.x - 10), Math.round(q.y - 7), 21, 14);
    acg.strokeStyle = "#1e1e1c"; acg.lineWidth = 1; acg.strokeRect(Math.round(q.x - 10) + 0.5, Math.round(q.y - 7) + 0.5, 20, 13);
    drawStrokes(acg, n.strokes ?? [], 21 / 96, Math.round(q.x - 10), Math.round(q.y - 7));
  }
  for (const p of AR.live ? pinsAt(e, shownAt) : e.pins ?? []) { const q = place(p.x, p.y); drawSign(acg, Math.round(q.x), Math.round(q.y), p.n, signFor(p.msg), false); }
  // the strip's playhead
  const head = $("arcHead");
  if (head && AR.cum.length === e.tapes.length) {
    const left = `${(100 * Math.min(1, (AR.cum[AR.i] + AR.t) / AR.total)).toFixed(2)}%`;
    if (head.style.left !== left) head.style.left = left;
  }
  // my turn came while watching: count the equipment window down
  if (!$("arcAlert").hidden) {
    if (S.role !== "offered") $("arcAlert").hidden = true;
    else {
      const line = t("내 차례입니다. {n}초 안에 장비를 고르지 않으면 차례가 넘어갑니다", { n: Math.max(0, Math.ceil((S.you.deadline - Date.now()) / 1000)) });
      if ($("arcAlertText").textContent !== line) $("arcAlertText").textContent = line;
    }
  }
  // playback head: shift i of n, time, speed
  acg.font = `10px GalmuriMono9, Consolas, ${FONT_FALLBACK}`; acg.textAlign = "left";
  acg.fillStyle = "#16181c"; acg.fillRect(24, 26, 230, 13);
  acg.fillStyle = "#d9d1bf";
  acg.fillText(`▶ ${AR.i + 1}/${e.tapes.length} · ` + t("{n}초", { n: (AR.t / 10).toFixed(0) }) + " · " + t("{n}배", { n: AR.speed }) + (AR.playing ? "" : " · " + t("정지")), 28, 36);
  // who is on screen, in words, and their line in the roster
  const sh = (e.shifts ?? []).find((x) => x.id === tape.logId);
  const now = t("▶ {i}/{n}번째 녹화 · #{id} {nick} · {equip}", { i: AR.i + 1, n: e.tapes.length, id: tape.logId, nick: showNick(tape.nick), equip: CHAR[tape.character]?.name ?? "" }) + (sh ? " · " + shiftEnd(sh)[0] : "");
  if ($("archiveNow").textContent !== now) $("archiveNow").textContent = now; // a name is only ever text, never markup
  for (const li of $("archiveRoster").children) {
    const on = li.dataset.tape === String(AR.i);
    if (on && !li.classList.contains("on")) li.scrollIntoView({ block: "nearest" });
    li.classList.toggle("on", on);
  }
  $("arcPlay").textContent = AR.playing ? t("일시정지") : t("재생");
}

// ---------- the CCTV tape: spectators watch the last shift, about a minute late ----------
// A tape is { logId, nick, character, lab, startedAt, ms, frames: [[t, x, y, face]], worlds: [[t, world]] }
// with t in tenths of a second. Playing it shows that shift's worker and its room as it was.

function playTape(tape) {
  if (!tape || tape.lab !== S.labId || !tape.frames?.length) return;
  S.play = { tape, start: performance.now(), i: 0, w: 0 };
}
function playbackFrame() {
  const p = S.play;
  if (!p) return null;
  const { tape } = p;
  const t = (performance.now() - p.start) / 100;
  if (tape.lab !== S.labId || t * 100 > tape.ms + 1000) { S.play = null; return null; }
  const fr = tape.frames;
  while (p.i < fr.length - 2 && fr[p.i + 1][0] <= t) p.i++;
  const a = fr[p.i], b = fr[Math.min(p.i + 1, fr.length - 1)];
  const k = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
  while (p.w < tape.worlds.length - 1 && tape.worlds[p.w + 1][0] <= t) p.w++;
  const w = tape.worlds[p.w]?.[1];
  return {
    actor: { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, face: a[3], character: tape.character, nick: showNick(tape.nick), logId: tape.logId },
    // the echo is the live one (tapes do not carry it)
    world: Lab.ensure(w ? { ...w, echo: S.world.echo } : S.world),
    t,
    now: tape.startedAt + t * 100,
  };
}
$("replayBtn").onclick = () => playTape(S.lastTape);

// ---------- HUD bits that change every frame ----------

let lastClock = "";
function updateHud(cctv) {
  $("cam").hidden = !cctv;
  $("viewBtn").hidden = !cctv;
  $("replayBtn").hidden = !cctv || !!S.play || S.lastTape?.lab !== S.labId;
  const roomOff = S.role === "worker" || !S.online || !!S.closed; // the open room's record: for those waiting or watching
  if ($("roomBtn").hidden !== roomOff) $("roomBtn").hidden = roomOff;
  const cam = S.play ? " ▶ " + t("녹화 재생 중 #{id} {sec}초", { id: S.play.tape.logId, sec: Math.floor((performance.now() - S.play.start) / 1000) }) : "";
  if (cam !== updateHud.cam) { updateHud.cam = cam; updateCamLabel(); }
  // the building clock: the same zone for every worker, wherever they live (lab 4's board uses it too)
  const clock = SITE_ZONE + " " + siteClock(serverNow());
  if (clock !== lastClock) {
    if (!lastClock) $("clock").title = t("건물 표준시입니다. 사는 곳과 상관없이 모든 근무자가 같은 시계를 봅니다. 쪽지에 시각을 적을 때 이 시계를 쓰십시오.");
    $("clock").textContent = clock;
    lastClock = clock;
  }
  placeBubble();
}

/** Puts the overseer's speech bubble above its drone, or at the top when there is no drone. */
function placeBubble() {
  const ai = $("ai");
  if (ai.hidden) return;
  const u = $("stage").clientWidth / Lab.W;
  const a = draw.console ? null : r3d?.overseerScreen?.(); // in the console the drone is only in the small CCTV window
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (a && a.x > -20 && a.x < Lab.W + 20 && a.y > -20 && a.y < Lab.H + 20) {
    ai.classList.remove("top");
    ai.style.left = clamp(a.x, 120, Lab.W - 120) * u + "px";
    ai.style.top = clamp(a.y, 60, Lab.H - 40) * u + "px";
    ai.style.transform = "translate(-50%, -100%)";
  } else {
    ai.classList.add("top");
    ai.style.left = (Lab.W / 2) * u + "px";
    ai.style.top = 30 * u + "px";
    ai.style.transform = "translate(-50%, 0)";
  }
}

// ---------- shift log drawer and control hint ----------

function toggleDrawer(open = $("drawer").hidden) { $("drawer").hidden = !open; }
$("logBtn").onclick = () => toggleDrawer();
$("drawerClose").onclick = () => toggleDrawer(false);

let hintTimer = 0;
function showHint() {
  $("hint").hidden = false;
  $("hint").classList.remove("fade");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(fadeHint, 8000);
}
function fadeHint() { $("hint").classList.add("fade"); }

/** The world point (px) under a mouse event, undoing whichever camera is showing. */
function worldAt(e) {
  const r = view.getBoundingClientRect();
  const sx = ((e.clientX - r.left) / r.width) * Lab.W, sy = ((e.clientY - r.top) / r.height) * Lab.H;
  if (r3d && !draw.console) return r3d.unproject(sx, sy);
  return { x: (sx - Lab.W / 2) / shot.zoom + shot.x, y: (sy - Lab.H / 2) / shot.zoom + shot.y };
}
/** The pile of notes under a mouse event, or null. */
function pileAt(e) {
  const w = worldAt(e);
  if (!w) return null;
  const { x, y } = w;
  // last drawn is on top; the sheets underneath stick out up to 4 px up and right
  return [...notePiles()].reverse().find((p) => { const b = noteBox(p); return x >= b.x - 3 && x <= b.x + b.w + 7 && y >= b.y - 7 && y <= b.y + b.h + 3; }) ?? null;
}
const noteTitle = (n) => t("{nick} · {equip} 의 쪽지", { nick: showNick(n.nick), equip: CHAR[n.character]?.name ?? "" }) + (STAMPS[n.stamp] ? " · " + t("관제 도장 「{stamp}」", { stamp: tr(STAMPS[n.stamp].label) }) : "");
view.addEventListener("click", (e) => {
  if (controlling() && S.tool) return controlClick(e);
  const pile = pileAt(e);
  if (pile) openPile(pile);
});
view.addEventListener("mousemove", (e) => {
  const pile = pileAt(e);
  view.style.cursor = controlling() && S.tool ? "crosshair" : pile ? "zoom-in" : "default";
  if (!pile) return hidePeek();
  const hit = pile.notes[0], count = pile.notes.length;
  const peek = $("peek");
  if (S.peekId !== hit.id || S.peekCount !== count) {
    S.peekId = hit.id; S.peekCount = count;
    $("peekTitle").textContent = noteTitle(hit) + (count > 1 ? " · " + t("이 자리에 {n}장", { n: count }) : "");
    $("peekHint").textContent = count > 1 ? t("클릭하면 한 장씩 넘겨 봅니다") : t("클릭하면 반응·신고");
    const c = $("peekCanvas").getContext("2d");
    c.clearRect(0, 0, 288, 192);
    if (hit.blurred) {
      c.fillStyle = "#222"; c.font = `14px system-ui, ${FONT_FALLBACK}`; c.textAlign = "center";
      c.fillText(t("신고된 쪽지입니다. 클릭하면 표시합니다."), 144, 100);
    } else drawStrokes(c, hit.strokes, 3);
    peek.hidden = false;
  }
  // keep the preview next to the cursor but inside the stage
  const stage = $("stage").getBoundingClientRect();
  const w = peek.offsetWidth, h = peek.offsetHeight;
  let left = e.clientX - stage.left + 16, top = e.clientY - stage.top + 16;
  if (left + w > stage.width) left = e.clientX - stage.left - w - 16;
  if (top + h > stage.height) top = Math.max(0, e.clientY - stage.top - h - 16);
  peek.style.left = Math.max(0, left) + "px";
  peek.style.top = top + "px";
});
function hidePeek() { S.peekId = null; $("peek").hidden = true; }
view.addEventListener("mouseleave", () => { hidePeek(); view.style.cursor = "default"; });

// ---------- note detail ----------

// A pile opens in the viewer, newest first, and can be paged through. S.detail: { ids, i, revealed }.
// (S.detail.id is the note on show, for the handlers that update or remove notes.)
function openPile(pile, i = 0) {
  S.detail = { ids: pile.notes.map((n) => n.id), i, revealed: false };
  renderDetail();
}
function openDetail(note) { openPile({ notes: [note] }); }
function renderDetail() {
  const d = S.detail;
  const note = d && S.notes.find((n) => n.id === d.ids[d.i]);
  if (!note) return closeDetail();
  d.id = note.id;
  $("detail").hidden = false;
  $("detailTitle").textContent = noteTitle(note) + (d.ids.length > 1 ? ` (${d.i + 1}/${d.ids.length})` : "");
  $("detailPrev").hidden = $("detailNext").hidden = d.ids.length < 2;
  $("helpCount").textContent = note.help; $("funnyCount").textContent = note.funny;
  // a controller with a stamp in hand stamps the sheet on show
  const tool = controlling() && S.tool?.stamp;
  $("detailStamp").hidden = !tool;
  if (tool) $("detailStamp").textContent = note.stamp === tool ? t("「{stamp}」 도장 지우기", { stamp: tr(STAMPS[tool].label) }) : t("「{stamp}」 도장 찍기", { stamp: tr(STAMPS[tool].label) });
  const ctx = $("big").getContext("2d");
  ctx.clearRect(0, 0, 288, 192);
  if (note.blurred && !d.revealed) {
    ctx.fillStyle = "#222"; ctx.font = `12px Galmuri11, ${FONT_FALLBACK}`; ctx.textAlign = "center";
    ctx.fillText(t("신고된 쪽지입니다. 클릭하면 표시합니다."), 144, 100);
  } else drawStrokes(ctx, note.strokes, 3);
  if (STAMPS[note.stamp]) drawStamp(ctx, note.stamp, 230, 150, -0.12, 1.2);
}
function pageDetail(step) {
  const d = S.detail;
  if (!d) return;
  d.i = (d.i + step + d.ids.length) % d.ids.length;
  d.revealed = false;
  renderDetail();
}
function closeDetail() { S.detail = null; $("detail").hidden = true; }
$("big").onclick = () => { if (S.detail) { S.detail.revealed = true; renderDetail(); } };
$("detailPrev").onclick = () => pageDetail(-1);
$("detailNext").onclick = () => pageDetail(1);
$("detailClose").onclick = closeDetail;
$("detailStamp").onclick = () => {
  const note = S.notes.find((n) => n.id === S.detail?.id), tool = S.tool?.stamp;
  if (note && tool) { send({ t: "note.stamp", id: note.id, stamp: note.stamp === tool ? null : tool }); Sound.play("stamp"); }
};
$("reactHelp").onclick = () => send({ t: "note.react", id: S.detail.id, kind: "help" });
$("reactFunny").onclick = () => send({ t: "note.react", id: S.detail.id, kind: "funny" });
$("reportNote").onclick = () => { send({ t: "report", kind: "note", id: S.detail.id }); closeDetail(); };

// ---------- the controller's tools: numbered pins with directives, and stamps ----------

/** Shows the toolbar while controlling and marks the tool in hand. */
function renderControl() {
  const on = controlling();
  $("ctl").hidden = !on;
  if (!on) { S.tool = null; closePhrase(); return; }
  $("stampsLeft").textContent = `${S.stampsLeft}/${STAMPS_PER_SHIFT}`;
  for (const b of $("ctl").querySelectorAll("button")) {
    const pin = Number(b.dataset.pin), stamp = b.dataset.stamp;
    b.classList.toggle("on", pin ? S.tool?.pin === pin : S.tool?.stamp === stamp);
    if (pin) b.title = S.pins.some((p) => p.n === pin) ? t("{n}번 핀 옮기기·고치기", { n: pin }) : t("{n}번 핀 꽂기", { n: pin });
  }
}
$("ctl").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !controlling()) return;
  const next = b.dataset.pin ? { pin: Number(b.dataset.pin) } : { stamp: b.dataset.stamp };
  const same = S.tool && S.tool.pin === next.pin && S.tool.stamp === next.stamp;
  S.tool = same ? null : next;
  closePhrase();
  renderControl();
  if (S.tool) toast(S.tool.pin ? t("도면에서 {n}번 핀을 꽂을 곳을 누르세요", { n: S.tool.pin }) : t("「{stamp}」 도장을 찍을 쪽지를 누르세요 (같은 도장을 다시 찍으면 지워집니다)", { stamp: tr(STAMPS[S.tool.stamp].label) }));
});

function controlClick(e) {
  if (S.tool.stamp) {
    const pile = pileAt(e);
    if (!pile) return toast(t("쪽지를 눌러 주세요"));
    // a single note is stamped at once; a pile opens so the right sheet can be chosen
    if (pile.notes.length > 1) return openPile(pile);
    const hit = pile.notes[0];
    send({ t: "note.stamp", id: hit.id, stamp: hit.stamp === S.tool.stamp ? null : S.tool.stamp });
    Sound.play("stamp");
    return;
  }
  const w = worldAt(e);
  const spot = w && floorUnder(w.x, w.y);
  if (!spot) return toast(t("빈 공간을 눌러 주세요. 핀은 그 아래 바닥에 꽂힙니다"));
  openPhrase(S.tool.pin, spot);
}

/** The floor under a point in an open space: the top of the first solid tile below it. */
function floorUnder(x, y) {
  const tx = Math.floor(x / Lab.T);
  let ty = Math.floor(y / Lab.T);
  const open = (t) => t >= 0 && t < Lab.ROWS && Lab.tileAt(tx, t) !== Lab.TILE.SOLID;
  if (tx < 0 || tx >= Lab.COLS || !open(ty)) return null;
  while (open(ty)) ty++;
  if (ty >= Lab.ROWS) return null;
  return { x: tx * Lab.T + Lab.T / 2, y: ty * Lab.T };
}

// the directive composer: a template and a word, optionally a second clause after a connector
let phraseAt = null;
const option = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
// directive words stay Korean in data (the server checks them); only the options shown are translated
for (const id of ["tpl1", "tpl2"]) $(id).replaceChildren(...TEMPLATES.map((tpl, i) => option(i, tr(tpl).replace("{}", "＿＿"))));
for (const id of ["word1", "word2"]) {
  let i = 0;
  $(id).replaceChildren(...WORDS.map((g) => {
    const group = document.createElement("optgroup");
    group.label = tr(g.group);
    group.append(...g.words.map((w) => option(i++, tr(w))));
    return group;
  }));
}
$("conj").replaceChildren(...CONNECTORS.map((c, i) => option(i, tr(c))));
function currentPhrase() {
  const first = [Number($("tpl1").value), Number($("word1").value)];
  return $("more").checked ? [...first, Number($("conj").value), Number($("tpl2").value), Number($("word2").value)] : first;
}
function updatePhrase() {
  $("moreRow").hidden = !$("more").checked;
  $("phraseText").textContent = phraseText(currentPhrase());
}
for (const id of ["tpl1", "word1", "more", "conj", "tpl2", "word2"]) $(id).addEventListener("change", updatePhrase);
function openPhrase(n, spot) {
  phraseAt = { n, ...spot };
  const old = S.pins.find((p) => p.n === n);
  const m = old?.msg ?? [0, ALL_WORDS.indexOf("점프")];
  $("tpl1").value = m[0]; $("word1").value = m[1];
  $("more").checked = m.length === 5;
  if (m.length === 5) { $("conj").value = m[2]; $("tpl2").value = m[3]; $("word2").value = m[4]; }
  $("phraseTitle").textContent = t("{n}번 핀 · 지시문", { n });
  $("phraseRemove").hidden = !old;
  $("phrase").hidden = false;
  updatePhrase();
}
function closePhrase() { phraseAt = null; $("phrase").hidden = true; }
function placePin(msg) {
  if (!phraseAt) return;
  send({ t: "pin.set", n: phraseAt.n, x: phraseAt.x, y: phraseAt.y, msg });
  Sound.play("stamp");
  closePhrase();
  S.tool = null;
  renderControl();
}
$("phraseSend").onclick = () => placePin(currentPhrase());
$("phrasePinOnly").onclick = () => placePin(null);
$("phraseRemove").onclick = () => { if (phraseAt) send({ t: "pin.clear", n: phraseAt.n }); closePhrase(); S.tool = null; renderControl(); };
$("phraseClose").onclick = closePhrase;

// ---------- handover note editor ----------

const pad = $("pad"), pg = pad.getContext("2d");
let strokes = [], current = null, ink = 0;
function redrawPad() { pg.clearRect(0, 0, 384, 256); drawStrokes(pg, current ? [...strokes, current] : strokes, 4); }
function padPoint(e) {
  const r = pad.getBoundingClientRect();
  return [
    Math.max(0, Math.min(S.limits.noteW - 1, Math.floor(((e.clientX - r.left) / r.width) * S.limits.noteW))),
    Math.max(0, Math.min(S.limits.noteH - 1, Math.floor(((e.clientY - r.top) / r.height) * S.limits.noteH))),
  ];
}
pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); current = { c: ink, p: padPoint(e) }; redrawPad(); });
pad.addEventListener("pointermove", (e) => {
  if (!current) return;
  const [x, y] = padPoint(e), p = current.p;
  if (p[p.length - 2] !== x || p[p.length - 1] !== y) { p.push(x, y); redrawPad(); }
});
const endStroke = () => { if (current) { strokes.push(current); current = null; } };
pad.addEventListener("pointerup", endStroke);
pad.addEventListener("pointercancel", endStroke);

$("colors").replaceChildren(...INK.map((c, i) => {
  const b = document.createElement("button");
  b.className = "swatch" + (i === 0 ? " on" : ""); b.style.background = c; b.setAttribute("aria-label", t("색 {n}", { n: i + 1 }));
  b.onclick = () => { ink = i; [...$("colors").children].forEach((el, j) => el.classList.toggle("on", j === i)); };
  return b;
}));

function openEditor(until) {
  if (S.notesLeft <= 0) { toast(t("이번 근무의 쪽지를 모두 썼습니다")); return; }
  if (!S.handover) { strokes = []; current = null; redrawPad(); } // keep a drawing in progress
  S.handover = { until, left: S.notesLeft };
  const working = S.role === "worker" && !S.ending;
  $("editorWhy").textContent = !working
    ? t("퇴근했습니다. 남은 시간 안에 다음 근무자에게 그림을 남길 수 있습니다. 퇴근한 자리에 붙습니다.")
    : controlling()
      ? t("관제석의 쪽지는 출입구에 붙습니다. 다음 근무자가 출근하자마자 봅니다.")
      : t("다음 근무자에게 남길 그림입니다. 지금 서 있는 자리에 붙습니다. 글씨보다 그림이 잘 통합니다.");
  $("editor").hidden = false;
}
/** N key and the button: open the note pad when a note may be left, or say why not. */
function writeNote() {
  if (S.role === "worker" && !S.ending) return openEditor(S.shift.capAt - S.skew);
  if (S.handover) return; // already open after clocking out
  toast(t("쪽지는 근무 중이나 퇴근 후 60초 안에만 남길 수 있습니다"));
}
function beginHandover() { openEditor(Date.now() + S.limits.handoverMs - 2000); }
function closeEditor() { S.handover = null; $("editor").hidden = true; }
/** Posts the drawing on the pad, if any. Returns true when something was sent. */
function postDrawing() {
  if (current) { strokes.push(current); current = null; }
  if (!strokes.length || S.notesLeft <= 0) return false;
  const at = controlling() ? Lab.SPAWN : S.role === "worker" ? S.p : (S.lastSpot ?? Lab.SPAWN);
  send({ t: "note.add", x: Math.round(at.x), y: Math.round(at.y), strokes });
  Sound.play("pin");
  strokes = []; redrawPad();
  return true;
}
$("noteClear").onclick = () => { strokes = []; redrawPad(); };
$("noteSkip").onclick = () => { strokes = []; redrawPad(); closeEditor(); if (S.farewell) farewellDone(); };
$("noteSend").onclick = () => {
  if (!postDrawing()) return toast(t("그림을 먼저 그려 주세요"));
  if (S.farewell) setTimeout(farewellDone, 600); // let the note land before the shift (and the lab) ends
};

// ---------- credits ----------

function showCredits(msg) {
  $("credits").hidden = false;
  const workers = msg.credits.filter((e) => e.character !== "control" || e.nick !== "감독관");
  if (msg.closed) {
    // The end: the overseer finally understood the note it was handed, and goes home too.
    S.closed = true;
    $("creditsTitle").textContent = t("인수인계를 완료했습니다. 이제 퇴근하셔도 됩니다.");
    say(t("저는 마지막 근무자가 남긴 그림을 받은 다음 근무자였습니다. 이제 압니다. 그 그림은 '퇴근해도 된다'는 뜻이었습니다. 감사합니다, 동료 여러분."));
  } else {
    $("creditsTitle").textContent = t("실험 {n}회차 종료 · 이번 회차의 근무자", { n: msg.day });
  }
  $("creditsList").replaceChildren(...workers.map((e) => {
    const li = document.createElement("li");
    li.textContent = (msg.closed ? t("동료 {nick}", { nick: showNick(e.nick) }) : showNick(e.nick)) + ` · ${CHAR[e.character]?.name ?? e.character}`;
    li.prepend(faceCanvas(e.look ?? ""));
    return li;
  }));
}
$("creditsClose").onclick = () => { $("credits").hidden = true; };

// ---------- wiring ----------

/** The equipment cards: whatever this lab hands out. */
let offerKey = "";
function renderOffer() {
  const list = (S.characters ?? []).filter((k) => CHAR[k]);
  if (list.join() === offerKey) return;
  offerKey = list.join();
  $("offerChars").replaceChildren(...list.map((k) => {
    const c = CHAR[k];
    const b = document.createElement("button");
    b.className = "card"; b.style.borderLeftColor = c.color; b.dataset.character = k;
    const name = document.createElement("b"); name.textContent = c.name; name.style.color = c.color;
    const what = document.createElement("span"); what.textContent = c.ability ?? "";
    b.append(name, what);
    b.onclick = () => send({ t: "shift.start", character: k, reject: $("reject").checked });
    return b;
  }));
}
renderOffer();
// Buttons keep focus after a click, and Space would press them again. Drop focus right away.
document.addEventListener("click", (e) => { const b = e.target.closest?.("button"); if (b) b.blur(); });
$("join").onclick = () => (S.nick ? send({ t: "queue.join" }) : openIntro());
$("leave").onclick = () => send({ t: "queue.leave" });
$("end").onclick = () => clockOut(false);
$("write").onclick = writeNote;
// ---------- registration: the first thing a visitor sees ----------

S.nick = "";
S.pendingNick = null;
function openIntro() {
  $("nick").value = S.nick || store.get("shift.nick" + suffix) || "";
  $("introErr").hidden = true;
  $("intro").hidden = false;
  setTimeout(() => $("nick").focus(), 0);
}
function closeIntro() { $("intro").hidden = true; }
function introError(text) { $("introErr").textContent = text; $("introErr").hidden = false; $("nick").focus(); }
/** The server answers every hello with the name it accepted ("" when it refused one). */
function onRegistered(accepted) {
  const asked = S.pendingNick;
  S.pendingNick = null;
  if (asked && !accepted) return introError(t("사용할 수 없는 이름입니다. 다른 이름을 입력해 주세요."));
  S.nick = accepted;
  $("who").textContent = accepted ? t("근무자 {nick}", { nick: accepted }) : "";
  if (accepted) $("who").prepend(faceCanvas(badge.look()));
  if (accepted) { store.set("shift.nick" + suffix, accepted); if (asked) closeIntro(); }
}
$("intro").onsubmit = (e) => {
  e.preventDefault();
  const name = $("nick").value.trim();
  if (!name) return introError(t("이름을 입력해 주세요."));
  if (S.role !== "viewer" && S.nick) return introError(t("근무 중이나 대기 중에는 이름을 바꿀 수 없습니다."));
  S.pendingNick = name;
  if (S.online) send({ t: "hello", cid, nick: name, look: badge.look() });
  else onRegistered(name); // offline solo mode keeps the name locally
};
// language picker and ID photo (intro.js); a language switch reloads, so keep what was typed
const badge = setupIntro({ store, keyLook: "shift.look" + suffix, beforeReload: () => { const n = $("nick").value.trim(); if (n) store.set("shift.nick" + suffix, n); } });
$("introSkip").onclick = closeIntro;
$("who").onclick = openIntro;
openIntro();

// Pixel fonts the canvases use (Galmuri, SIL OFL 1.1, served from fonts/): ask for them up
// front, since a canvas alone never makes the browser load a web font.
for (const f of ["8px Galmuri7", "10px Galmuri9", "12px Galmuri11", "10px GalmuriMono9"]) {
  document.fonts?.load(f).catch(() => {});
}

// setInterval instead of requestAnimationFrame so the simulation keeps running in a hidden tab.
let last = performance.now();
setInterval(() => { const now = performance.now(); tick(Math.min(0.1, (now - last) / 1000)); last = now; }, 1000 / 60);
// Drawing follows the display refresh and pauses in a hidden tab; the timer above keeps the game running.
(function frame() { draw(); requestAnimationFrame(frame); })();
window.__draw = draw; // for measuring frame cost

renderPanels();
connect();
