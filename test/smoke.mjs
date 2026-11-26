// End-to-end smoke test against a running server (npm run dev).
// Usage: node test/smoke.mjs [host]   (default localhost:8787)
// Note: it leaves test shifts, notes and one ban/unban in the local database.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { phraseText } from "../public/directives.js";
import { exitCode } from "../public/lab9.js";
import { FORGE_AT } from "../public/lab5.js";
import { DELAY_MIN, DELAY_MAX } from "../public/lab4core.js";
import * as L3 from "../public/lab3.js";

const host = process.argv[2] ?? "localhost:8787";
const http = `http://${host}`;
const token = /^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();

let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
  if (!ok) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(nick) {
    this.nick = nick; this.cid = randomUUID(); this.inbox = []; this.raw = []; this.waiters = []; this.seen = [];
  }
  async open() {
    this.ws = new WebSocket(`ws://${host}/ws`);
    this.closed = new Promise((r) => { this.ws.onclose = (e) => r(e.code); });
    this.ws.onmessage = (e) => {
      if (e.data[0] === "s") { this.raw.push(e.data); return; }
      const msg = JSON.parse(e.data);
      this.inbox.push(msg);
      this.seen.push(msg);
      this.waiters = this.waiters.filter((w) => !w(msg));
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.send({ t: "hello", cid: this.cid, nick: this.nick });
    return this.wait((m) => m.t === "welcome");
  }
  send(msg) { this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); }
  /** Resolves with the first message (already received or future) that matches. */
  wait(pred, ms = 3000) {
    const hit = this.inbox.find(pred);
    if (hit) { this.inbox.splice(this.inbox.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((res) => {
      const timer = setTimeout(() => res(null), ms);
      this.waiters.push((msg) => {
        if (!pred(msg)) return false;
        clearTimeout(timer); this.inbox.splice(this.inbox.indexOf(msg), 1); res(msg); return true;
      });
    });
  }
  role(role) { return this.wait((m) => m.t === "sync" && m.you.role === role); }
  /**
   * Joins the queue and waits to be offered the shift. One test person clocks in far more often
   * than a player would and can hit the per-person limit (12 joins a minute): wait it out and retry.
   */
  async join() {
    for (let i = 0; i < 15; i++) {
      this.send({ t: "queue.join" });
      const m = await this.wait((x) => (x.t === "sync" && x.you.role === "offered") || (x.t === "error" && x.code === "rate-limited"));
      if (m?.t !== "error") return m;
      await sleep(5000);
    }
    return null;
  }
  clear() { this.inbox.length = 0; this.raw.length = 0; }
}

async function admin(path, body, auth = token) {
  const res = await fetch(http + "/admin/api" + path, {
    method: body ? "POST" : "GET",
    headers: { ...(auth ? { Authorization: "Bearer " + auth } : {}), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const world = (open) => ({ x: open ? 20 : 0, goal: 100, doors: [{ x: 20, k: "key", open }] });
const strokes = [{ c: 1, p: [1, 1, 30, 20, 60, 5] }];

const A = new Client("에이"), B = new Client("비"), C = new Client("  씨​  ");
const wa = await A.open(), wb = await B.open(), wc = await C.open();
check("three clients get a welcome", !!(wa && wb && wc));
// (tier 1: the local database has many test players, which would scale the procedure up)
// one stage per lab here: this test checks the rules, test/campaign.mjs checks the whole length
check("the stages valve takes 1-3", (await admin("/config", { stages: 1 })).status === 200 && (await admin("/config", { stages: 4 })).status === 400);
check("the run can be moved to a lab by an admin", (await admin("/config", { lab: 3, tier: 1 })).status === 200);
check("an unknown lab is refused", (await admin("/config", { lab: 99 })).status === 400);
check("nickname is cleaned", wc?.nick === "씨", JSON.stringify(wc?.nick));
const N = new Client("시발놈");
check("a blocked name is refused, not replaced", (await N.open())?.nick === "");
N.send({ t: "queue.join" });
check("no name, no shift", (await N.wait((m) => m.t === "error"))?.code === "nick-required");
N.ws.close();

// The building may hold state from earlier runs: make sure nobody is working.
await admin("/rollback", {});
await sleep(200);
for (const c of [A, B, C]) c.clear();

// 1. queue -> offer -> shift
A.send({ t: "queue.join" });
check("first in queue is offered the shift", !!(await A.role("offered")));
A.send({ t: "shift.start", character: "key" });
check("worker role after choosing a character", !!(await A.role("worker")));
const seen = await B.wait((m) => m.t === "sync" && m.shift?.nick === "에이");
check("spectators see who is working", seen?.shift.character === "key");
check("sync never leaks client ids", !JSON.stringify(seen).includes(A.cid));

// 2. positions are no longer streamed: old-style snapshots are dropped
A.send('s{"x":5}');
await sleep(300);
check("positions are not streamed live", !B.raw.length && !C.raw.length);

// 3. queue while someone works, then checkpoint
B.send({ t: "queue.join" });
check("second player waits in the queue", (await B.role("queued"))?.you.pos === 1);
A.send({ t: "checkpoint", world: world(true) });
check("checkpoint is shown to spectators", (await B.wait((m) => m.t === "world"))?.world.doors[0].open === true);

// 4. clock out with the shift's tape -> spectators get the recording; next in queue is offered
const frames = Array.from({ length: 30 }, (_, i) => [i, 40 + i * 3, 320, 1]);
A.send({ t: "shift.end", world: world(true), progress: 1, tape: { frames } });
const tape = (await C.wait((m) => m.t === "tape"))?.tape;
check("the shift's tape goes out once, at clock-out", tape?.frames.length === 30 && tape.nick === "에이" && tape.character === "key");
check("the tape carries the room as it changed", tape?.worlds.length >= 2 && tape.worlds.at(-1)[1]?.doors?.[0]?.open === true);
check("next player is offered the shift", !!(await B.role("offered")));
const entry = (await C.wait((m) => m.t === "log.add"))?.entry;
check("shift log is broadcast", entry?.nick === "에이" && entry.progress === 1 && entry.reason === "clockout");
A.send({ t: "note.add", x: 20, y: 1, strokes: [{ c: 9, p: [0, 0] }] });
check("malformed drawing is rejected", (await A.wait((m) => m.t === "error"))?.code === "bad-note");
A.send({ t: "note.add", x: 20, y: 1, strokes });
const note = (await C.wait((m) => m.t === "note.add"))?.note;
check("handover note is broadcast", note?.nick === "에이" && note.strokes.length === 1);
A.send({ t: "note.add", x: 22, y: 0, strokes });
check("one note per shift", (await A.wait((m) => m.t === "error"))?.code === "note-limit");
B.send({ t: "note.add", x: 1, y: 0, strokes });
check("no notes without a finished shift", (await B.wait((m) => m.t === "error"))?.code === "no-handover");

// 5. reports: one blurs, a repeat from the same person is ignored, two hide
C.send({ t: "report", kind: "note", id: note.id });
check("one report blurs the note", (await B.wait((m) => m.t === "note.update"))?.note.blurred === true);
C.send({ t: "report", kind: "note", id: note.id });
check("repeat report is ignored", (await B.wait((m) => m.t === "note.remove", 500)) === null);
B.send({ t: "report", kind: "note", id: note.id });
check("two reports hide the note", (await A.wait((m) => m.t === "note.remove"))?.id === note.id);

// 6. admin API
check("admin API rejects a missing token", (await admin("/state", null, "")).status === 401);
check("admin API rejects a wrong token", (await admin("/state", null, "wrong")).status === 401);
const state = await admin("/state");
check("admin state lists the hidden note", state.data?.notes.find((n) => n.id === note.id)?.status === "hidden");
await admin("/note", { id: note.id, action: "restore" });
check("restored note is shown again", (await C.wait((m) => m.t === "note.add"))?.note.id === note.id);
await admin("/nick", { logId: entry.id, action: "mask" });
check("masked nickname is broadcast", (await C.wait((m) => m.t === "log.update"))?.entry.nick === "익명 근무자");

// 7. refuse the handover: world goes back, previous shift is marked
B.send({ t: "shift.start", character: "tall", reject: true });
const back = await C.wait((m) => m.t === "world" && m.reverted);
check("refusing the handover restores the world", back !== null && back.world?.doors?.[0]?.open !== true);
check("refused shift is marked", (await C.wait((m) => m.t === "log.update" && m.entry.rejected))?.entry.id === entry.id);
check("refuser becomes the worker", !!(await B.role("worker")));

// 8. ban and kick
await admin("/ban", { cid: C.cid });
C.send({ t: "queue.join" });
check("banned client cannot queue", (await C.wait((m) => m.t === "error"))?.code === "banned");
await admin("/unban", { cid: C.cid });
await admin("/kick", {});
check("admin can end the current shift", (await B.wait((m) => m.t === "kicked"))?.reason === "admin");
await B.role("viewer");

// 9. worker disconnects mid-shift -> shift ends, building is free again
C.clear();
B.send({ t: "queue.join" });
await B.role("offered");
B.send({ t: "shift.start", character: "light" });
await B.role("worker");
B.ws.close();
check("disconnect ends the shift", (await C.wait((m) => m.t === "log.add"))?.entry.reason === "disconnected");
check("building is free afterwards", (await C.wait((m) => m.t === "sync" && m.shift === null)) !== null);

// 10. same id in a second tab replaces the first
const A2 = new Client("에이2");
A2.cid = A.cid;
await A2.open();
const told = await A.wait((m) => m.t === "replaced", 2000);
check("second tab replaces the first", told !== null);

// 11. lab 3: the code stays on the server, and the run only clears the real way
const labWorld = (extra = {}) => ({ lab: 3, ...extra });
async function work(c, character) {
  c.clear();
  await c.join();
  c.send({ t: "shift.start", character });
  return c.role("worker");
}
async function clockOut(c, world, extra = {}) {
  c.send({ t: "shift.end", world, progress: 0, ...extra });
  await c.role("viewer");
}
await sleep(400); // the checkpoint rate limit
C.clear();
await work(A2, "key");
A2.send({ t: "lab.read" });
check("only the light can read the glyphs", (await A2.wait((m) => m.t === "error"))?.code === "cannot-read");
A2.send({ t: "checkpoint", world: labWorld({ door: true, lever: true, code: [0, 0, 0, 0] }) });
const forged = await C.wait((m) => m.t === "world");
check("a worker cannot open the door by editing the world", forged?.world.door === false && forged.world.lever === false);
check("a code sent by a worker is dropped", forged && !("code" in forged.world));
await sleep(300);
A2.send({ t: "lab.enter", input: [9, 9, 9, 9] });
check("malformed code input is refused", (await A2.wait((m) => m.t === "error"))?.code === "bad-input");
await sleep(300);
A2.send({ t: "lab.enter", input: [0, 0, 0, 0] });
const first = await A2.wait((m) => m.t === "lab.result");
if (first?.result === "open") console.log("NOTE  guessed the code by chance; door checks below are skipped");
// (by chance the guess can be last issue's row, still on the wall: "stale", which locks the terminal for the shift)
check("a guess is judged by the server", ["wrong", "stale", "open"].includes(first?.result), first?.result);
check("everyone sees the try count", first?.result === "open" || (await C.wait((m) => m.t === "world" && m.world.tries === 1)) !== null);
await clockOut(A2, labWorld({ lever: true }), { cleared: true });
check("clearing with the door shut is refused", (await C.wait((m) => m.t === "log.add"))?.entry.reason !== "cleared");

await work(A2, "light");
A2.send({ t: "lab.enter", input: [0, 0, 0, 0] });
check("only the card can use the terminal", (await A2.wait((m) => m.t === "error"))?.code === "cannot-enter");
A2.send({ t: "lab.read" });
const secret = await A2.wait((m) => m.t === "lab.secret");
check("the light at the wall is told the whole wall (two tagged rows)", Array.isArray(secret?.code) && secret.code.length === L3.WALL_LENGTH, JSON.stringify(secret?.code));
check("everyone else only learns that it was seen", (await C.wait((m) => m.t === "world" && m.world.seen === true)) !== null);
check("spectators never receive the code", !C.seen.some((m) => m.t === "lab.secret"));
await clockOut(A2, labWorld());

// the terminal shows this issue's tag (world.issue): the card types that row of the wall
const st3 = (await admin("/state")).data;
const code3 = L3.codeFrom(secret?.code ?? [], st3.world?.issue);
check("the world's issue tag names the current row of the wall", !!code3 && code3.join() === L3.answer(st3.lab).join() && st3.world.row === st3.lab.row, JSON.stringify({ issue: st3.world?.issue, row: st3.world?.row }));
await work(A2, "key");
await sleep(300);
A2.send({ t: "lab.enter", input: code3 ?? [] });
check("the code from the light opens the door", (await A2.wait((m) => m.t === "lab.result"))?.result === "open");
check("everyone sees the door open", (await C.wait((m) => m.t === "world" && m.world.door === true)) !== null);
await clockOut(A2, labWorld(), { tape: { frames: [[0, 40, 320, 1], [10, 80, 320, 1]] } });

// 11a. S3: the open room's record. A waiting player asks for every tape since the room opened.
C.clear();
C.send({ t: "room.tapes" });
const room = (await C.wait((m) => m.t === "room.tapes" || m.t === "error"))?.room;
check("room.tapes answers with the open room", room?.lab === 3 && room.run >= 1 && Number.isFinite(room.openedAt) && Number.isFinite(room.now) && room.skipped === 0 &&
  ["tapes", "shifts", "notes", "pins", "marks"].every((k) => Array.isArray(room[k])), JSON.stringify(room)?.slice(0, 300));
check("its tapes are this room's, with the room as it changed", room?.tapes.length >= 1 && room.tapes.every((tp) => tp.lab === 3 && tp.startedAt >= room.openedAt) &&
  room.tapes.at(-1).nick === "에이2" && room.tapes.at(-1).worlds.some(([, w]) => w?.door === true));
check("its shifts are every shift since the room opened, with how they ended", room?.shifts.length >= 3 && room.shifts.every((x) => x.startedAt >= room.openedAt) && room.shifts.some((x) => x.nick === "에이2" && x.reason === "clockout" && x.character === "light"));
check("its book has the terminal entries and their results, never what was typed", !!room?.marks.some((m) => m.kind === "enter" && m.result === "open" && Number.isFinite(m.at) && Number.isInteger(m.logId)) &&
  room.marks.every((m) => !("input" in m)) && (first?.result === "open" || room.marks.some((m) => m.kind === "enter" && m.result === first?.result)));
check("its notes carry their time", room?.notes.every((n) => Number.isFinite(n.at)));
check("the record never carries the code or a client id", !!room && room.tapes.every((tp) => tp.worlds.every(([, w]) => !w || !("code" in w))) && !JSON.stringify(room).includes(A.cid) && !JSON.stringify(room).includes(C.cid));
for (let i = 0; i < 30; i++) C.send({ t: "room.tapes" }); // the limit is 30 an hour, like the archive
check("room.tapes is rate-limited", (await C.wait((m) => m.t === "error" && m.code === "rate-limited", 5000)) !== null);
C.clear();
// that burst half fills C's flood window (60 messages in 10 s, then the socket is closed), and C
// works labs 5 and 9 in quick shifts soon after: let the window lapse first
await sleep(10_500);

await work(A2, "tall");
C.clear();
await clockOut(A2, labWorld({ lever: true }), { cleared: true, tape: { frames: [[0, 600, 128, 1], [5, 610, 128, 1]] } });
const moved = await C.wait((m) => m.t === "lab.next");
check("clearing lab 3 moves the run on to lab 4", moved?.from === 3 && moved.lab === 4);
const filed = (await C.wait((m) => m.t === "archive.list"))?.archive.at(-1);
check("the cleared lab goes to the archive", filed?.lab === 3 && filed.shifts >= 4 && filed.closer === "에이2");
C.send({ t: "archive.get", id: filed?.id });
const record = (await C.wait((m) => m.t === "archive"))?.entry;
check("its shifts can be replayed from the archive", record?.lab === 3 && record.tapes.length >= 1 && record.tapes.at(-1).nick === "에이2");
check("the record lists every shift with who worked it and how it ended", Array.isArray(record?.shifts) && record.shifts.length >= record.tapes.length && record.shifts.some((x) => x.nick === "에이2" && x.reason === "cleared"));
check("the archive list names the room's workers", Array.isArray(filed?.crew) && filed.crew.includes("에이2"));
check("lab 4 hands out the echo recorder", !!(await C.wait((m) => m.t === "sync" && m.lab === 4))?.characters.includes("echo"));

// 11b. lab 4: the echo holds one button, the worker the other, and the lift comes
const standing = (x, y) => ({ frames: Array.from({ length: 20 }, (_, i) => [i, x, y, 1]) }); // a tape of standing still
await work(A2, "echo");
A2.send({ t: "lab.call", x: 48, y: 320 }); // standing on the left button
check("no power, no lift", (await A2.wait((m) => m.t === "lab.called"))?.result === "no-power");
C.clear();
await clockOut(A2, { lab: 4 }, { tape: standing(48, 320) }); // the echo comes from the tail of the tape
const echoed = await C.wait((m) => m.t === "world" && m.world?.echo);
check("the echo recorder leaves an echo where it stood", echoed?.world.echo.frames.length === 80 && echoed.world.echo.frames.every(([x]) => x === 48));

await work(A2, "key");
await sleep(400);
C.clear();
A2.send({ t: "checkpoint", world: { lab: 4, breaker: true, callAt: 1, calls: 5, lever: true } });
const powered = await C.wait((m) => m.t === "world" && m.world?.breaker === true);
check("the card powers the breaker", !!powered);
check("a worker cannot fake a lift call or the lever", powered?.world.callAt === null && powered.world.calls === 0 && powered.world.lever === false);
check("the echo survives the next worker's checkpoint", powered?.world.echo?.frames.length === 80);
const delay4 = (await admin("/state")).data.lab.arriveMs;
check("the lift's delay is drawn for this opening (30-50 s) and travels in the world", Number.isInteger(delay4) && delay4 >= DELAY_MIN && delay4 <= DELAY_MAX && powered?.world.arriveMs === delay4, JSON.stringify({ delay4, world: powered?.world.arriveMs }));
A2.send({ t: "lab.call", x: 300, y: 320 }); // nowhere near a button
check("one button is not enough", (await A2.wait((m) => m.t === "lab.called"))?.result === "not-held");
await sleep(300);
A2.send({ t: "lab.call", x: 27 * 16, y: 320 }); // the right button, while the echo holds the left
check("worker and echo together call the lift", (await A2.wait((m) => m.t === "lab.called"))?.result === "called");
check("everyone sees the call", (await C.wait((m) => m.t === "world" && m.world?.calls === 1)) !== null);
await clockOut(A2, { lab: 4, breaker: true });

await work(A2, "tall");
const dayBefore = (await admin("/state")).data.day;
C.clear();
await clockOut(A2, { lab: 4, breaker: true, lever: true }, { cleared: true });
const to5 = await C.wait((m) => m.t === "lab.next");
check("clearing lab 4 moves the run on to lab 5", to5?.from === 4 && to5.lab === 5);

// 11b-1. lab 5 "Signature": the phase shifter sets the room, the overseer lies, the card signs
// (C works here, A2 watches: A2 is near its 20 shifts a day)
await admin("/config", { tier: 1 });
const st5 = (await admin("/state")).data.lab;
check("lab 5 opens in a phase", st5.phase === "blue" || st5.phase === "red");
const phase5 = await work(C, "phase");
await sleep(300);
A2.clear();
C.send({ t: "checkpoint", world: { lab: 5, phase: st5.phase === "blue" ? "red" : "blue", anchor: "blue", signs: 9, door: true, lever: true } });
const forged5 = await A2.wait((m) => m.t === "world" && m.world?.lab === 5);
check("a worker cannot switch, anchor, sign or pull the lever by editing the world", forged5?.world.phase === st5.phase && forged5.world.anchor === null && forged5.world.door === false && forged5.world.lever === false);
await sleep(300);
C.send({ t: "lab.act", what: "sign" });
check("only the card signs", (await C.wait((m) => m.t === "error"))?.code === "cannot-act");
if (st5.phase === "blue") {
  await sleep(300);
  C.send({ t: "lab.act", what: "switch" });
  check("the phase shifter switches the room", (await C.wait((m) => m.t === "lab.acted"))?.result === "switched");
}
await sleep(300);
C.send({ t: "lab.act", what: "anchor:blue" });
check("the phase shifter anchors the bridge", (await C.wait((m) => m.t === "lab.acted"))?.result === "anchored");
check("everyone sees red phase with the blue anchor", (await A2.wait((m) => m.t === "world" && m.world?.phase === "red" && m.world.anchor === "blue")) !== null);
A2.clear();
await clockOut(C, { lab: 5 });
// the overseer's forgery by the entrance: signed with a real shift that was not the control desk
// (here the phase shifter's, the only one that acted), and true only sometimes
const atEntrance = (pins) => pins?.find((p) => p.x === FORGE_AT.x && p.y === FORGE_AT.y);
const lie = atEntrance((await A2.wait((m) => m.t === "pins" && !!atEntrance(m.pins)))?.pins);
check("after the shift the overseer posts a directive by the entrance, signed with the shift that acted", !!lie && lie.logId === phase5?.shift.logId && lie.logId > 0, JSON.stringify({ lie, logId: phase5?.shift.logId }));
check("...naming a phase or the next worker", /^(청|적) 위상 있음$|^다음 근무자는 \S/.test(phraseText(lie?.msg)), phraseText(lie?.msg));
await work(C, "key");
await sleep(300);
C.send({ t: "lab.act", what: "sign" });
check("the card's signature opens door D", (await C.wait((m) => m.t === "lab.acted"))?.result === "open");
await clockOut(C, { lab: 5 });
await work(C, "tall");
A2.clear();
await clockOut(C, { lab: 5, lever: true }, { cleared: true });
const to6 = await A2.wait((m) => m.t === "lab.next");
check("clearing lab 5 moves the run on to lab 6", to6?.from === 5 && to6.lab === 6);

// 11b-2. lab 6 "Night shift": the card opens door D and re-hangs the drop grates; the slip is its own
const st6 = (await admin("/state")).data.lab;
check("lab 6 opens with a cracked set of grates", Array.isArray(st6.cracked) && st6.cracked.length >= 2 && st6.gen === 0);
await work(C, "key");
await sleep(300);
A2.clear();
C.send({ t: "checkpoint", world: { lab: 6, door: true, cracked: [], gen: 5, fallGen: 5, lever: true } });
const forged6 = await A2.wait((m) => m.t === "world" && m.world?.lab === 6);
check("a worker cannot open D, re-hang or pull the lever by editing the world", forged6?.world.door === false && forged6.world.gen === 0 && forged6.world.lever === false && forged6.world.cracked.join() === st6.cracked.join());
await sleep(300);
C.send({ t: "lab.act", what: "door" });
check("the card opens door D", (await C.wait((m) => m.t === "lab.acted"))?.result === "open");
await sleep(300);
A2.clear();
C.send({ t: "lab.act", what: "fix" });
const fix6 = await C.wait((m) => m.t === "lab.acted");
const st6b = (await admin("/state")).data.lab;
check("the far winch re-hangs the grates and hands the card the new cracked set", /^fixed:/.test(fix6?.result ?? "") && fix6.result.split(":")[2] === st6b.cracked.map((i) => i + 1).join(",") && st6b.gen === 1, JSON.stringify({ r: fix6?.result, cracked: st6b.cracked }));
await sleep(200);
check("...and nobody else gets the slip", !A2.inbox.some((m) => m.t === "lab.acted"));
await clockOut(C, { lab: 6 });
await work(C, "tall");
A2.clear();
await clockOut(C, { lab: 6, lever: true }, { cleared: true });
const toLast = await A2.wait((m) => m.t === "lab.next");
check("clearing lab 6 moves the run on to the last lab", toLast?.from === 6 && toLast.lab === 9);
const opening = await A2.wait((m) => m.t === "tape" && m.tape?.lab === 9);
check("the last lab opens with the overseer's own shift on tape", opening?.tape.lab === 9 && opening.tape.nick === "감독관" && opening.tape.frames.length > 100);

// (C works here, A2 watches: A2 is near its 20 shifts a day)
// 11b-2. lab 9 "Clocking out": the old note is on the wall, the card types it in, someone walks out
const st9 = (await admin("/state")).data.lab;
const oldNote = st9.pieces?.flat() ?? [];
// the exit wants the glyphs mark by mark, in the order the overseer stamped lab 1 in its practice
const exit = exitCode(st9.pieces ?? [], st9.order ?? []);
check("the old note is torn into pieces of glyphs", oldNote.length >= 2 && oldNote.length <= 6);
check("the exit code is the note's glyphs in this run's practised order", Array.isArray(st9.order) && st9.order.length === 3 && exit.length === oldNote.length, JSON.stringify(st9.order));
await work(C, "tall");
await sleep(400); // the checkpoint rate limit
A2.clear();
C.send({ t: "checkpoint", world: { lab: 9, door: true, out: true } });
const wall = await A2.wait((m) => m.t === "world" && m.world?.lab === 9);
check("everyone can see the note's glyphs (they hang on the wall)", JSON.stringify(wall?.world.pieces?.flat()) === JSON.stringify(oldNote), JSON.stringify({ wall: wall?.world, oldNote }));
check("a worker cannot open the exit by editing the world", wall?.world.door === false && wall.world.out === false);
check("the practised order never reaches the clients", !!wall && !("order" in wall.world));
C.send({ t: "lab.enter", input: exit });
check("only the card can use the exit terminal", (await C.wait((m) => m.t === "error"))?.code === "cannot-enter");
A2.clear();
await clockOut(C, { lab: 9, out: true }, { cleared: true });
check("walking out through a shut door is refused", (await A2.wait((m) => m.t === "log.add"))?.entry.reason !== "cleared");

await work(C, "key");
await sleep(300);
C.send({ t: "lab.enter", input: exit.map((g) => (g + 1) % 6) });
check("a wrong drawing is judged by the server", (await C.wait((m) => m.t === "lab.result"))?.result === "wrong");
await sleep(300); // the terminal takes one try per quarter second
C.send({ t: "lab.enter", input: exit });
check("a wrong entry locks the exit terminal for the rest of the shift", (await C.wait((m) => m.t === "lab.result"))?.result === "locked");
await clockOut(C, { lab: 9 });
const card9 = await work(C, "key"); // the next card gets the terminal back
await sleep(300);
// every second miss in the run re-tears the note ("reset", fresh pieces, same order): read it again
const st9now = (await admin("/state")).data.lab;
C.send({ t: "lab.enter", input: exitCode(st9now.pieces ?? [], st9now.order ?? []) });
const opened9 = await C.wait((m) => m.t === "lab.result");
check("the whole note in the practised order opens the exit", opened9?.result === "open",
  JSON.stringify({ opened9, started: !!card9, socket: C.ws.readyState, last: C.seen.slice(-4).map((m) => m.t + (m.code ? ":" + m.code : "") + (m.you ? ":" + m.you.role : "")) }));
check("everyone sees the exit open", (await A2.wait((m) => m.t === "world" && m.world?.door === true)) !== null);
A2.clear();
await clockOut(C, { lab: 9, out: true }, { cleared: true });
const clear = await A2.wait((m) => m.t === "day.clear");
check("clearing the last lab rolls credits", clear?.day === dayBefore && clear.credits.length >= 1 && clear.closed === true);
check("then the building is closed", (await admin("/state")).data.closed === true);
C.send({ t: "queue.join" });
check("nobody can clock in to a closed building", (await C.wait((m) => m.t === "error"))?.code === "closed");
// an admin can reopen it: a new run from lab 3
check("an admin can reopen the building", (await admin("/config", { lab: 3, tier: 1 })).status === 200);
const fresh = (await admin("/state")).data;
check("a reopened building starts a new run in lab 3", fresh.closed === false && fresh.day === dayBefore + 1 && fresh.labId === 3 && fresh.lab.seen === false && fresh.lab.door === false && fresh.echo === null);

// 11b-3. lab 1 "Joining": three stamps in the posted order, the card door, then the lever
// (C works here, A2 watches: A2 is near its 20 shifts a day)
// C has just worked labs 5 and 9 in quick shifts: let its flood window (60 messages in 10 s) lapse
await sleep(10_500);
check("an admin can move the run to lab 1 at tier 2", (await admin("/config", { lab: 1, tier: 2 })).status === 200);
const order1 = (await admin("/state")).data.lab.order;
check("tier 2: lab 1 posts an approval order", Array.isArray(order1) && [...order1].sort().join() === "0,1,2");
check("...never the plain 1-2-3", order1?.join() !== "0,1,2", JSON.stringify(order1));
const avoid1 = (await admin("/state")).data.lab.avoid;
check("...and never this run's exit order (kept on the server as lab.avoid)", Array.isArray(avoid1) && avoid1.length === 3 && avoid1.join() !== order1?.join(), JSON.stringify({ order1, avoid1 }));
const WHO = ["key", "tall", "light"];
// (the out-of-order refusal is checked in test/lab1.test.mjs: one more shift here would run
// into the per-person queue limit)
for (const [k, i] of order1.entries()) {
  await work(C, WHO[i]);
  await sleep(300);
  if (k === 0) {
    A2.clear();
    C.send({ t: "checkpoint", world: { lab: 1, seq: [0, 1, 2], door: true, lever: true } });
    const forged1 = await A2.wait((m) => m.t === "world" && m.world?.lab === 1);
    check("a worker cannot stamp, open the door or pull the lever by editing the world", forged1?.world.seq.length === 0 && forged1.world.door === false && forged1.world.lever === false);
    check("the run's exit order never reaches the clients' world", !!forged1 && !("avoid" in forged1.world), JSON.stringify(forged1?.world));
    await sleep(300);
    if (WHO[i] !== "key") {
      C.send({ t: "lab.act", what: "door" });
      check("only the card opens the card door", (await C.wait((m) => m.t === "error"))?.code === "cannot-act");
      await sleep(300);
    }
  }
  if (WHO[i] === "key") {
    C.send({ t: "lab.act", what: "door" });
    check("the card opens the card door (it stays open)", ["open", "already"].includes((await C.wait((m) => m.t === "lab.acted"))?.result));
    await sleep(300);
  }
  C.send({ t: "lab.act", what: "stamp" });
  check(`stamp ${k + 1} of 3 in order is accepted`, (await C.wait((m) => m.t === "lab.acted"))?.result === "stamped");
  if (k < 2) await clockOut(C, { lab: 1 });
}
check("everyone sees all three stamps", (await A2.wait((m) => m.t === "world" && m.world?.seq?.length === 3)) !== null);
A2.clear();
await clockOut(C, { lab: 1, lever: true }, { cleared: true });
const from1 = await A2.wait((m) => m.t === "lab.next");
check("clearing lab 1 moves the run on to lab 2", from1?.from === 1 && from1.lab === 2);

// 11b-4. lab 2 "Boxes": a box on the plate holds the gate, the crane drops its box, the lever
await admin("/config", { tier: 1 });
// some stored boxes are empty this opening (lab.weights; the last is the crane's box, always full)
const weights2 = (await admin("/state")).data.lab.weights ?? [];
const full2 = weights2.slice(0, -1).flatMap((w, i) => (w ? [i] : []));
const empty2 = weights2.slice(0, -1).flatMap((w, i) => (w ? [] : [i]));
check("lab 2: this opening has full and empty boxes, the crane's full", full2.length >= 1 && empty2.length >= 1 && weights2.at(-1) === 1, JSON.stringify(weights2));
const box2 = full2[0] ?? 0;
await work(C, "tall");
await sleep(400);
A2.clear();
C.send({ t: "checkpoint", world: { lab: 2, boxes: [{ col: 9, row: 19 }, { col: 31, row: 19 }], crane: -1, gate: true, lever: true, jam: true, weights: [1, 1, 1, 1] } });
const forged2 = await A2.wait((m) => m.t === "world" && m.world?.lab === 2);
check("a worker cannot move boxes, open the gate or pull the lever by editing the world", forged2?.world.gate === false && forged2.world.crane >= 0 && forged2.world.lever === false && forged2.world.boxes[0].col === 5);
check("...nor seal the plate or fill a box", forged2?.world.jam === false && JSON.stringify(forged2.world.weights) === JSON.stringify(weights2), JSON.stringify(forged2?.world.weights));
await sleep(300);
C.send({ t: "lab.act", what: `pick:${box2}` });
check("the walking aid lifts a full stored box", (await C.wait((m) => m.t === "lab.acted"))?.result === "picked");
await sleep(300);
C.send({ t: "lab.act", what: `drop:${box2}:9:19` });
check("...and sets it on the plate", (await C.wait((m) => m.t === "lab.acted"))?.result === "dropped");
check("everyone sees the gate open", (await A2.wait((m) => m.t === "world" && m.world?.gate === true)) !== null);
await sleep(300);
C.send({ t: "lab.act", what: `pick:${box2}` });
await C.wait((m) => m.t === "lab.acted");
A2.clear();
await clockOut(C, { lab: 2 });
check("a box carried at clock-out goes back where it was (the gate stays open)", (await A2.wait((m) => m.t === "world" && m.world?.lab === 2 && m.world.held === -1))?.world.gate === true);
// an empty box set on the plate seals it until the shift ends
if (empty2.length) {
  const j = empty2[0];
  await work(C, "tall");
  await sleep(300);
  C.send({ t: "lab.act", what: `pick:${j}` });
  check("the walking aid lifts an empty box (it looks like the others)", (await C.wait((m) => m.t === "lab.acted"))?.result === "picked");
  await sleep(300);
  A2.clear();
  C.send({ t: "lab.act", what: `drop:${j}:10:19` });
  check("an empty box set on the plate jams it", (await C.wait((m) => m.t === "lab.acted"))?.result === "jammed");
  const jammed2 = await A2.wait((m) => m.t === "world" && m.world?.lab === 2 && m.world.jam === true);
  check("everyone sees the plate sealed and the gate shut", jammed2?.world.gate === false, JSON.stringify(jammed2?.world));
  await sleep(300);
  C.send({ t: "lab.act", what: `pick:${box2}` });
  check("the sealed plate holds the full box on it", (await C.wait((m) => m.t === "lab.acted"))?.result === "sealed");
  A2.clear();
  await clockOut(C, { lab: 2 });
  const unjammed2 = await A2.wait((m) => m.t === "world" && m.world?.lab === 2 && m.world.jam === false);
  check("the seal lifts when the shift ends: the gate opens again (the empty box weighs nothing)", unjammed2?.world.gate === true, JSON.stringify(unjammed2?.world));
}
await work(C, "key");
await sleep(300);
C.send({ t: "lab.act", what: "crane:2" });
check("the card drops the crane's box at spot 3, under the lever", (await C.wait((m) => m.t === "lab.acted"))?.result === "craned");
await clockOut(C, { lab: 2 });
const tall2 = await work(C, "tall");
if (!tall2) console.log("NOTE  lab 2 last shift did not start", JSON.stringify({ socket: C.ws.readyState, last: C.seen.slice(-5).map((m) => m.t + (m.code ? ":" + m.code : "")) }));
A2.clear();
await clockOut(C, { lab: 2, lever: true }, { cleared: true });
const from2 = await A2.wait((m) => m.t === "lab.next");
check("clearing lab 2 moves the run on to lab 3", from2?.from === 2 && from2.lab === 3, JSON.stringify({ from2, st: await admin("/state").then((r) => ({ labId: r.data.labId, lab: r.data.lab, world: r.data.world, shift: r.data.shift, log: r.data.log?.slice?.(0, 2) })) }));
await admin("/config", { lab: 3, tier: 1 });

// 11c. more staff, more procedure: at tier 2 the first correct code only passes one round
await admin("/config", { tier: 2 });
await work(A2, "light");
A2.send({ t: "lab.read" });
const round1 = await A2.wait((m) => m.t === "lab.secret");
await clockOut(A2, labWorld());
await work(A2, "key");
await sleep(300);
A2.send({ t: "lab.enter", input: L3.codeFrom(round1?.code ?? [], (await admin("/state")).data.world?.issue) ?? [] });
check("tier 2: the first correct code passes one round", (await A2.wait((m) => m.t === "lab.result"))?.result === "pass");
const after1 = (await admin("/state")).data;
check("...and fresh glyphs are shown for the next round", after1.lab.passes === 1 && after1.lab.needed === 2 && after1.lab.door === false && after1.lab.gen === round1.gen + 1);
await clockOut(A2, labWorld());
await admin("/config", { tier: 1 });

// 11d. a trap: the worker's shift ends at once and the log says 산재 (accident)
await work(A2, "tall");
C.clear();
A2.send({ t: "shift.end", world: labWorld(), progress: 0, accident: "laser", tape: { frames: [[0, 40, 320, 1], [9, 263, 320, 1]] } });
check("a trap ends the shift as an accident", (await C.wait((m) => m.t === "log.add"))?.entry.reason === "accident");
await A2.role("viewer");

// 12. notes while working, and the shift time limit
check("shift length can be changed", (await admin("/config", { shiftSeconds: 2 })).status === 200);
C.clear();
A2.clear();
await C.join();
C.send({ t: "shift.start", character: "light" });
const working = await C.role("worker");
check("everyone is told when the shift ends", working?.shift.capAt - working?.shift.startedAt === 2000);
C.send({ t: "note.add", x: 5, y: 0, strokes });
check("worker can leave a note mid-shift", (await A2.wait((m) => m.t === "note.add"))?.note.nick === "씨");
check("server ends an overlong shift", (await C.wait((m) => m.t === "kicked", 6000))?.reason === "timeup");
check("overlong shift is logged as timeup", (await A2.wait((m) => m.t === "log.add"))?.entry.reason === "timeup");
await C.join();
C.send({ t: "shift.start", character: "light" });
await C.role("worker");
C.send({ t: "shift.end", world: world(false), progress: 0, timeup: true });
check("client-side timeup is logged as timeup", (await A2.wait((m) => m.t === "log.add"))?.entry.reason === "timeup");
await admin("/config", { shiftSeconds: 60 });
check("shift length is back to one minute", (await admin("/state")).data.shiftMs === 60000);

// 12b. the controller: a shift at the console with numbered pins and stamps
const target = (await admin("/state")).data.notes.find((n) => n.status === "ok" && n.lab === 3 && n.day === fresh.day);
const ctl = await work(A2, "control");
check("the controller card is offered and taken like any equipment", ctl?.shift.character === "control" && ctl.characters.includes("control"));
C.clear();
A2.send({ t: "pin.set", n: 1, x: 100, y: 320, msg: [0, 5] });
const pinned = await C.wait((m) => m.t === "pins");
check("a controller's pin and directive reach everyone", pinned?.pins.length === 1 && pinned.pins[0].n === 1 && pinned.pins[0].msg.join() === "0,5");
await sleep(250);
A2.send({ t: "pin.set", n: 2, x: 100, y: 320, msg: "free text" });
check("a directive must use the word list", (await A2.wait((m) => m.t === "error"))?.code === "bad-pin");
await sleep(250);
A2.send({ t: "pin.set", n: 7, x: 100, y: 320, msg: null });
check("only pins 1-3 exist", (await A2.wait((m) => m.t === "error"))?.code === "bad-pin");
C.send({ t: "pin.set", n: 2, x: 100, y: 320, msg: null });
check("only the controller can pin", (await C.wait((m) => m.t === "error"))?.code === "not-control");
if (target) {
  await sleep(250);
  A2.send({ t: "note.stamp", id: target.id, stamp: "wrong" });
  check("a stamp shows on the note for everyone", (await C.wait((m) => m.t === "note.update"))?.note.stamp === "wrong");
  check("the controller is told how many stamps are left", (await A2.wait((m) => m.t === "stamp.left"))?.left === 2);
  await sleep(250);
  A2.send({ t: "note.stamp", id: target.id, stamp: "nope" });
  check("only the three stamps exist", (await A2.wait((m) => m.t === "error"))?.code === "bad-stamp");
} else console.log("NOTE  no note to stamp; stamp checks skipped");
await clockOut(A2, labWorld());
check("the controller's shift is logged", (await C.wait((m) => m.t === "log.add"))?.entry.character === "control");
A2.send({ t: "room.tapes" }); // S3: the room's book keeps the controller's pins and stamps with their times
const booked = (await A2.wait((m) => m.t === "room.tapes" || m.t === "error"))?.room;
check("the room's book has the controller's pin", !!booked?.marks.some((m) => m.kind === "pin" && m.n === 1 && m.msg?.join() === "0,5" && m.logId === ctl?.shift.logId && Number.isFinite(m.at)), JSON.stringify(booked?.marks)?.slice(0, 300));
check("...and refused pins are not booked", !booked?.marks.some((m) => m.kind === "pin" && m.n === 7));
if (target) check("...and its stamp", !!booked?.marks.some((m) => m.kind === "stamp" && m.note === target.id && m.stamp === "wrong"));
// the next worker refuses the handover: the controller's pins and stamps go with it
await C.join();
C.clear();
C.send({ t: "shift.start", character: "key", reject: true });
const pinsBack = await C.wait((m) => m.t === "pins");
check("refusing a controller's handover takes its pins back", pinsBack?.pins.length === 0, JSON.stringify(pinsBack));
if (target) check("...and its stamps", (await admin("/state")).data.notes.find((n) => n.id === target.id)?.stamp === null);
await C.role("worker");
await clockOut(C, labWorld());

// 12c. request limits: a connection that floods is closed, and a person cannot spam actions
const F = new Client("폭주");
await F.open();
for (let i = 0; i < 70; i++) F.send({ t: "note.react", id: 1, kind: "help" });
check("a flooding connection is closed", (await F.wait((m) => m.t === "closing", 3000))?.code === 1008);
const G = new Client("반복");
await G.open();
for (let i = 0; i < 13; i++) G.send({ t: "queue.join" });
check("a person cannot spam shift requests", (await G.wait((m) => m.t === "error" && m.code === "rate-limited")) !== null);
G.send({ t: "queue.leave" });
await sleep(200);
G.ws.close();

// 12d. one worker at a time, whatever arrives at once
const R1 = new Client("경쟁1"), R2 = new Client("경쟁2");
await R1.open(); await R2.open();
await sleep(200);
R1.clear(); R2.clear();
const raceStart = Date.now();
R1.send({ t: "queue.join" }); R2.send({ t: "queue.join" }); // both at once
const winner = await Promise.race([R1.role("offered").then((m) => m && R1), R2.role("offered").then((m) => m && R2)]);
const loser = winner === R1 ? R2 : R1;
// the one offered clicks twice, the other tries to jump in, all in the same instant
winner.send({ t: "shift.start", character: "key" });
winner.send({ t: "shift.start", character: "tall" });
loser.send({ t: "shift.start", character: "light" });
await sleep(600);
const raced = (await admin("/state")).data;
const racedEntries = raced.log.filter((e) => (e.nick === "경쟁1" || e.nick === "경쟁2") && e.started_at >= raceStart);
check("only one worker when requests race", raced.shift?.cid === winner.cid && raced.shift.character === "key");
check("a double click does not clock in twice", racedEntries.length === 1);
check("the other is told it is not their turn", loser.seen.some((m) => m.t === "error" && m.code === "not-your-turn"));
check("the second click is refused too",winner.seen.some((m) => m.t === "error" && m.code === "not-your-turn"));
check("the other waits in the queue", raced.queue.includes(loser.cid));
// a second tab with the worker's id cannot work alongside: it replaces the first
const R3 = new Client("경쟁1");
R3.cid = winner.cid;
await R3.open();
check("the worker's second tab replaces the first",(await winner.wait((m) => m.t === "replaced", 2000)) !== null);
R3.send({ t: "shift.end", world: labWorld(), progress: 0 });
await sleep(300);
loser.send({ t: "queue.leave" });
await sleep(200);
for (const c of [R1, R2, R3]) c.ws.close();

// 13. nothing anyone received ever carried the code inside a world
const leaks = [A, B, C, A2].flatMap((c) => c.seen).filter((m) => (m.t === "world" || m.t === "welcome") && m.world && "code" in m.world);
check("no world message ever contains the code", leaks.length === 0, JSON.stringify(leaks[0] ?? ""));
const avoidLeaks = [A, B, C, A2].flatMap((c) => c.seen).filter((m) => (m.t === "world" || m.t === "welcome") && m.world && "avoid" in m.world);
check("no world message ever contains the run's exit order (lab 1's avoid)", avoidLeaks.length === 0, JSON.stringify(avoidLeaks[0] ?? ""));

await admin("/config", { stages: 2 }); // back to every stage for real play
for (const c of [A2, C]) c.ws.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
