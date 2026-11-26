// A whole run, end to end, against a running server: the building is reopened at lab 1 and
// five test workers relay through every room in order (ORDER in public/labs.js) at whatever
// procedure tier the server picks for each lab, until the ending closes the building. A
// spectator checks every handover; at the end the archive must hold every lab of the run,
// each with its tapes. Movement is not simulated (the lab tests do that): workers say where
// they are, as real clients do.
// Usage: node test/campaign.mjs [host]   (default localhost:8787). Takes a minute or two.
// Note: it leaves a closed building behind; it reopens it at lab 1 at the end.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ORDER, nextRoom } from "../public/labs.js";
import * as L13 from "../public/lab13.js";
import * as L3 from "../public/lab3.js";
import { exitCode } from "../public/lab9.js";
import { FORGE_AT as FORGE5 } from "../public/lab5.js";
import { FORGE_AT as FORGE15 } from "../public/lab15core.js";
import { DELAY_MIN, DELAY_MAX } from "../public/lab4core.js";
import { phraseText } from "../public/directives.js";

const host = process.argv[2] ?? "localhost:8787";
const http = `http://${host}`;
const token = /^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
  if (!ok) failed++;
}

class Client {
  constructor(nick) { this.nick = nick; this.cid = randomUUID(); this.inbox = []; this.waiters = []; }
  async open() {
    this.ws = new WebSocket(`ws://${host}/ws`);
    this.ws.onmessage = (e) => {
      if (e.data[0] === "s") return;
      const msg = JSON.parse(e.data);
      this.inbox.push(msg);
      this.waiters = this.waiters.filter((w) => !w(msg));
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.send({ t: "hello", cid: this.cid, nick: this.nick });
    return this.wait((m) => m.t === "welcome");
  }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  wait(pred, ms = 4000) {
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
  clear() { this.inbox.length = 0; }
}

async function admin(path, body) {
  const res = await fetch(http + "/admin/api" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const state = async () => (await admin("/state")).data;

// five workers take turns, so nobody runs into the per-person limits (20 shifts a day each)
const crew = ["일번", "이번", "삼번", "사번", "오번"].map((n) => new Client(n));
const V = new Client("관전");
let turn = 0;
/** One shift: clock in with this equipment, run `body(worker)`, clock out with `end`. Returns the shift's log id. */
async function shift(character, body, end = {}) {
  const w = crew[turn++ % crew.length];
  w.clear();
  for (let i = 0; ; i++) {
    w.send({ t: "queue.join" });
    const m = await w.wait((x) => (x.t === "sync" && x.you.role === "offered") || x.t === "error");
    if (m?.t === "sync") break;
    if (i > 12 || m?.code !== "rate-limited") throw new Error(`${w.nick} could not clock in: ${JSON.stringify(m)}`);
    await sleep(5000);
  }
  w.send({ t: "shift.start", character });
  const s = await w.role("worker");
  if (!s) throw new Error(`${w.nick} did not start as ${character}`);
  await sleep(320); // the server takes one action a quarter second
  await body?.(w);
  const lab = (await state()).labId;
  // a short tape, so the archive has something to replay for every shift
  w.send({ t: "shift.end", world: { lab, ...end.world }, progress: 0, cleared: !!end.cleared, tape: end.tape ?? { frames: [[0, 40, 320, 1], [20, 120, 320, 1]] } });
  await w.role("viewer");
  return s.shift.logId;
}
/**
 * The overseer's forged directive by the entrance (labs 5 and 5-2): signed with a shift from the
 * log that was not the control desk, or 0 before anyone acted; its words come from a short list.
 */
async function forgedPin(at, words, label) {
  const st = await state();
  const pin = (st.pins ?? []).find((p) => p.x === at.x && p.y === at.y);
  const signer = pin && st.log.find((e) => e.id === pin.logId);
  check(`${label}: the overseer's directive is up by the entrance`, !!pin, JSON.stringify(st.pins));
  check(`${label}: ...signed with a non-control shift (or nobody)`, !!pin && (pin.logId === 0 || (!!signer && signer.character !== "control")), JSON.stringify({ pin, signer }));
  check(`${label}: ...in the overseer's words`, words.test(phraseText(pin?.msg)), phraseText(pin?.msg));
}
/** Asks the server to do something at a device, with the pause it wants between actions. */
async function act(w, what) {
  w.send({ t: "lab.act", what });
  const r = await w.wait((m) => m.t === "lab.acted" || m.t === "error");
  await sleep(300);
  return r?.result ?? r?.code;
}
async function next(from) {
  const m = await V.wait((x) => x.t === "lab.next" || x.t === "day.clear", 6000);
  return m;
}

// ---------- start a fresh run ----------
for (const c of [...crew, V]) await c.open();
await admin("/config", { stages: 2 }); // every room, as players get them
const start = await admin("/config", { lab: ORDER[0], reopen: true });
check("the building reopens at the first lab", start.status === 200 && (await state()).labId === ORDER[0]);
const run = (await state()).day;
const opened = [];
let lab1Order = null;

try {
  for (const lab of ORDER) {
    const s0 = await state();
    check(`room ${lab} (stage ${s0.stage}/${s0.stages}) is open`, s0.labId === lab, `labId ${s0.labId}`);
    opened.push({ lab, stage: s0.stage, tier: s0.tier });
    V.clear();
    const shiftsBefore = turn;

    if (lab === 1) {
      // the stamp order is drawn afresh each opening: never the plain 1-2-3, never this run's exit order
      const order = s0.lab.order ?? [0, 1, 2];
      lab1Order = order;
      check(`lab 1: an approval order is drawn (${order.map((i) => i + 1).join("")}), not 123`, Array.isArray(s0.lab.order) && [...order].sort().join() === "0,1,2" && order.join() !== "0,1,2", JSON.stringify(s0.lab.order));
      check("lab 1: ...nor the run's exit order (server-only lab.avoid), which stays out of the world", Array.isArray(s0.lab.avoid) && s0.lab.avoid.join() !== order.join() && !("avoid" in (s0.world ?? {})), JSON.stringify({ avoid: s0.lab.avoid, world: s0.world && Object.keys(s0.world) }));
      const who = ["key", "tall", "light"];
      for (const i of order) {
        await shift(who[i], async (w) => {
          if (who[i] === "key") check("lab 1: the card opens the card door", ["open", "already"].includes(await act(w, "door")));
          check(`lab 1: stamp ${i + 1} (${who[i]})`, (await act(w, "stamp")) === "stamped");
        });
      }
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 11) {
      // the approval order of this opening: wire 0 the card first, wire 1 the light first
      const wire = s0.lab.wire;
      check("1-2: the approval order is drawn for this opening", wire === 0 || wire === 1, JSON.stringify(wire));
      const steps = wire ? [["light", "sensor"], ["key", "door"]] : [["key", "door"], ["light", "sensor"]];
      for (const [k, [who, what]] of steps.entries()) {
        await shift(who, async (w) => check(`1-2: ${who} approved ${k ? "second: the hall door opens" : "first"}`, (await act(w, what)) === (k ? "open" : "accepted")));
      }
      check("1-2: the hall door to the lever is open", (await state()).world?.doorB === true);
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 2) {
      const needed = s0.lab.needed;
      const spots = [[9, 19], [10, 19], [9, 18]];
      // only full boxes weigh (lab.weights, drawn each opening; the last is the crane's box): an
      // empty one on the plate would jam it for the shift
      const full = s0.lab.weights.slice(0, -1).flatMap((w, i) => (w ? [i] : []));
      check(`lab 2: ${full.length} of ${s0.lab.weights.length - 1} stored boxes are full, enough for the plate (${needed})`, full.length >= needed && full.length < s0.lab.weights.length - 1, JSON.stringify(s0.lab.weights));
      await shift("tall", async (w) => {
        for (let k = 0; k < needed; k++) {
          const i = full[k];
          check(`lab 2: full box ${i} (${k + 1}/${needed}) lifted`, (await act(w, `pick:${i}`)) === "picked");
          check(`lab 2: ...on the plate`, (await act(w, `drop:${i}:${spots[k][0]}:${spots[k][1]}`)) === "dropped");
        }
      });
      check("lab 2: the gate is open", (await state()).world?.gate === true);
      await shift("key", async (w) => check("lab 2: the crane drops its box under the lever", (await act(w, "crane:2")) === "craned"));
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 12) {
      // the buttons are wired afresh each opening: the plate is spot 1 (the control desk's sheet)
      const button = (await state()).lab.wiring.indexOf(1);
      await shift("key", async (w) => check(`2-2: crane button ${button + 1} drops its box on the plate`, (await act(w, `crane:${button}`)) === "craned"));
      const presses = (await state()).lab.presses;
      const spots = [[23, 19], [29, 19]].slice(0, presses).concat([[33, 19]]);
      await shift("tall", async (w) => {
        for (const [i, [col, row]] of spots.entries()) {
          check(`2-2: box ${i + 1}/${spots.length} lifted from the shelf`, (await act(w, `pick:${i}`)) === "picked");
          check(`2-2: ...and set down at column ${col}`, (await act(w, `drop:${i}:${col}:${row}`)) === "dropped");
        }
      }, { world: { lever: true }, cleared: true });
    }

    if (lab === 3) {
      const needed = s0.lab.needed;
      for (let round = 1; round <= needed; round++) {
        let code = null;
        await shift("light", async (w) => {
          w.send({ t: "lab.read" });
          code = (await w.wait((m) => m.t === "lab.secret"))?.code;
          check(`lab 3: round ${round}/${needed}: the light reads the glyphs`, Array.isArray(code) && code.length === L3.WALL_LENGTH, JSON.stringify(code));
        });
        // the wall carries two tagged rows: the terminal's issue tag (world.issue) picks this round's
        const issue = (await state()).world?.issue;
        code = L3.codeFrom(code ?? [], issue);
        check(`lab 3: round ${round}/${needed}: the terminal's tag (${issue}) picks a row`, Array.isArray(code), JSON.stringify(issue));
        await shift("key", async (w) => {
          w.send({ t: "lab.enter", input: code });
          const r = (await w.wait((m) => m.t === "lab.result"))?.result;
          check(`lab 3: round ${round}/${needed}: the card types them`, r === (round === needed ? "open" : "pass"), r);
          await sleep(300);
        });
      }
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 13) {
      const parts = {};
      for (const c of ["tall", "light"]) {
        await shift(c, async (w) => {
          w.send({ t: "lab.read" });
          const m = await w.wait((x) => x.t === "lab.secret");
          parts[m?.part] = m?.code;
          check(`3-2: the ${c} reads its part (${m?.part})`, Array.isArray(m?.code));
        });
      }
      await shift("key", async (w) => {
        // the ultraviolet set, in the order the plaque's path visits it
        w.send({ t: "lab.enter", input: parts.high && parts.uv ? L13.solve(parts.high, parts.uv) : [] });
        check("3-2: the card types the set in the plaque's order and door D opens", (await w.wait((m) => m.t === "lab.result"))?.result === "open");
        await sleep(300);
      });
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 4) {
      // the echo recorder stands on the left button and clocks out: its tape's tail becomes the echo
      await shift("echo", null, { tape: { frames: Array.from({ length: 90 }, (_, i) => [i, 48, 320, 1]) } });
      check("lab 4: the echo is left on the button", !!(await state()).world?.echo);
      // the lift's delay is drawn per opening: the plan times the call from it (the lever shift
      // has to find the lift at the bottom; here the server only counts the call)
      const delay = (await state()).lab.arriveMs;
      check(`lab 4: this opening's lift delay (${delay / 1000} s) is drawn and public`, Number.isInteger(delay) && delay >= DELAY_MIN && delay <= DELAY_MAX && (await state()).world?.arriveMs === delay, JSON.stringify(delay));
      await shift("key", async (w) => {
        w.send({ t: "checkpoint", world: { lab: 4, breaker: true } });
        await sleep(400);
        w.send({ t: "lab.call", x: 27 * 16, y: 320 });
        const r = (await w.wait((m) => m.t === "lab.called"))?.result;
        check("lab 4: card and echo together call the lift", r === "called", r);
      }, { world: { breaker: true } });
      await shift("tall", null, { world: { breaker: true, lever: true }, cleared: true });
    }

    if (lab === 14) {
      // the echo recorder's last 8 seconds: plate 1, then through door 1, then plate 2
      const frames = Array.from({ length: 90 }, (_, t) => [t, t < 40 ? 192 : t < 53 ? 192 + (t - 40) * 14 : 368, 320, 1]);
      await shift("echo", null, { tape: { frames } });
      check("4-2: the echo's dance is left behind", !!(await state()).world?.echo);
      const w14 = (await state()).world;
      check(`4-2: one plate reads badges (plate ${w14?.badge + 1}), with its own door delay`, (w14?.badge === 0 || w14?.badge === 1) && w14.delays?.length === 2 && w14.delays[w14.badge] > w14.delays[1 - w14.badge], JSON.stringify({ badge: w14?.badge, delays: w14?.delays }));
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 15) {
      // red, blue (, red): the boxes drop ledge by ledge; then the red bridge has to hold
      for (let k = 0; k < 3 && !(await state()).world?.gate; k++) {
        await shift("phase", async (w) => {
          for (let i = 0; i < 2 && !(await state()).world?.gate; i++) check(`5-2: a switch drops the boxes (shift ${k + 1})`, (await act(w, "switch")) === "switched");
          const st = (await state()).lab;
          if (st.boxes.every((b) => b.row === 19) && st.phase === "blue" && st.anchor !== "red") check("5-2: ...then anchor red for the bridge", (await act(w, "anchor:red")) === "anchored");
        });
      }
      check("5-2: every box is on the plate and the gate is open", (await state()).world?.gate === true);
      await forgedPin(FORGE15, /^(청|적) 위상 있음$|^다음 근무자는 \S|^위상 닻 (먼저|금지)$/, "5-2");
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 5) {
      const needed = s0.lab.needed;
      await shift("phase", async (w) => {
        if ((await state()).lab.phase === "blue") check("lab 5: the phase shifter switches to red", (await act(w, "switch")) === "switched");
        check("lab 5: ...and anchors the blue bridge", (await act(w, "anchor:blue")) === "anchored");
      });
      await forgedPin(FORGE5, /^(청|적) 위상 있음$|^다음 근무자는 \S/, "lab 5");
      for (let i = 1; i <= needed; i++) {
        await shift("key", async (w) => check(`lab 5: signature ${i}/${needed}`, (await act(w, "sign")) === (i === needed ? "open" : "signed")));
      }
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 6) {
      await shift("light", null); // reads the cracks from its bridge (the lab test walks it)
      await shift("key", async (w) => {
        check("lab 6: the card opens door D", (await act(w, "door")) === "open");
        const slip = await act(w, "fix");
        const st = (await state()).lab;
        check("lab 6: the far winch re-hangs the grates and the slip names the new cracked ones", typeof slip === "string" && slip.split(":")[2] === st.cracked.map((i) => i + 1).join(","), slip);
      });
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 16) {
      const st = (await state()).lab;
      check("6-2: the cracked set and its step are dealt", st.base?.length >= 2 && Math.abs(st.step) >= 1 && Math.abs(st.step) <= 3, JSON.stringify(st));
      await shift("light", null);
      await shift("key", async (w) => check("6-2: the card opens door D", (await act(w, "door")) === "open"));
      await shift("tall", null, { world: { lever: true }, cleared: true });
    }

    if (lab === 9) {
      // the note's glyphs mark by mark, in the order the overseer practised lab 1's stamps
      const { pieces, order } = (await state()).lab;
      if (lab1Order) check("lab 9: the exit order is not the stamp order lab 1 posted", order.join() !== lab1Order.join(), JSON.stringify({ order, lab1Order }));
      const code = exitCode(pieces, order);
      await shift("key", async (w) => {
        w.send({ t: "lab.enter", input: code });
        check(`lab 9: the old note (${code.length} glyphs, marks ${order.map((m) => m + 1).join("")}) opens the exit`, (await w.wait((m) => m.t === "lab.result"))?.result === "open");
      });
      await shift("tall", null, { world: { out: true }, cleared: true });
    }

    opened.at(-1).shifts = turn - shiftsBefore;
    const m = await V.wait((x) => x.t === "lab.next" || x.t === "day.clear", 6000);
    const want = nextRoom(lab);
    if (want === undefined) check(`lab ${lab} cleared: the ending, and the building closes`, m?.t === "day.clear" && m.closed === true && (await state()).closed === true, JSON.stringify(m));
    else check(`room ${lab} cleared: on to room ${want}`, m?.t === "lab.next" && m.from === lab && m.lab === want, JSON.stringify(m));
  }
} catch (err) {
  check("the run went through", false, err.message);
}

// ---------- the record ----------
V.send({ t: "queue.join" });
check("nobody can clock in after the ending", (await V.wait((m) => m.t === "error"))?.code === "closed");
V.clear();
const archive = (await state()).archive ?? [];
const thisRun = archive.filter((a) => a.run === run);
check("the archive holds every lab of this run, in order", JSON.stringify(thisRun.map((a) => a.lab)) === JSON.stringify(ORDER), JSON.stringify(thisRun.map((a) => a.lab)));
for (const entry of thisRun) {
  V.send({ t: "archive.get", id: entry.id });
  const e = (await V.wait((m) => m.t === "archive"))?.entry;
  check(`archive: lab ${entry.lab} replays (${e?.tapes?.length ?? 0} tapes, tier ${entry.tier})`, e?.lab === entry.lab && e.tapes.length >= 1);
  await sleep(150);
}
console.log("");
console.log("Shifts the solution took, stage by stage:");
for (const o of opened) console.log(`  lab ${o.lab} stage ${o.stage} (tier ${o.tier}): ${o.shifts} shifts`);
console.log(`  total: ${opened.reduce((n, o) => n + (o.shifts ?? 0), 0)} shifts`);

// leave the building open for the next person
await admin("/config", { lab: ORDER[0], reopen: true });
for (const c of [...crew, V]) c.ws.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
