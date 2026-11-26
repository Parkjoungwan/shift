import { DurableObject } from "cloudflare:workers";
import {
  ANON_NICK,
  LIMITS,
  type Character,
  type Env,
  cleanNick,
  cleanStrokes,
  json,
  validCid,
} from "./shared";
import { type LabState } from "./lab3";
import * as lab4 from "./lab4";
import { avoidOrder, practiceTape, type Lab1State } from "./lab1";
import * as lab9 from "./lab9";
import { FIRST, LABS, ORDER, type ServerLab, labNo, nextRoom, stageOf, stagesOf } from "./labs";
import { STAMPS, STAMPS_PER_SHIFT, cleanPin, type Phrase } from "../public/directives.js";
import { cleanLook } from "../public/badge.js";

/** A numbered floor pin left by a controller, with an optional fixed-vocabulary directive. */
interface Pin {
  n: number;
  x: number;
  y: number;
  msg: Phrase | null;
  logId: number;
}

/**
 * The CCTV recording of one shift. frames: [t, x, y, face] with t in tenths of a second from
 * the start of the shift (the worker's word, like every position); worlds: the world as
 * everyone saw it, from the start and after every change (the server's own record).
 */
interface Tape {
  logId: number;
  nick: string;
  look?: string; // the worker's ID photo (public/badge.js); "" or missing on older tapes
  character: Character;
  lab: number;
  startedAt: number;
  ms: number;
  frames: [number, number, number, number][];
  worlds: [number, unknown][];
}
const TAPE_FRAMES = 700; // 60 s at 10 per second, plus slack
const TAPE_WORLDS = 40;
const FLOOD_MS = 10_000;
const FLOOD_MAX = 60; // a burst of keypad presses or tool clicks stays far below this
// Request budgets (see "request budgets" in Building). The free plan allows ~100,000 a day.
const HOURLY_BUDGET = 3000; // ~72,000 a day at most, leaving room for the admin and the Worker
const MAX_SOCKETS_PER_CLIENT = 6; // open connections from one address (tabs, a few people behind one router)
const MAX_CONNECTS_PER_MINUTE = 10; // per address
// Headcount tiers (docs/campaign.md): different people in the last 24 h → procedure tier 1, 2 or 3.
const TIER_STAFF = [3, 10];
// One person's shifts in any 24 hours (the labour law): keeps one player from clearing alone overnight.
const DAILY_SHIFTS = 20;
const STAGES = 2; // stages (공정) per lab: a second room that twists the first (docs/campaign.md §2.2)
const ARCHIVE_TAPES = 120; // tapes sent for one cleared lab (about 10 KB each)
// Per-person action limits (by client id): [limit, window]
const ACTION_LIMITS: Record<string, [number, number]> = {
  "queue.join": [12, 60_000],
  "shift.start": [45, 3_600_000], // a shift is 60 s: more than this an hour is a script
  "report": [10, 3_600_000],
  "note.react": [30, 3_600_000],
  "hello": [10, 60_000], // reconnects and name changes
  "archive.get": [30, 3_600_000], // each reply carries a whole lab's tapes
  "room.tapes": [30, 3_600_000], // the open room's tapes so far (S3): as heavy as an archive entry
};

/**
 * One thing that happened in the open room that the tapes alone do not show (S3's event strip):
 * a terminal entry and its result, a pin set or cleared, a stamp. Never the input typed, never
 * the lab's hidden state. Kept per room opening, newest ROOM_MARKS.
 */
interface RoomMark {
  at: number;
  kind: "enter" | "pin" | "unpin" | "stamp";
  logId: number;
  result?: string;
  n?: number;
  x?: number;
  y?: number;
  msg?: Phrase | null;
  note?: number;
  stamp?: string | null;
}
const ROOM_MARKS = 300;

/** The echo is replayed from the live world, so the tape does not carry it. */
function withoutEcho(world: unknown): unknown {
  if (!world || typeof world !== "object") return world ?? null;
  const { echo: _echo, ...rest } = world as Record<string, unknown>;
  return rest;
}

/** Checks the frames a worker hands in: up to TAPE_FRAMES of [t, x, y, face], whole numbers in range. */
function cleanFrames(input: unknown): Tape["frames"] | null {
  if (!Array.isArray(input) || !input.length || input.length > TAPE_FRAMES) return null;
  const out: Tape["frames"] = [];
  for (const f of input) {
    if (!Array.isArray(f) || f.length !== 4) return null;
    const [t, x, y, face] = f.map(Number);
    if (![t, x, y].every(Number.isFinite)) return null;
    out.push([Math.max(0, Math.min(TAPE_FRAMES, Math.round(t))), Math.max(-50, Math.min(700, Math.round(x))), Math.max(-50, Math.min(450, Math.round(y))), face === -1 ? -1 : 1]);
  }
  return out;
}

/** Per-connection data. Survives hibernation via serializeAttachment. */
interface Att {
  cid: string; // anonymous client id, "" until hello
  nick: string;
  look?: string; // ID photo (public/badge.js), "" when none
  last: number; // last input time while working
}

interface Shift {
  logId: number;
  cid: string;
  nick: string;
  look?: string;
  character: Character;
  startedAt: number;
}

interface Offer {
  cid: string;
  deadline: number;
}

type Row = Record<string, SqlStorageValue>;

/**
 * One shared building. Only one connected player works at a time; everyone else
 * watches. The working client is the source of truth for the world: the server stores
 * the world it checkpoints. Positions are not streamed: the worker records its shift and
 * hands the recording (the "tape") in when it clocks out, and spectators watch that tape
 * on the CCTV while the next shift works. One message per shift instead of 600.
 */
export class Building extends DurableObject<Env> {
  private sql: SqlStorage;
  private cache = new Map<string, unknown>();
  private lastCheckpoint = 0;
  private lastCall = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, cid TEXT NOT NULL,
        nick TEXT NOT NULL, character TEXT NOT NULL, started_at INTEGER NOT NULL,
        ended_at INTEGER, reason TEXT, progress INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0, masked INTEGER NOT NULL DEFAULT 0,
        reports INTEGER NOT NULL DEFAULT 0, reviewed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, log_id INTEGER NOT NULL,
        cid TEXT NOT NULL, nick TEXT NOT NULL, character TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ok', reports INTEGER NOT NULL DEFAULT 0,
        reviewed INTEGER NOT NULL DEFAULT 0, help INTEGER NOT NULL DEFAULT 0,
        funny INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS marks (
        kind TEXT NOT NULL, target INTEGER NOT NULL, cid TEXT NOT NULL, at INTEGER NOT NULL,
        PRIMARY KEY (kind, target, cid));
      CREATE TABLE IF NOT EXISTS bans (cid TEXT PRIMARY KEY, at INTEGER NOT NULL, reason TEXT);
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, detail TEXT);
    `);
    // Notes belong to one lab of one day (column added after the first deploy).
    // Columns added after the first deploy: which lab a note belongs to, and a controller's stamp on it.
    for (const [table, column] of [["notes", "lab INTEGER NOT NULL DEFAULT 3"], ["notes", "stamp TEXT"], ["notes", "stamp_log INTEGER"], ["log", "lab INTEGER NOT NULL DEFAULT 3"], ["log", "look TEXT NOT NULL DEFAULT ''"]]) {
      try {
        this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
      } catch {
        // already there
      }
    }
    // The record (docs/campaign.md): every shift's tape, and one row per cleared lab with its
    // notes and pins frozen as they were. Cleared labs are never played again.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tapes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run INTEGER NOT NULL, lab INTEGER NOT NULL,
        log_id INTEGER NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run INTEGER NOT NULL, lab INTEGER NOT NULL, tier INTEGER NOT NULL,
        opened_at INTEGER NOT NULL, cleared_at INTEGER NOT NULL, shifts INTEGER NOT NULL, accidents INTEGER NOT NULL,
        people INTEGER NOT NULL, closer TEXT, notes TEXT NOT NULL, pins TEXT NOT NULL);
    `);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- small storage helpers ----------

  private get<T>(key: string, fallback: T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const row = this.sql.exec("SELECT value FROM kv WHERE key = ?", key).toArray()[0];
    const value = row ? (JSON.parse(row.value as string) as T) : fallback;
    this.cache.set(key, value);
    return value;
  }

  private put(key: string, value: unknown): void {
    this.cache.set(key, value);
    this.sql.exec(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }

  private rows(query: string, ...args: SqlStorageValue[]): Row[] {
    return this.sql.exec(query, ...args).toArray() as Row[];
  }

  private get day(): number {
    return this.get<number>("day", 1);
  }
  private get shift(): Shift | null {
    return this.get<Shift | null>("shift", null);
  }
  private get offer(): Offer | null {
    return this.get<Offer | null>("offer", null);
  }
  private get queue(): string[] {
    return this.get<string[]>("queue", []);
  }
  /** The shared world as everyone may see it (no secret code, server-owned fields applied). */
  private get world(): unknown {
    return this.get<unknown>("world", null);
  }
  /** Which lab the run is in. */
  private get labId(): number {
    return this.get<number>("labId", FIRST);
  }
  private get rules(): ServerLab {
    return LABS[this.labId] ?? LABS[FIRST];
  }
  /** The equipment cards on offer: the lab's own, plus the controller in every lab. */
  private get characters(): Character[] {
    return [...this.rules.characters, "control"];
  }
  /** Controllers' numbered pins in the current lab. */
  private get pins(): Pin[] {
    return this.get<Pin[]>("pins", []);
  }
  /** The current lab's server-side state (lab 3: the code; lab 4: the lift). */
  private get lab(): any {
    let lab = this.get<unknown>("lab", null);
    if (!lab) {
      lab = this.rules.newState();
      this.put("lab", lab);
    }
    return lab;
  }
  /** The echo left by the last echo-recorder shift in this lab, replayed by every client. */
  private get echo(): lab4.Echo | null {
    return this.get<lab4.Echo | null>("echo", null);
  }
  private publicWorld(world: unknown): unknown {
    const pub = this.rules.publicWorld(world, this.lab) as Record<string, unknown> | null;
    if (pub) pub.echo = this.echo;
    return pub;
  }
  /** Stores a world sent by the worker, keeping only what the worker is allowed to change. */
  private setWorld(world: unknown): unknown {
    const pub = this.publicWorld(world);
    this.put("world", pub);
    return pub;
  }
  private refreshWorld(): void {
    this.put("world", this.publicWorld(this.world));
  }
  /** Adds the world as it is now to the running shift's tape (the CCTV's record of the room). */
  private noteWorld(): void {
    const shift = this.shift;
    if (!shift) return;
    const worlds = this.get<[number, unknown][]>("tapeWorlds", []);
    if (worlds.length >= TAPE_WORLDS) return;
    const t = Math.max(0, Math.round((Date.now() - shift.startedAt) / 100));
    this.put("tapeWorlds", [...worlds, [t, withoutEcho(this.world)]]);
  }
  /**
   * How much procedure a lab asks for when it opens, from how many different people worked in
   * the last 24 hours: more staff, more verification (docs/campaign.md). Decided once, at opening.
   */
  private staffTier(): number {
    const people = this.rows(
      "SELECT COUNT(DISTINCT cid) AS n FROM log WHERE started_at > ? AND rejected = 0",
      Date.now() - 86_400_000,
    )[0].n as number;
    return people <= TIER_STAFF[0] ? 1 : people <= TIER_STAFF[1] ? 2 : 3;
  }
  private get tier(): number {
    return this.get<number>("labTier", 1);
  }
  /** Stages (공정): which stage of its lab this room is, and how many the lab has (src/labs.ts). */
  private get stage(): number {
    return stageOf(this.labId);
  }
  private get valve(): number {
    return this.get<number>("stages", STAGES);
  }
  private get stages(): number {
    return stagesOf(this.labId, this.valve);
  }
  /**
   * Shift 0 of the last lab (docs/level-design.md): the overseer works it itself. Its tape shows
   * it walking up to the old note by the entrance and standing there until its 60 seconds run
   * out. It goes out on the CCTV when the lab opens, and into the record like any shift.
   */
  private overseerShift(): void {
    const frames: Tape["frames"] = [];
    for (let t = 0; t <= 600; t += 2) {
      const x = t < 12 ? 40 + (t / 12) * 76 : 116; // to the note in just over a second
      frames.push([t, Math.round(x), 320, 1]);
    }
    const tape: Tape = { logId: 0, nick: "감독관", character: "control", lab: 9, startedAt: Date.now(), ms: 60_000, frames, worlds: [[0, null]] };
    this.put("tape", tape);
    this.sql.exec("INSERT INTO tapes (run, lab, log_id, data, at) VALUES (?, ?, ?, ?, ?)", this.day, 9, 0, JSON.stringify(tape), Date.now());
  }

  /**
   * The order of 「퇴근」's exit terminal for this run (S5, reports/퍼즐 깊이 설계 리서치.md): drawn
   * once per run and stored, so lab 1's practice tape and lab 9's terminal always agree.
   */
  private exitOrder(): number[] {
    const kept = this.get<{ run: number; order: number[] } | null>("exitOrder", null);
    if (kept && kept.run === this.day) return kept.order;
    const order = lab9.randomOrder();
    this.put("exitOrder", { run: this.day, order });
    return order;
  }

  /**
   * The overseer's practice shift, filed with lab 1's record when lab 1 is cleared: no number,
   * stamping the three stations in the exit terminal's order. It goes into the record only (no
   * CCTV, no live tape): the archive is the one place that order exists.
   */
  private recordPractice(): void {
    const tape = practiceTape(this.exitOrder(), Date.now());
    this.sql.exec("INSERT INTO tapes (run, lab, log_id, data, at) VALUES (?, ?, ?, ?, ?)", this.day, 1, 0, JSON.stringify(tape), Date.now());
  }

  /** After the last lab: no more shifts, only the record. */
  private get closed(): boolean {
    return this.get<boolean>("closed", false);
  }

  /** Files the lab just cleared: its counts, and its notes and pins frozen as they are now. */
  private archiveLab(closer: string): void {
    const openedAt = this.get<number>("labOpenedAt", 0);
    const stats = this.rows(
      `SELECT COUNT(*) AS shifts, SUM(reason = 'accident') AS accidents, COUNT(DISTINCT cid) AS people
       FROM log WHERE day = ? AND lab = ? AND started_at >= ? AND rejected = 0`,
      this.day,
      this.labId,
      openedAt,
    )[0];
    this.sql.exec(
      `INSERT INTO archive (run, lab, tier, opened_at, cleared_at, shifts, accidents, people, closer, notes, pins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.day,
      this.labId,
      this.tier,
      openedAt,
      Date.now(),
      (stats.shifts as number) ?? 0,
      (stats.accidents as number) ?? 0,
      (stats.people as number) ?? 0,
      closer,
      JSON.stringify(this.visibleNotes()),
      JSON.stringify(this.pins),
    );
    if (this.labId === 1) this.recordPractice();
  }

  /** The cleared labs, oldest first, without their tapes. */
  private archiveList() {
    // keep: from 「퇴근」 on, this run's lab 1 record (the one with the overseer's practice tape) is
    // stamped 보존 (preserved) in the list; the overseer points at it (S5)
    const keepRun = this.labId === 9 || this.closed ? this.day : -1;
    const practiced = new Set(this.rows("SELECT DISTINCT run FROM tapes WHERE lab = 1 AND log_id = 0").map((r) => r.run));
    // crew: who worked the room, in order of their first shift there (moderated names stay hidden)
    return this.rows(
      `SELECT a.id, a.run, a.lab, a.tier, a.opened_at, a.cleared_at, a.shifts, a.accidents, a.people, a.closer,
        (SELECT GROUP_CONCAT(n, char(31)) FROM (
           SELECT CASE WHEN MAX(masked) THEN ? ELSE nick END AS n, MIN(id) AS first FROM log
           WHERE day = a.run AND lab = a.lab AND started_at >= a.opened_at AND started_at <= a.cleared_at AND rejected = 0
           GROUP BY cid ORDER BY first LIMIT 12)) AS crew
       FROM archive a ORDER BY a.id`,
      ANON_NICK,
    ).map((r) => ({
      id: r.id, run: r.run, lab: r.lab, tier: r.tier, openedAt: r.opened_at, clearedAt: r.cleared_at,
      shifts: r.shifts, accidents: r.accidents, people: r.people, closer: r.closer,
      crew: r.crew ? String(r.crew).split(String.fromCharCode(31)) : [],
      keep: r.lab === 1 && r.run === keepRun && practiced.has(r.run),
    }));
  }

  /** One cleared lab in full: its tapes in order, and its frozen notes and pins. */
  private archiveEntry(id: number) {
    const row = this.rows("SELECT * FROM archive WHERE id = ?", id)[0];
    if (!row) return null;
    const tapes = this.rows(
      "SELECT data FROM tapes WHERE run = ? AND lab = ? AND at >= ? AND at <= ? ORDER BY id LIMIT ?",
      row.run,
      row.lab,
      row.opened_at,
      (row.cleared_at as number) + 5_000,
      ARCHIVE_TAPES,
    ).map((t) => JSON.parse(t.data as string));
    // every shift worked in the room, taped or not (a controller's shift has no tape), with how it ended
    const logRows = this.rows(
      "SELECT * FROM log WHERE day = ? AND lab = ? AND started_at >= ? AND started_at <= ? ORDER BY id",
      row.run,
      row.lab,
      row.opened_at,
      row.cleared_at,
    );
    const shifts = logRows.map((r) => this.publicLog(r));
    // a reported and hidden name stays hidden on its tape too
    const masked = new Set(logRows.filter((r) => r.masked).map((r) => r.id as number));
    for (const tape of tapes) if (masked.has(tape.logId)) Object.assign(tape, { nick: ANON_NICK, look: "" });
    return { id, lab: row.lab, tapes, shifts, notes: JSON.parse(row.notes as string), pins: JSON.parse(row.pins as string) };
  }

  /** Starts a room from scratch: fresh state, no echo, no pins. */
  private enterLab(id: number): void {
    const tier = this.staffTier();
    this.put("labTier", tier);
    this.put("labOpenedAt", Date.now());
    this.put("pins", []);
    this.put("labId", id);
    const state = LABS[id].newState(tier);
    // lab 1 must never hand out the run's exit order as its own stamp order (S5)
    if (id === 1) avoidOrder(state as Lab1State, this.exitOrder());
    if (id === 9) (state as lab9.Lab9State).order = this.exitOrder(); // the order lab 1's practice tape shows
    this.put("lab", state);
    if (id === 9) this.overseerShift();
    this.put("echo", null);
    // What everyone may see of the fresh lab before anyone works it: the posted order, the room's
    // phase, where the boxes are. Labs with nothing to show yet stay at null (a fresh run).
    this.put("world", this.publicWorld(null));
    this.put("shiftStartWorld", null);
    this.put("shiftStartLab", null);
    this.put("shiftStartEcho", null);
    this.put("shiftStartPins", null);
  }

  /** Length of one shift. Every shift is this short, whether or not anyone is waiting. */
  private get shiftMs(): number {
    return this.get<number>("shiftMs", LIMITS.maxShiftMs);
  }

  /** Shifts this person started in the last 24 hours (from the log, so it survives sleep). */
  private shiftsToday(cid: string): number {
    return this.rows("SELECT COUNT(*) AS n FROM log WHERE cid = ? AND started_at > ?", cid, Date.now() - 86_400_000)[0].n as number;
  }

  private banned(cid: string): boolean {
    return this.rows("SELECT 1 FROM bans WHERE cid = ?", cid).length > 0;
  }

  private act(action: string, detail: unknown): void {
    this.sql.exec(
      "INSERT INTO actions (at, action, detail) VALUES (?, ?, ?)",
      Date.now(),
      action,
      JSON.stringify(detail),
    );
  }

  // ---------- sockets ----------

  private att(ws: WebSocket): Att {
    return (ws.deserializeAttachment() as Att | null) ?? { cid: "", nick: "", last: 0 };
  }

  private sockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except);
  }

  private socketFor(cid: string, except?: WebSocket): WebSocket | undefined {
    return this.sockets(except).find((ws) => this.att(ws).cid === cid);
  }

  private send(ws: WebSocket, msg: unknown): void {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
      // socket already gone; its close handler cleans up
    }
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    for (const ws of this.sockets(except)) this.send(ws, text);
  }

  // ---------- public views (never contain client ids) ----------

  private publicLog(r: Row) {
    return {
      id: r.id,
      day: r.day,
      nick: r.masked ? ANON_NICK : r.nick,
      look: r.masked ? "" : (r.look ?? ""),
      character: r.character,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      reason: r.reason,
      progress: r.progress,
      rejected: !!r.rejected,
    };
  }

  private publicNote(r: Row) {
    const author = this.rows("SELECT masked, look FROM log WHERE id = ?", r.log_id)[0];
    const masked = author?.masked;
    return {
      id: r.id,
      logId: r.log_id,
      nick: masked ? ANON_NICK : r.nick,
      look: masked ? "" : (author?.look ?? ""),
      character: r.character,
      x: r.x,
      y: r.y,
      strokes: JSON.parse(r.data as string),
      blurred: r.status === "blur",
      help: r.help,
      funny: r.funny,
      stamp: r.stamp ?? null,
    };
  }

  private visibleNotes() {
    return this.rows(
      "SELECT * FROM notes WHERE day = ? AND lab = ? AND status IN ('ok', 'blur') ORDER BY id",
      this.day,
      this.labId,
    ).map((r) => this.publicNote(r));
  }

  private recentLog() {
    return this.rows("SELECT * FROM log WHERE ended_at IS NOT NULL ORDER BY id DESC LIMIT 30").map((r) =>
      this.publicLog(r),
    );
  }

  /** Sends everyone the current staffing, with their own role in it. */
  private sync(except?: WebSocket): void {
    const shift = this.shift;
    const offer = this.offer;
    const queue = this.queue;
    const all = this.sockets(except);
    const nicks = new Map(all.map((ws) => [this.att(ws).cid, this.att(ws).nick]));
    const looks = new Map(all.map((ws) => [this.att(ws).cid, this.att(ws).look ?? ""]));
    const waiting = queue.filter((cid) => cid !== offer?.cid);
    const base = {
      t: "sync",
      now: Date.now(), // lets clients count down on the server's clock
      day: this.day,
      lab: this.labId,
      tier: this.tier,
      stage: this.stage,
      stages: this.stages,
      closed: this.closed,
      characters: this.characters,
      viewers: all.length,
      shift: shift && {
        logId: shift.logId,
        nick: shift.nick,
        look: shift.look ?? "",
        character: shift.character,
        startedAt: shift.startedAt,
        capAt: shift.startedAt + this.shiftMs,
      },
      choosing: offer ? (nicks.get(offer.cid) ?? null) : null,
      queue: waiting.map((cid) => nicks.get(cid) ?? "?"),
      queueLooks: waiting.map((cid) => looks.get(cid) ?? ""),
    };
    for (const ws of all) {
      const { cid } = this.att(ws);
      let you: Record<string, unknown> = { role: "viewer" };
      if (cid && shift?.cid === cid) you = { role: "worker" };
      else if (cid && offer?.cid === cid) you = { role: "offered", deadline: offer.deadline };
      else if (cid && waiting.includes(cid)) you = { role: "queued", pos: waiting.indexOf(cid) + 1 };
      this.send(ws, { ...base, you });
    }
  }

  // ---------- shift flow ----------

  /** Offers the next free turn to the first connected person in the queue. */
  private advance(except?: WebSocket): void {
    if (this.shift) return;
    const now = Date.now();
    let queue = [...this.queue];
    const offer = this.offer;
    if (offer) {
      if (offer.deadline > now && this.socketFor(offer.cid, except)) return;
      queue = queue.filter((cid) => cid !== offer.cid); // timed out or left
      this.put("offer", null);
    }
    while (queue.length > 0) {
      const cid = queue[0];
      if (this.socketFor(cid, except) && !this.banned(cid)) {
        this.put("offer", { cid, deadline: now + LIMITS.offerMs } satisfies Offer);
        break;
      }
      queue.shift();
    }
    this.put("queue", queue);
    this.scheduleAlarm();
  }

  private scheduleAlarm(): void {
    const shift = this.shift;
    const offer = this.offer;
    if (shift) {
      const limit = shift.startedAt + this.shiftMs + LIMITS.shiftGraceMs;
      void this.ctx.storage.setAlarm(Math.min(Date.now() + LIMITS.alarmMs, limit));
    }
    else if (offer) void this.ctx.storage.setAlarm(offer.deadline + 100);
    else void this.ctx.storage.deleteAlarm();
  }

  private startShift(ws: WebSocket, att: Att, character: Character, reject: boolean): void {
    const now = Date.now();
    if (reject) {
      // Refuse the handover: put the building back to how the previous shift found it.
      const prev = this.rows(
        "SELECT * FROM log WHERE day = ? AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1",
        this.day,
      )[0];
      if (prev && !prev.rejected) {
        this.restoreShiftStart();
        this.sql.exec("UPDATE log SET rejected = 1 WHERE id = ?", prev.id);
        const gone = this.rows(
          "SELECT id FROM notes WHERE log_id = ? AND status IN ('ok', 'blur')",
          prev.id,
        );
        this.sql.exec("UPDATE notes SET status = 'rejected' WHERE log_id = ? AND status IN ('ok', 'blur')", prev.id);
        for (const n of gone) this.broadcast({ t: "note.remove", id: n.id });
        // a refused controller's stamps go too (its pins went back with restoreShiftStart)
        const stamped = this.rows("SELECT * FROM notes WHERE stamp_log = ? AND status IN ('ok', 'blur')", prev.id);
        this.sql.exec("UPDATE notes SET stamp = NULL, stamp_log = NULL WHERE stamp_log = ?", prev.id);
        for (const n of stamped) this.broadcast({ t: "note.update", note: this.publicNote({ ...n, stamp: null }) });
        this.broadcast({ t: "pins", pins: this.pins });
        this.broadcast({ t: "world", world: this.world, reverted: true });
        this.broadcast({ t: "log.update", entry: this.publicLog({ ...prev, rejected: 1 }) });
      }
    }
    this.put("shiftStartWorld", this.world);
    this.put("shiftStartLab", this.lab);
    this.put("shiftStartEcho", this.echo);
    this.put("shiftStartPins", this.pins);
    this.put("tapeWorlds", [[0, withoutEcho(this.world)]]);
    const logId = this.sql
      .exec(
        "INSERT INTO log (day, lab, cid, nick, look, character, started_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
        this.day,
        this.labId,
        att.cid,
        att.nick,
        att.look ?? "",
        character,
        now,
      )
      .one().id as number;
    this.put("shift", { logId, cid: att.cid, nick: att.nick, look: att.look ?? "", character, startedAt: now } satisfies Shift);
    this.put("offer", null);
    this.put("queue", this.queue.filter((cid) => cid !== att.cid));
    att.last = now;
    ws.serializeAttachment(att);
    this.scheduleAlarm();
    this.sync();
  }

  private restoreShiftStart(): void {
    this.put("lab", this.get<unknown>("shiftStartLab", null) ?? this.rules.newState());
    this.put("echo", this.get<lab4.Echo | null>("shiftStartEcho", null));
    this.put("pins", this.get<Pin[] | null>("shiftStartPins", null) ?? []);
    this.put("world", this.publicWorld(this.get<unknown>("shiftStartWorld", null)));
  }

  private endShift(
    reason: string,
    opts: { world?: unknown; progress?: number; cleared?: boolean; except?: WebSocket; echoFrames?: unknown; tape?: unknown } = {},
  ): void {
    const shift = this.shift;
    if (!shift) return;
    if (opts.world !== undefined) {
      this.setWorld(opts.world);
      this.noteWorld();
    }
    // The shift's CCTV tape: the worker's frames (only a clock-out brings them) and the server's worlds.
    const frames = cleanFrames((opts.tape as { frames?: unknown } | undefined)?.frames);
    let echoed = false;
    if (shift.character === "echo") {
      // The last 8 seconds of this shift stay behind and keep repeating. The worker's own
      // recording comes with a clock-out; failing that, the tail of its tape. Positions are the
      // client's word either way, like everything else about movement.
      const echoFrames = lab4.cleanFrames(opts.echoFrames);
      let echo: lab4.Echo | null = echoFrames ? { at: Date.now(), frames: echoFrames } : null;
      if (!echo && frames) {
        echo = lab4.recordEcho(frames.map(([t, x, y, f]) => ({ t: shift.startedAt + t * 100, x, y, f })), Date.now());
      }
      if (echo) {
        this.put("echo", echo);
        echoed = true;
      }
    }
    // a lab may tidy up after a shift (lab 2: a box still being carried goes back where it was)
    const lab = this.lab;
    const tidied = !!this.rules.shiftEnded?.(lab);
    if (tidied) this.put("lab", lab);
    if (echoed || tidied) {
      this.refreshWorld();
      this.broadcast({ t: "world", world: this.world }, opts.except);
    }
    if (frames) {
      const tape: Tape = {
        logId: shift.logId, nick: shift.nick, look: shift.look ?? "", character: shift.character, lab: this.labId,
        startedAt: shift.startedAt, ms: Math.min(Date.now() - shift.startedAt, this.shiftMs + LIMITS.shiftGraceMs),
        frames, worlds: this.get<[number, unknown][]>("tapeWorlds", []),
      };
      this.put("tape", tape);
      // every tape goes in the record, for the archive's fast-forward
      this.sql.exec("INSERT INTO tapes (run, lab, log_id, data, at) VALUES (?, ?, ?, ?, ?)", this.day, this.labId, shift.logId, JSON.stringify(tape), Date.now());
      this.broadcast({ t: "tape", tape }, opts.except);
    }
    this.put("tapeWorlds", []);
    const progress = Number.isFinite(opts.progress) ? Math.max(0, Math.floor(opts.progress!)) : null;
    this.sql.exec(
      "UPDATE log SET ended_at = ?, reason = ?, progress = COALESCE(?, progress) WHERE id = ?",
      Date.now(),
      opts.cleared ? "cleared" : reason,
      progress,
      shift.logId,
    );
    this.put("shift", null);
    const entry = this.rows("SELECT * FROM log WHERE id = ?", shift.logId)[0];
    this.broadcast({ t: "log.add", entry: this.publicLog(entry) }, opts.except);

    if (opts.cleared) {
      const day = this.day;
      const from = this.labId;
      this.archiveLab(shift.nick);
      const next = nextRoom(from, this.valve);
      if (next !== undefined) {
        // On to the next lab at once (no waiting: a rater who arrives now can always play).
        this.enterLab(next);
        this.broadcast({ t: "lab.next", from, lab: next, tier: this.tier, stage: this.stage, stages: this.stages }, opts.except);
        this.broadcast({ t: "world", world: this.world, lab: next }, opts.except);
        const opening = this.get<Tape | null>("tape", null); // the last lab opens with the overseer's own shift
        if (opening?.lab === next) this.broadcast({ t: "tape", tape: opening }, opts.except);
      } else {
        // The last lab is done: roll credits and close the building. Only the record stays open.
        const credits = this.rows(
          "SELECT * FROM log WHERE day = ? AND rejected = 0 ORDER BY id",
          day,
        ).map((r) => this.publicLog(r));
        this.put("closed", true);
        this.put("queue", []);
        this.put("offer", null);
        this.broadcast({ t: "day.clear", day, credits, closed: true }, opts.except);
      }
      this.broadcast({ t: "archive.list", archive: this.archiveList() }, opts.except);
      this.broadcast({ t: "notes", notes: [] }, opts.except);
      this.broadcast({ t: "pins", pins: [] }, opts.except);
    } else if (this.rules.forge) {
      // Labs 5 and 5-2: the overseer keeps one forged directive up, rewritten after every shift.
      // It signs with a real shift number that was not the control desk (or nothing), and is
      // sometimes true: only the shift log and the tapes tell (S4, reports/퍼즐 깊이 설계 리서치.md).
      // It takes a free pin number (a controller can tear it down like any pin).
      const forged = this.rules.forge(this.lab, { logId: shift.logId, character: shift.character });
      const logId = forged.logId ?? 0;
      const pins = this.pins;
      const mine = this.get<{ n: number; logId: number } | null>("forgedPin", null);
      const own = (mine && pins.find((p) => p.n === mine.n && p.logId === mine.logId)) ?? pins.find((p) => p.logId === 0);
      const n = own?.n ?? [3, 2, 1].find((k) => !pins.some((p) => p.n === k));
      if (n !== undefined) {
        const next = pins.filter((p) => p.n !== n).concat({ n, x: forged.x, y: forged.y, msg: forged.msg as Pin["msg"], logId });
        next.sort((a, b) => a.n - b.n);
        this.put("pins", next);
        this.put("forgedPin", { n, logId });
        this.noteRoomMark({ kind: "pin", logId, n, x: forged.x, y: forged.y, msg: forged.msg as Pin["msg"] });
        this.broadcast({ t: "pins", pins: next }, opts.except);
      }
    }
    this.advance(opts.except);
    this.sync(opts.except);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const shift = this.shift;
    if (shift) {
      const ws = this.socketFor(shift.cid);
      if (!ws) {
        this.endShift("disconnected");
      } else if (now - this.att(ws).last > LIMITS.idleMs) {
        this.send(ws, { t: "kicked", reason: "idle" });
        this.endShift("idle");
      } else if (now - shift.startedAt >= this.shiftMs) {
        this.send(ws, { t: "kicked", reason: "timeup" });
        this.endShift("timeup");
      }
    } else {
      const before = this.offer?.cid;
      this.advance();
      if (this.offer?.cid !== before) this.sync();
    }
    this.scheduleAlarm();
  }

  /**
   * Flood guard. Every incoming message counts against the free plan's daily requests, and a
   * real player sends a handful per shift now that positions travel as one tape. A connection
   * that sends more than FLOOD_MAX messages in FLOOD_MS is closed. (In memory: a fresh count
   * after the object sleeps, which is fine for a guard.)
   */
  private rates = new Map<WebSocket, { start: number; n: number }>();
  private flooding(ws: WebSocket): boolean {
    const now = Date.now();
    const r = this.rates.get(ws);
    if (!r || now - r.start > FLOOD_MS) {
      this.rates.set(ws, { start: now, n: 1 });
      return false;
    }
    return ++r.n > FLOOD_MAX;
  }

  // ---------- WebSocket handlers (hibernation API) ----------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/admin/api/")) return this.admin(request, url);

    // Guards before a connection is accepted (every one costs the shared free quota):
    // the building's hourly budget, then per address (a salted hash from the Worker).
    const client = (request.headers.get("X-Shift-Client") ?? "local").slice(0, 32);
    if (!this.spend(1)) return new Response("busy", { status: 503 });
    if (this.ctx.getWebSockets(client).length >= MAX_SOCKETS_PER_CLIENT || !this.allow(`connect:${client}`, MAX_CONNECTS_PER_MINUTE, 60_000)) {
      return new Response("too many connections", { status: 429 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [client]);
    pair[1].serializeAttachment({ cid: "", nick: "", last: 0 } satisfies Att);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------- request budgets ----------
  // The free plan allows about 100,000 requests a day; a new connection costs 1 and incoming
  // WebSocket messages cost 1 per 20. The building spends at most HOURLY_BUDGET an hour so
  // that a burst (or an attack) can only use up one hour, not the whole day. In memory: the
  // object only sleeps when it is quiet, and then the budget does not matter.

  private hour = { start: 0, cost: 0 };
  /** Spends from this hour's budget; false when it is used up. */
  private spend(cost: number): boolean {
    const now = Date.now();
    if (now - this.hour.start > 3_600_000) this.hour = { start: now, cost: 0 };
    if (this.hour.cost + cost > HOURLY_BUDGET) return false;
    this.hour.cost += cost;
    return true;
  }

  /** A sliding-window limit: at most `limit` events per `windowMs` for this key. */
  private events = new Map<string, number[]>();
  private allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    if (this.events.size > 5000) this.events.clear(); // keep memory bounded; a reset is harmless
    const times = (this.events.get(key) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= limit) {
      this.events.set(key, times);
      return false;
    }
    times.push(now);
    this.events.set(key, times);
    return true;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    if (message.length > LIMITS.maxMessage) return ws.close(1009, "message too big");
    // Say why before closing: a close handshake can stall, and the client should stop at once.
    if (this.flooding(ws)) {
      this.rates.delete(ws);
      this.send(ws, { t: "closing", code: 1008 });
      return ws.close(1008, "too many messages");
    }
    if (!this.spend(1 / 20)) { // the hour's budget is spent: the client plays solo
      this.send(ws, { t: "closing", code: 1013 });
      return ws.close(1013, "busy");
    }
    const att = this.att(ws);
    // Old clients streamed positions as "s{...}"; positions now travel as a tape at clock-out.
    if (message[0] === "s") return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    // per-person limits on the actions that are worth limiting
    const rule = ACTION_LIMITS[msg.t as string];
    if (rule && !this.allow(`${msg.t}:${att.cid || String(msg.cid ?? "")}`, rule[0], rule[1])) {
      return this.send(ws, { t: "error", code: "rate-limited" });
    }

    if (msg.t === "hello") return this.onHello(ws, att, msg);
    if (!att.cid) return this.send(ws, { t: "error", code: "hello-first" });

    switch (msg.t) {
      case "queue.join": {
        if (this.closed) return this.send(ws, { t: "error", code: "closed" });
        if (this.banned(att.cid)) return this.send(ws, { t: "error", code: "banned" });
        if (!att.nick) return this.send(ws, { t: "error", code: "nick-required" });
        if (this.shiftsToday(att.cid) >= DAILY_SHIFTS) return this.send(ws, { t: "error", code: "daily-limit" });
        const queue = this.queue;
        if (this.shift?.cid === att.cid || queue.includes(att.cid)) return;
        if (queue.length >= LIMITS.maxQueue) return this.send(ws, { t: "error", code: "queue-full" });
        this.put("queue", [...queue, att.cid]);
        this.advance();
        this.sync();
        return;
      }
      case "queue.leave": {
        this.put("queue", this.queue.filter((cid) => cid !== att.cid));
        if (this.offer?.cid === att.cid) this.put("offer", null);
        this.advance();
        this.sync();
        return;
      }
      case "shift.start": {
        if (this.offer?.cid !== att.cid || this.shift || this.closed) return this.send(ws, { t: "error", code: "not-your-turn" });
        // a reload keeps the offer but says hello without a name until the form is sent again
        if (!att.nick) return this.send(ws, { t: "error", code: "nick-required" });
        const character = msg.character as Character;
        if (!this.characters.includes(character)) return this.send(ws, { t: "error", code: "bad-character" });
        this.startShift(ws, att, character, msg.reject === true);
        return;
      }
      case "checkpoint": {
        if (this.shift?.cid !== att.cid) return;
        const now = Date.now();
        if (now - this.lastCheckpoint < 300) return;
        const text = JSON.stringify(msg.world ?? null);
        if (text.length > LIMITS.maxWorld) return this.send(ws, { t: "error", code: "world-too-big" });
        this.lastCheckpoint = now;
        const world = this.setWorld(msg.world ?? null);
        this.noteWorld();
        att.last = now;
        ws.serializeAttachment(att);
        // The worker gets the corrected world back too, in case it tried to change protected fields.
        this.broadcast({ t: "world", world });
        return;
      }
      case "lab.read": {
        // A worker standing at a surface only it can read learns what is written there (lab 3's
        // ultraviolet glyphs, room 3-2's two halves). Position is the client's word.
        const shift = this.shift;
        const lab = this.lab;
        const seen = shift?.cid === att.cid ? this.rules.read?.(lab, shift.character) : null;
        if (!seen) return this.send(ws, { t: "error", code: "cannot-read" });
        this.put("lab", lab);
        this.send(ws, { t: "lab.secret", gen: seen.gen, code: seen.code, part: seen.part });
        this.refreshWorld();
        this.noteWorld();
        this.broadcast({ t: "world", world: this.world });
        return;
      }
      case "lab.enter": {
        const shift = this.shift;
        // the terminal of any lab that has one; only the card can type
        if (shift?.cid !== att.cid || shift.character !== "key" || !this.rules.enter) return this.send(ws, { t: "error", code: "cannot-enter" });
        const now = Date.now();
        if (now - this.lastCheckpoint < 250) return this.send(ws, { t: "error", code: "too-fast" });
        this.lastCheckpoint = now;
        const lab = this.lab;
        const result = this.rules.enter(lab, msg.input);
        if (result === "bad") return this.send(ws, { t: "error", code: "bad-input" });
        this.noteRoomMark({ kind: "enter", logId: shift.logId, result: String(result) }); // the result only, never the input
        this.put("lab", lab);
        this.refreshWorld();
        this.noteWorld();
        att.last = now;
        ws.serializeAttachment(att);
        this.send(ws, { t: "lab.result", result });
        this.broadcast({ t: "world", world: this.world });
        return;
      }
      case "lab.act": {
        // a device that answers to the worker's equipment (lab 1's stamps and card door)
        const shift = this.shift;
        if (shift?.cid !== att.cid || !this.rules.act) return this.send(ws, { t: "error", code: "cannot-act" });
        const now = Date.now();
        if (now - this.lastCheckpoint < 250) return this.send(ws, { t: "error", code: "too-fast" });
        this.lastCheckpoint = now;
        const lab = this.lab;
        const result = this.rules.act(lab, shift.character, msg.what, shift.logId);
        if (result === "bad") return this.send(ws, { t: "error", code: "cannot-act" });
        this.put("lab", lab);
        this.refreshWorld();
        this.noteWorld();
        att.last = now;
        ws.serializeAttachment(att);
        this.send(ws, { t: "lab.acted", what: msg.what, result });
        this.broadcast({ t: "world", world: this.world });
        return;
      }
      case "lab.call": {
        // Lab 4: the worker holds one safety button and the echo the other. Positions are the client's word.
        const shift = this.shift;
        if (shift?.cid !== att.cid || this.labId !== 4) return;
        const now = Date.now();
        if (now - this.lastCall < 250) return;
        this.lastCall = now;
        const state = this.lab as lab4.Lab4State;
        // The worker says where it stands.
        const x = Number(msg.x), y = Number(msg.y);
        const pos = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        const result = lab4.call(state, this.world as Record<string, unknown> | null, pos, this.echo, now);
        this.send(ws, { t: "lab.called", result });
        if (result === "called") {
          this.put("lab", state);
          this.refreshWorld();
          this.noteWorld();
          this.broadcast({ t: "world", world: this.world });
        }
        return;
      }
      case "shift.end": {
        if (this.shift?.cid !== att.cid) return;
        let world: unknown = undefined;
        if (msg.world !== undefined && JSON.stringify(msg.world).length <= LIMITS.maxWorld) {
          world = this.publicWorld(msg.world);
          this.broadcast({ t: "world", world });
        }
        // The run only ends once the lab's goal has really been reached.
        const cleared = msg.cleared === true && this.rules.canClear(this.lab, world);
        // an accident (a trap caught the worker) is the client's word, like every position
        const reason = !cleared && typeof msg.accident === "string" ? "accident" : msg.timeup === true ? "timeup" : "clockout";
        this.endShift(reason, { world, progress: msg.progress as number, cleared, echoFrames: msg.echo, tape: msg.tape });
        return;
      }
      case "pin.set":
      case "pin.clear":
      case "note.stamp": {
        // what changed is written down for the room's record (S3), whatever onControl decided
        const before = this.controlBefore(msg);
        this.onControl(ws, att, msg);
        return this.noteControl(msg, before);
      }
      case "room.tapes": {
        // S3: the room as it is open now, every taped shift so far, for a waiting player to rewind
        if (this.closed) return this.send(ws, { t: "error", code: "closed" });
        return this.send(ws, { t: "room.tapes", room: this.roomRecord() });
      }
      case "archive.get": {
        const entry = this.archiveEntry(Number(msg.id));
        return this.send(ws, entry ? { t: "archive", entry } : { t: "error", code: "no-archive" });
      }
      case "note.add":
        return this.onNoteAdd(ws, att, msg);
      case "note.react":
        return this.onReact(att, msg);
      case "report":
        return this.onReport(ws, att, msg);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    this.rates.delete(ws);
    this.onGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.onGone(ws);
  }

  private onGone(ws: WebSocket): void {
    const { cid } = this.att(ws);
    if (cid) {
      if (this.queue.includes(cid)) this.put("queue", this.queue.filter((c) => c !== cid));
      if (this.offer?.cid === cid) this.put("offer", null);
      if (this.shift?.cid === cid) return this.endShift("disconnected", { except: ws });
    }
    this.advance(ws);
    this.sync(ws);
  }

  private onHello(ws: WebSocket, att: Att, msg: Record<string, unknown>): void {
    if (!validCid(msg.cid)) return this.send(ws, { t: "error", code: "bad-cid" });
    // A second tab with the same id replaces the first one.
    const old = this.socketFor(msg.cid, ws);
    if (old) {
      const oldAtt = this.att(old);
      att.last = oldAtt.last;
      old.serializeAttachment({ ...oldAtt, cid: "" });
      // Say so first: the close handshake can stall, and the old tab should stop at once.
      this.send(old, { t: "replaced" });
      try {
        old.close(4001, "replaced");
      } catch {
        // ignore
      }
    }
    att.cid = msg.cid;
    att.nick = cleanNick(msg.nick);
    att.look = cleanLook(msg.look);
    ws.serializeAttachment(att);
    this.send(ws, {
      t: "welcome",
      nick: att.nick,
      look: att.look,
      banned: this.banned(att.cid),
      day: this.day,
      world: this.world,
      notes: this.visibleNotes(),
      log: this.recentLog(),
      lab: this.labId,
      characters: this.characters,
      tier: this.tier,
      stage: this.stage,
      stages: this.stages,
      closed: this.closed,
      archive: this.archiveList(),
      pins: this.pins,
      tape: this.get<Tape | null>("tape", null), // the last shift's CCTV recording, for the newcomer to watch
      limits: {
        offerMs: LIMITS.offerMs,
        idleMs: LIMITS.idleMs,
        handoverMs: LIMITS.handoverMs,
        notesPerShift: LIMITS.notesPerShift,
        noteW: LIMITS.noteW,
        noteH: LIMITS.noteH,
      },
    });
    this.sync();
  }

  // ---------- the open room's record (S3: rewinding the room you are waiting for) ----------

  /** Writes one event of the open room down for its record (see RoomMark). */
  private noteRoomMark(mark: Omit<RoomMark, "at">): void {
    const openedAt = this.get<number>("labOpenedAt", 0);
    const book = this.get<{ openedAt: number; marks: RoomMark[] } | null>("roomMarks", null);
    const marks = book?.openedAt === openedAt ? book.marks : []; // a new opening starts a new book
    this.put("roomMarks", { openedAt, marks: [...marks, { at: Date.now(), ...mark }].slice(-ROOM_MARKS) });
  }

  /** What a pin or stamp request may change, as text, so noteControl can tell whether it did. */
  private controlBefore(msg: Record<string, unknown>): string {
    if (msg.t !== "note.stamp") return JSON.stringify(this.pins);
    const row = this.rows("SELECT stamp FROM notes WHERE id = ?", Number(msg.id))[0];
    return JSON.stringify(row?.stamp ?? null);
  }

  /** After the controller's request: a pin set or cleared, or a stamp changed, goes in the book. */
  private noteControl(msg: Record<string, unknown>, before: string): void {
    const shift = this.shift;
    if (shift?.character !== "control" || this.controlBefore(msg) === before) return; // refused, or nothing changed
    if (msg.t === "note.stamp") {
      const row = this.rows("SELECT stamp FROM notes WHERE id = ?", Number(msg.id))[0];
      return this.noteRoomMark({ kind: "stamp", logId: shift.logId, note: Number(msg.id), stamp: (row?.stamp as string | null) ?? null });
    }
    const n = Number(msg.n);
    const pin = this.pins.find((p) => p.n === n);
    this.noteRoomMark(pin ? { kind: "pin", logId: shift.logId, n, x: pin.x, y: pin.y, msg: pin.msg } : { kind: "unpin", logId: shift.logId, n });
  }

  /**
   * The room as it is open now (this run, this lab, since it opened): its tapes, newest
   * ARCHIVE_TAPES in order, every shift worked in it, its notes and pins, and the book of events.
   * Tapes hold the public world only, so nothing here is more than the CCTV already showed.
   */
  private roomRecord() {
    const openedAt = this.get<number>("labOpenedAt", 0);
    const run = this.day, lab = this.labId;
    const shiftRows = this.rows(
      "SELECT * FROM log WHERE day = ? AND lab = ? AND started_at >= ? ORDER BY id DESC LIMIT 400",
      run, lab, openedAt,
    ).reverse();
    const masked = new Set(shiftRows.filter((r) => r.masked).map((r) => r.id as number));
    const total = this.rows("SELECT COUNT(*) AS n FROM tapes WHERE run = ? AND lab = ? AND at >= ?", run, lab, openedAt)[0].n as number;
    const tapes = this.rows(
      "SELECT data FROM tapes WHERE run = ? AND lab = ? AND at >= ? ORDER BY id DESC LIMIT ?",
      run, lab, openedAt, ARCHIVE_TAPES,
    ).reverse().map((r) => {
      const tape = JSON.parse(r.data as string) as Tape;
      return masked.has(tape.logId) ? { ...tape, nick: ANON_NICK, look: "" } : tape; // a hidden name stays hidden on tape too
    });
    const notes = this.rows(
      "SELECT * FROM notes WHERE day = ? AND lab = ? AND status IN ('ok', 'blur') ORDER BY id",
      run, lab,
    ).map((r) => ({ ...this.publicNote(r), at: r.created_at as number, stampLog: (r.stamp_log as number | null) ?? null }));
    const book = this.get<{ openedAt: number; marks: RoomMark[] } | null>("roomMarks", null);
    return {
      run, lab, tier: this.tier, stage: this.stage, openedAt, now: Date.now(),
      tapes, skipped: Math.max(0, total - tapes.length),
      shifts: shiftRows.map((r) => this.publicLog(r)),
      notes, pins: this.pins,
      marks: book?.openedAt === openedAt ? book.marks : [],
    };
  }

  // ---------- the controller: pins and stamps ----------

  private lastControl = 0;

  private onControl(ws: WebSocket, att: Att, msg: Record<string, unknown>): void {
    const shift = this.shift;
    if (shift?.cid !== att.cid || shift.character !== "control") return this.send(ws, { t: "error", code: "not-control" });
    const now = Date.now();
    if (now - this.lastControl < 200) return this.send(ws, { t: "error", code: "too-fast" });
    this.lastControl = now;
    att.last = now;
    ws.serializeAttachment(att);

    if (msg.t === "pin.set") {
      const pin = cleanPin(msg);
      if (!pin) return this.send(ws, { t: "error", code: "bad-pin" });
      const pins = this.pins.filter((p) => p.n !== pin.n).concat({ ...pin, logId: shift.logId });
      pins.sort((a, b) => a.n - b.n);
      this.put("pins", pins);
      this.broadcast({ t: "pins", pins });
      return;
    }
    if (msg.t === "pin.clear") {
      const n = Number(msg.n);
      const pins = this.pins.filter((p) => p.n !== n);
      this.put("pins", pins);
      this.broadcast({ t: "pins", pins });
      return;
    }
    // note.stamp: a controller may stamp a few notes of this lab per shift (re-stamping one is free)
    const id = Number(msg.id);
    const stamp = msg.stamp === null ? null : typeof msg.stamp === "string" && msg.stamp in STAMPS ? msg.stamp : undefined;
    if (!Number.isInteger(id) || stamp === undefined) return this.send(ws, { t: "error", code: "bad-stamp" });
    const note = this.rows(
      "SELECT * FROM notes WHERE id = ? AND day = ? AND lab = ? AND status IN ('ok', 'blur')",
      id,
      this.day,
      this.labId,
    )[0];
    if (!note) return this.send(ws, { t: "error", code: "bad-stamp" });
    if (note.stamp_log !== shift.logId) {
      const used = this.rows("SELECT COUNT(*) AS n FROM notes WHERE stamp_log = ?", shift.logId)[0].n as number;
      if (stamp !== null && used >= STAMPS_PER_SHIFT) return this.send(ws, { t: "error", code: "stamp-limit" });
    }
    this.sql.exec("UPDATE notes SET stamp = ?, stamp_log = ? WHERE id = ?", stamp, stamp === null ? null : shift.logId, id);
    const left = STAMPS_PER_SHIFT - (this.rows("SELECT COUNT(*) AS n FROM notes WHERE stamp_log = ?", shift.logId)[0].n as number);
    this.broadcast({ t: "note.update", note: this.publicNote({ ...note, stamp }) });
    this.send(ws, { t: "stamp.left", left });
  }

  // ---------- notes, reactions, reports ----------

  private onNoteAdd(ws: WebSocket, att: Att, msg: Record<string, unknown>): void {
    if (this.banned(att.cid)) return this.send(ws, { t: "error", code: "banned" });
    // Notes can be left while working, or during the handover right after clocking out.
    const last = this.rows("SELECT * FROM log WHERE cid = ? ORDER BY id DESC LIMIT 1", att.cid)[0];
    const working = !!last && this.shift?.logId === last.id;
    const handover =
      !!last && last.ended_at !== null && Date.now() - (last.ended_at as number) <= LIMITS.handoverMs;
    if (!last || !(working || handover) || last.day !== this.day) {
      return this.send(ws, { t: "error", code: "no-handover" });
    }
    const count = this.rows("SELECT COUNT(*) AS n FROM notes WHERE log_id = ?", last.id)[0].n as number;
    if (count >= LIMITS.notesPerShift) return this.send(ws, { t: "error", code: "note-limit" });
    const strokes = cleanStrokes(msg.strokes);
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!strokes || !Number.isFinite(x) || !Number.isFinite(y)) {
      return this.send(ws, { t: "error", code: "bad-note" });
    }
    const row = this.sql
      .exec(
        `INSERT INTO notes (day, lab, log_id, cid, nick, character, x, y, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        this.day,
        this.labId,
        last.id,
        att.cid,
        last.nick,
        last.character,
        x,
        y,
        JSON.stringify(strokes),
        Date.now(),
      )
      .one() as Row;
    this.broadcast({ t: "note.add", note: this.publicNote(row), left: LIMITS.notesPerShift - count - 1 });
  }

  /** Records one mark per client per target. Returns false for a repeat. */
  private mark(kind: string, target: number, cid: string): boolean {
    const before = this.rows("SELECT 1 FROM marks WHERE kind = ? AND target = ? AND cid = ?", kind, target, cid);
    if (before.length > 0) return false;
    this.sql.exec("INSERT INTO marks (kind, target, cid, at) VALUES (?, ?, ?, ?)", kind, target, cid, Date.now());
    return true;
  }

  private onReact(att: Att, msg: Record<string, unknown>): void {
    const id = Number(msg.id);
    const kind = msg.kind === "funny" ? "funny" : msg.kind === "help" ? "help" : null;
    if (!kind || !Number.isInteger(id)) return;
    const note = this.rows("SELECT * FROM notes WHERE id = ? AND status IN ('ok', 'blur')", id)[0];
    if (!note || !this.mark(kind, id, att.cid)) return;
    this.sql.exec(`UPDATE notes SET ${kind} = ${kind} + 1 WHERE id = ?`, id);
    this.broadcast({ t: "note.update", note: this.publicNote({ ...note, [kind]: (note[kind] as number) + 1 }) });
  }

  private onReport(ws: WebSocket, att: Att, msg: Record<string, unknown>): void {
    const id = Number(msg.id);
    if (!Number.isInteger(id)) return;

    if (msg.kind === "note") {
      const note = this.rows("SELECT * FROM notes WHERE id = ? AND status IN ('ok', 'blur')", id)[0];
      if (!note || !this.mark("report-note", id, att.cid)) return;
      const reports = (note.reports as number) + 1;
      // A note an admin already restored stays visible; new reports are still counted.
      let status = note.status as string;
      if (!note.reviewed) status = reports >= LIMITS.hideAt ? "hidden" : reports >= LIMITS.blurAt ? "blur" : status;
      this.sql.exec("UPDATE notes SET reports = ?, status = ? WHERE id = ?", reports, status, id);
      if (status === "hidden") this.broadcast({ t: "note.remove", id });
      else this.broadcast({ t: "note.update", note: this.publicNote({ ...note, status }) });
      this.send(ws, { t: "reported", kind: "note", id });
      this.notify(`쪽지 #${id} 신고 ${reports}회 (${status})`);
      return;
    }

    if (msg.kind === "nick") {
      const entry = this.rows("SELECT * FROM log WHERE id = ?", id)[0];
      if (!entry || entry.masked || !this.mark("report-nick", id, att.cid)) return;
      const reports = (entry.reports as number) + 1;
      const masked = !entry.reviewed && reports >= LIMITS.hideAt ? 1 : 0;
      this.sql.exec("UPDATE log SET reports = ?, masked = ? WHERE id = ?", reports, masked, id);
      if (masked) this.maskBroadcast(id);
      this.send(ws, { t: "reported", kind: "nick", id });
      this.notify(`닉네임 신고 ${reports}회: 근무 #${id}${masked ? " (가림)" : ""}`);
    }
  }

  /** Tells clients a log entry's nickname is now hidden, including on its notes and the live shift. */
  private maskBroadcast(logId: number): void {
    const entry = this.rows("SELECT * FROM log WHERE id = ?", logId)[0];
    if (!entry) return;
    this.broadcast({ t: "log.update", entry: this.publicLog(entry) });
    for (const n of this.rows("SELECT * FROM notes WHERE log_id = ? AND status IN ('ok', 'blur')", logId)) {
      this.broadcast({ t: "note.update", note: this.publicNote(n) });
    }
    const shift = this.shift;
    if (shift?.logId === logId) {
      this.put("shift", { ...shift, nick: ANON_NICK, look: "" });
      this.sync();
    }
  }

  private notify(text: string): void {
    const hook = this.env.DISCORD_WEBHOOK;
    if (!hook) return;
    this.ctx.waitUntil(
      fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `[gameoff-shift] ${text}` }),
      }).catch(() => undefined),
    );
  }

  // ---------- admin API (the Worker has already checked the token) ----------

  private async admin(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.slice("/admin/api".length);

    if (request.method === "GET" && path === "/state") {
      return json({
        now: Date.now(),
        day: this.day,
        shiftMs: this.shiftMs,
        shift: this.shift,
        offer: this.offer,
        queue: this.queue,
        connections: this.sockets().map((ws) => {
          const a = this.att(ws);
          return { cid: a.cid, nick: a.nick, last: a.last };
        }),
        world: this.world,
        labId: this.labId,
        lab: this.lab,
        echo: this.echo,
        pins: this.pins,
        budget: { hourStart: this.hour.start, spent: Math.round(this.hour.cost), perHour: HOURLY_BUDGET },
        tier: this.tier,
        stage: this.stage,
        stages: this.stages,
        staffTierNow: this.staffTier(),
        closed: this.closed,
        archive: this.archiveList(),
        notes: this.rows("SELECT * FROM notes ORDER BY reports DESC, id DESC LIMIT 200").map((r) => ({
          ...r,
          data: JSON.parse(r.data as string),
        })),
        log: this.rows("SELECT * FROM log ORDER BY id DESC LIMIT 100"),
        bans: this.rows("SELECT * FROM bans ORDER BY at DESC"),
        actions: this.rows("SELECT * FROM actions ORDER BY id DESC LIMIT 50"),
      });
    }
    if (request.method !== "POST") return json({ error: "not found" }, 404);

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // empty body is fine for actions without parameters
    }

    switch (path) {
      case "/note": {
        const id = Number(body.id);
        const note = this.rows("SELECT * FROM notes WHERE id = ?", id)[0];
        if (!note) return json({ error: "no such note" }, 404);
        const status = { hide: "hidden", restore: "ok", delete: "deleted" }[body.action as string];
        if (!status) return json({ error: "bad action" }, 400);
        this.sql.exec("UPDATE notes SET status = ?, reviewed = 1 WHERE id = ?", status, id);
        if (status === "ok") {
          if (note.day === this.day) this.broadcast({ t: "note.add", note: this.publicNote({ ...note, status }) });
        } else {
          this.broadcast({ t: "note.remove", id });
        }
        this.act(`note.${body.action}`, { id });
        return json({ ok: true });
      }
      case "/nick": {
        const id = Number(body.logId);
        const masked = body.action === "restore" ? 0 : 1;
        if (!this.rows("SELECT 1 FROM log WHERE id = ?", id)[0]) return json({ error: "no such shift" }, 404);
        this.sql.exec("UPDATE log SET masked = ?, reviewed = 1 WHERE id = ?", masked, id);
        this.maskBroadcast(id);
        this.act(masked ? "nick.mask" : "nick.restore", { logId: id });
        return json({ ok: true });
      }
      case "/config": {
        const changes: Record<string, unknown> = {};
        if (body.shiftSeconds !== undefined) {
          const seconds = Number(body.shiftSeconds);
          if (!Number.isFinite(seconds) || seconds < 2 || seconds > 600) return json({ error: "shiftSeconds must be 2-600" }, 400);
          this.put("shiftMs", Math.round(seconds * 1000));
          changes.shiftSeconds = seconds;
        }
        if (body.lab !== undefined) {
          // Jump the run to a lab, from scratch (for testing and for moving the run along by hand).
          const id = Number(body.lab);
          if (!LABS[id]) return json({ error: "no such lab" }, 400);
          const shift = this.shift;
          if (shift) {
            const ws = this.socketFor(shift.cid);
            if (ws) this.send(ws, { t: "kicked", reason: "admin" });
            this.endShift("admin");
          }
          if (this.closed || body.reopen === true) {
            // reopening a closed building starts a new run
            this.put("closed", false);
            this.put("day", this.day + 1);
          }
          this.enterLab(id);
          this.broadcast({ t: "world", world: this.world, lab: id });
          this.broadcast({ t: "notes", notes: this.visibleNotes() });
          this.broadcast({ t: "pins", pins: this.pins });
          changes.lab = id;
        }
        if (body.tier !== undefined) {
          // The procedure valve: set how much verification the open lab asks for (1-3).
          const tier = Math.round(Number(body.tier));
          if (!(tier >= 1 && tier <= 3)) return json({ error: "tier must be 1-3" }, 400);
          this.put("labTier", tier);
          const lab = this.lab;
          if (this.rules.retier?.(lab, tier)) {
            this.put("lab", lab);
            this.refreshWorld();
            this.broadcast({ t: "world", world: this.world });
          }
          changes.tier = tier;
        }
        if (body.stages !== undefined) {
          // 1: only each lab's first room; 2: every room. The length valve, for the whole building.
          const stages = Math.round(Number(body.stages));
          if (!(stages >= 1 && stages <= STAGES)) return json({ error: "stages must be 1-2" }, 400);
          this.put("stages", stages);
          changes.stages = stages;
        }
        if (!Object.keys(changes).length) return json({ error: "nothing to change" }, 400);
        this.scheduleAlarm();
        this.sync();
        this.act("config", changes);
        return json({ ok: true });
      }
      case "/kick": {
        const shift = this.shift;
        if (!shift) return json({ error: "nobody is working" }, 409);
        const ws = this.socketFor(shift.cid);
        if (ws) this.send(ws, { t: "kicked", reason: "admin" });
        this.endShift("admin");
        this.act("kick", { cid: shift.cid, nick: shift.nick });
        return json({ ok: true });
      }
      case "/rollback": {
        const shift = this.shift;
        if (shift) {
          const ws = this.socketFor(shift.cid);
          if (ws) this.send(ws, { t: "kicked", reason: "admin" });
          this.endShift("admin");
        }
        this.restoreShiftStart();
        this.broadcast({ t: "pins", pins: this.pins });
        this.broadcast({ t: "world", world: this.world, reverted: true });
        this.act("rollback", {});
        return json({ ok: true });
      }
      case "/ban":
      case "/unban": {
        if (!validCid(body.cid)) return json({ error: "bad cid" }, 400);
        const cid = body.cid;
        if (path === "/unban") {
          this.sql.exec("DELETE FROM bans WHERE cid = ?", cid);
        } else {
          this.sql.exec(
            "INSERT OR REPLACE INTO bans (cid, at, reason) VALUES (?, ?, ?)",
            cid,
            Date.now(),
            String(body.reason ?? "").slice(0, 200),
          );
          const ws = this.socketFor(cid);
          if (ws) this.send(ws, { t: "kicked", reason: "banned" });
          this.put("queue", this.queue.filter((c) => c !== cid));
          if (this.offer?.cid === cid) this.put("offer", null);
          if (this.shift?.cid === cid) this.endShift("admin");
          else {
            this.advance();
            this.sync();
          }
        }
        this.act(path.slice(1), { cid });
        return json({ ok: true });
      }
    }
    return json({ error: "not found" }, 404);
  }
}
