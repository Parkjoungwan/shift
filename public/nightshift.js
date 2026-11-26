// Lab 6 "Night shift" (야간 교대) and room 6-2 "Scheduled maintenance" (정기 점검): one room
// builder for both (lab6.js and lab16.js export what it returns). Rules: lab6core.js.
// docs/level-design.md, 실험실 6.
//
// Lab 6: a row of drop grates over a shock trench. A grate drops 0.6 s after it is stepped on and
// stays down, so whoever crosses uses the bridge up. Cracked grates drop at once. Only the
// light's beam (from a light bridge above the trench) and the control desk see the cracks.
// The card crosses (hopping the cracked ones), opens door D, and should re-hang the grates at the
// far winch for the walking aid; the winch prints an inspection slip with the NEW cracked grates
// for the card's eyes only. The catch: the light's note was a map of the old grates.
//   light (read the cracks, note) -> card (cross, door D, far winch, note the slip) -> walking aid
// Room 6-2: no winch. The building re-hangs the grates at every minute's :00 on the HUD clock,
// and the cracked set moves along the row by a fixed step each time. A note of where the cracks
// are goes stale within the minute; a note of the rule ("at 14:05 cracks 2·6, +3 every minute")
// does not. The light watches one :00 go by to learn the step.
// Pure logic plus canvas drawing; no DOM access, so it runs under Node for tests.

import * as E from "./engine.js";
import * as core from "./lab6core.js";
import { t, FONT_FALLBACK, siteClock } from "./i18n.js";

const { T, TILE, P, litBy } = E;
const { SOLID, BRIDGE, DOOR } = TILE;

export function nightRoom(room) {
  const six = room === 6;
  const X0 = core.X0[room], X1 = X0 + core.N * core.GRATE_W; // the grate row: tile columns [X0, X1)
  const rules = six ? core.rules6 : core.rules16;

  // ---------- map ----------

  const tileAt = six
    ? E.makeGrid([
      [1, 10, 9, 19, 0], // the entrance hall
      [10, 8, 29, 20, 0], // the trench; row 20 is the grate row (the grates are not tiles)
      [4, 17, 30, 17, BRIDGE], // the light's bridge: from over the entrance hall across the trench
      [30, 10, 32, 19, 0], // the far bank: the winch and door D's panel
      [33, 10, 33, 19, DOOR], // door D
      [34, 1, 38, 19, 0], // the lever room
      [34, 16, 35, 16, SOLID], // 4-tile shelves (walking aid)
      [37, 12, 38, 12, SOLID],
      [34, 8, 35, 8, SOLID],
      [37, 4, 38, 4, SOLID], // the lever's ledge
    ])
    : E.makeGrid([
      [1, 9, 7, 19, 0],
      [8, 6, 27, 20, 0],
      [3, 17, 28, 17, BRIDGE],
      [28, 10, 30, 19, 0],
      [31, 10, 31, 19, DOOR],
      [32, 1, 38, 19, 0],
      [32, 16, 33, 16, SOLID],
      [36, 12, 37, 12, SOLID],
      [32, 8, 33, 8, SOLID],
      [36, 4, 37, 4, SOLID],
    ]);

  const SPAWN = { x: 2 * T + 8, y: 20 * T };
  const WINCH0 = six ? { x: 6 * T + 8, y: 20 * T } : null; // the emergency winch at the entrance (no slip)
  const WINCH = six ? { x: 31 * T, y: 20 * T } : null; // the far winch: fresh stock and the inspection slip
  const PANEL = six ? { x: 32 * T + 10, y: 20 * T } : { x: 29 * T + 8, y: 20 * T }; // door D's card panel
  const DOOR_X = six ? 33 : 31;
  const LEVER = six ? { x: 37 * T + 8, y: 4 * T } : { x: 36 * T + 8, y: 4 * T };
  const BOARD = { x: (X0 + X1) / 2 * T, y: 9 * T }; // room 6-2: the maintenance board above the trench
  const sign = six ? { text: "LAB 06", x: 4.5, y: E.ROWS - 4.5 } : { text: "LAB 06-2", x: 4, y: E.ROWS - 4.5 };

  const traps = [
    { kind: "shock", x0: X0 * T, x1: X1 * T, y: 21 * T },
    // a laser across the last jump to the lever
    { kind: "laser", x0: (LEVER.x - T - 12), y0: 3 * T, x1: (LEVER.x - T - 9), y1: 8 * T, on: 1300, off: 1700, phase: room * 100 },
  ];

  // ---------- world ----------

  function fresh() {
    return six
      ? { lab: 6, gen: 0, cracked: [], door: false, fall: core.cleanFall(null), fallGen: 0, lever: false }
      : { lab: 16, base: [], step: 1, door: false, fall: core.cleanFall(null), lever: false };
  }
  const ensure = (world) => (world && world.lab === room ? world : fresh());
  const progress = (world) => (six && world.gen ? 1 : 0) + (world.door ? 1 : 0) + (world.lever ? 1 : 0);

  // Fall times this worker has seen but the world may not carry yet: the server takes one
  // checkpoint every 300 ms and a running worker crosses a grate in 230 ms. Reset each shift.
  let mine = [];
  let mineGen = 0;
  function newPlayer() {
    mine = [];
    return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, varJump: 0 };
  }
  function extra(world) {
    if (six && (world.gen ?? 0) !== mineGen) { mine = []; mineGen = world.gen ?? 0; } // re-hung: new grates
    return mine;
  }

  const doorOpen = (world) => !!world.door;

  /** The grate under a body's centre (its feet), or -1. */
  function grateUnder(x) {
    for (let i = 0; i < core.N; i++) {
      const g = core.grateSpan(room, i);
      if (x >= g.x0 && x < g.x1) return i;
    }
    return -1;
  }

  function solidAt(world, tx, ty, actor, feet, now = Date.now()) {
    const v = tileAt(tx, ty);
    if (v === SOLID) return true;
    if (v === DOOR) return !doorOpen(world);
    if (v === BRIDGE) return feet !== undefined && ty * T >= feet - 0.001 && litBy(actor, tx, ty);
    if (ty === core.ROW) {
      const i = core.grateAt(room, tx);
      if (i < 0) return false;
      const more = extra(world);
      // a body whose centre is over a dropped grate goes down with it: no hanging on by the toes
      const j = actor ? grateUnder(actor.x) : -1;
      if (j >= 0 && Math.abs(actor.y - core.ROW * T) < 2 && core.isDown(world, j, now, more)) return false;
      return !core.isDown(world, i, now, more);
    }
    return false;
  }

  const self = { tileAt, solidAt, doorOpen };
  function step(world, p, input, character, dt, now) {
    E.step(self, world, p, input, character, dt, now);
  }

  // ---------- what the player can do here ----------

  const near = (p, spot) => !!spot && E.near(p, spot, 12);
  /** The grate the worker stands on right now (under its centre: toes over the next one do not count). */
  function underFeet(p) {
    if (!p.ground || Math.abs(p.y - core.ROW * T) > 1) return [];
    const i = grateUnder(p.x);
    return i >= 0 ? [i] : [];
  }

  function hint(world, p, character) {
    const card = character === "key";
    if (near(p, WINCH0)) return card ? t("E: 비상 정비 · 같은 발판을 다시 겁니다") : t("출입 카드 필요");
    if (near(p, WINCH)) return card ? t("E: 정비 윈치 · 새 발판을 겁니다") : t("출입 카드 필요");
    if (near(p, PANEL) && !world.door) return card ? t("E: 문 D 열기") : t("출입 카드 필요");
    if (E.near(p, LEVER) && !world.lever) return world.door ? t("E: 퇴근 레버") : "";
    return "";
  }

  function use(api) {
    const { world, p, character } = api;
    const card = character === "key";
    if (near(p, WINCH0) || near(p, WINCH)) {
      if (!card) return api.say(t("윈치는 출입 카드로만 작동합니다."));
      return api.act(near(p, WINCH) ? "fix" : "patch");
    }
    if (near(p, PANEL) && !world.door) {
      if (!card) return api.say(t("문 D는 출입 카드로만 열립니다."));
      return api.act("door");
    }
    if (E.near(p, LEVER) && !world.lever && world.door) api.pullLever();
  }

  let lastHeal = 0, lastUp = -1, lastMinute = -1;
  /** Every frame while working: a grate under the worker's feet starts to drop. */
  function tick(api) {
    const { world, p, now } = api;
    const have = extra(world);
    // sounds: a grate falling away, and room 6-2's building clock at :00
    const upCount = core.standing(world, now, have).filter(Boolean).length;
    if (lastUp >= 0 && upCount < lastUp) api.sound?.("clank");
    lastUp = upCount;
    const minute = Math.floor(now / core.MINUTE);
    if (!six && lastMinute >= 0 && minute !== lastMinute) api.sound?.("chime");
    lastMinute = minute;
    for (const i of underFeet(p)) {
      const known = core.fallCounts(world, world.fall?.[i], now) || core.fallCounts(world, have[i], now);
      if (known) continue;
      have[i] = now;
      if (!core.crackedNow(world, now).includes(i)) api.sound?.("rattle");
      api.change((w) => {
        w.fall = core.cleanFall(w.fall);
        w.fall[i] = now;
        if (six) w.fallGen = w.gen ?? 0;
      });
    }
    // a world from the server may have come back without a fall this worker caused: put it back
    if (now - lastHeal > 500) {
      lastHeal = now;
      const missing = have.map((at, i) => (core.fallCounts(world, at, now) && !core.fallCounts(world, world.fall?.[i], now) ? i : -1)).filter((i) => i >= 0);
      if (missing.length) {
        api.change((w) => {
          w.fall = core.cleanFall(w.fall);
          for (const i of missing) w.fall[i] = have[i];
          if (six) w.fallGen = w.gen ?? 0;
        });
      }
    }
  }

  /** The device's answer, for the worker who used it. The slip is only ever here. */
  function acted(what, result) {
    if (typeof result === "string" && result.startsWith("fixed:")) {
      const [, n, list] = result.split(":");
      return t("검사표 · 정비 {n}차: {list}번 발판 불합격. 이 검사표를 본 사람은 당신뿐입니다.", { n, list: (list ?? "").split(",").join("·") });
    }
    if (result === "patched") return t("비상 정비 완료. 떨어진 발판을 같은 자리에 다시 걸었습니다. 검사는 생략했습니다.");
    return null;
  }

  let taught = false; // the grates' rule, said once per visit
  /** What the overseer says to everyone. Never which grates are cracked, never the step, never the catch. */
  function narrate(prev, next) {
    if (prev.lab !== room) return null;
    if (next.lever && !prev.lever) {
      return six ? t("실험실 6 종료. 다리는 건널 때마다 닳았고, 누군가 매번 다시 걸었습니다.") : t("공정 2 완료. 점검표는 끝내 아무도 받지 못했습니다. 그래도 규칙은 인계되었습니다.");
    }
    if (next.door && !prev.door) return t("문 D가 열렸습니다. 안전 연동에 따라 낙하 발판을 모두 내렸습니다.");
    if (six && (next.gen ?? 0) > (prev.gen ?? 0)) return t("낙하 발판을 다시 걸었습니다. 정비 {n}차.", { n: next.gen });
    const stepped = (w) => (w.fall ?? []).some((v) => v != null);
    if (!taught && !stepped(prev) && stepped(next)) {
      taught = true;
      return t("낙하 발판입니다. 밟은 발판은 잠시 흔들린 뒤 떨어지고, 불량품은 그 자리에서 떨어집니다.");
    }
    return null;
  }

  function useless(world, character) {
    if (!characters.includes(character) || character === "echo" || character === "phase") return true;
    if (character === "tall") return !world.door;
    return false; // the card re-hangs and opens, the light reads the cracks
  }

  function mood(prev, next) {
    if ((next.door && !prev.door) || (next.lever && !prev.lever) || (six && (next.gen ?? 0) > (prev.gen ?? 0))) return "BackFlip";
    return null;
  }

  // ---------- drawing ----------

  /** How long ago the grate was stepped on (ms), while it is about to drop; else null. */
  function shaking(world, i, now) {
    const at = world.fall?.[i];
    if (!core.fallCounts(world, at, now) || core.isDown(world, i, now)) return null;
    return now - at;
  }

  function draw(ctx, opts) {
    drawBase(ctx, opts);
    drawOverlay(ctx, opts);
  }

  function drawBase(ctx, { world, actor, now = Date.now() }) {
    E.drawTiles(ctx, self, world, actor, now);
    const up = core.standing(world, now);
    for (let i = 0; i < core.N; i++) {
      if (!up[i]) continue;
      const g = core.grateSpan(room, i), s = shaking(world, i, now);
      const dx = s != null ? Math.sin(now / 20) : 0;
      ctx.fillStyle = s != null ? "#8a6a3a" : "#5c6472";
      ctx.fillRect(g.x0 + 1 + dx, g.y, g.x1 - g.x0 - 2, 5);
    }
    for (const spot of [WINCH0, WINCH, PANEL]) if (spot) { ctx.fillStyle = "#39404e"; ctx.fillRect(spot.x - 4, spot.y - 18, 8, 12); }
    E.drawLever2D(ctx, LEVER, world.lever);
    E.drawActor2D(ctx, actor);
  }

  const SLIDE_MS = 1200; // room 6-2: after :00 the light sees the cracks slide to their new grates

  /** A jagged ultraviolet crack across a grate-sized span starting at x0. */
  function crack(ctx, x0, y) {
    const w = core.GRATE_W * T;
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y + 1);
    for (let k = 1; k <= 5; k++) ctx.lineTo(x0 + 3 + k * ((w - 6) / 5), y + (k % 2 ? 4 : 0.5));
    ctx.stroke();
  }

  /**
   * On top of the room: grate numbers (everyone: notes need them), the re-hang count on the
   * winches (everyone), the cracks in the light's beam (the worker's own eyes only, never the
   * CCTV or a tape), room 6-2's maintenance board.
   */
  function drawOverlay(ctx, opts) {
    const { world, actor, cctv, now = Date.now() } = opts;
    ctx.save();
    ctx.textAlign = "center";
    const up = core.standing(world, now);
    const light = !cctv && actor?.character === "light";
    const c = light ? E.center(actor) : null;
    const inBeam = (x, y) => light && Math.hypot(x - c.x, y - c.y) <= E.LIGHT_R;
    const slide = !six && light && now % core.MINUTE < SLIDE_MS;
    const cracked = light && !slide ? core.crackedNow(world, now) : [];
    ctx.font = `bold 7px ui-monospace, Consolas, ${FONT_FALLBACK}`;
    for (let i = 0; i < core.N; i++) {
      // a small number plate on the grate's near edge (the shock floor below is painted over by the
      // traps); in the light's beam a cracked grate's plate glows ultraviolet too
      const g = core.grateSpan(room, i), mx = (g.x0 + g.x1) / 2;
      const uv = up[i] && cracked.includes(i) && inBeam(mx, g.y);
      ctx.fillStyle = uv ? "#5a2a8acc" : "#0b0d12cc"; ctx.fillRect(mx - 5, g.y - 8, 10, 8);
      ctx.fillStyle = uv ? "#f0e2ff" : up[i] ? "#e8b830" : "#5c6472";
      ctx.fillText(String(i + 1), mx, g.y - 2);
    }
    if (light) {
      ctx.strokeStyle = "#e8d6ff"; ctx.lineWidth = 1.5;
      if (slide) {
        // the cracks slide from last minute's grates to this minute's, by the step (wrapping round)
        const u = (now % core.MINUTE) / SLIDE_MS, ease = u * u * (3 - 2 * u);
        for (const i of core.crackedNow(world, now - core.MINUTE)) {
          const pos = (((i + (world.step ?? 0) * ease) % core.N) + core.N) % core.N;
          const x0 = (X0 + pos * core.GRATE_W) * T;
          if (inBeam(x0 + T, core.ROW * T)) crack(ctx, x0, core.ROW * T);
        }
      } else {
        for (const i of cracked) {
          const g = core.grateSpan(room, i);
          if (up[i] && inBeam((g.x0 + g.x1) / 2, g.y)) crack(ctx, g.x0, g.y);
        }
      }
    }
    if (six) {
      // the re-hang count on both winches: a note can say which hanging it describes
      ctx.font = `bold 7px ui-monospace, Consolas, ${FONT_FALLBACK}`;
      for (const w of [WINCH0, WINCH]) {
        const text = t("정비 {n}차", { n: world.gen ?? 0 });
        const tw = ctx.measureText(text).width + 6;
        ctx.fillStyle = "#0b0d12cc"; ctx.fillRect(w.x - tw / 2, w.y - 34, tw, 9);
        ctx.fillStyle = "#e8b830"; ctx.fillText(text, w.x, w.y - 27);
      }
    } else {
      // the maintenance board: everyone reads it, CCTV included; it flashes at :00
      const next = Math.ceil((now + 1) / core.MINUTE) * core.MINUTE;
      const text = t("정기 점검 매분 00초 · 다음 {time}", { time: siteClock(next) });
      ctx.font = `bold 10px ui-monospace, Consolas, ${FONT_FALLBACK}`;
      const w = ctx.measureText(text).width + 12;
      const flash = now % core.MINUTE < 2000;
      ctx.fillStyle = flash ? "#0d3a1ccc" : "#05070add"; ctx.fillRect(BOARD.x - w / 2, BOARD.y - 11, w, 15);
      ctx.fillStyle = flash ? "#5bf09a" : "#ffd75a";
      ctx.fillText(text, BOARD.x, BOARD.y);
    }
    ctx.restore();
    if (actor?.nick && cctv) E.drawNameTag(ctx, actor);
  }

  // ---------- control console (see console.js) ----------

  /** Where the grates are and which are down is public; which are cracked (and the step) is the desk's. */
  function schematic({ world, now = Date.now() }) {
    const up = core.standing(world, now);
    const cracked = core.crackedNow(world, now);
    const downCount = up.filter((u) => !u).length;
    const map = [];
    for (let i = 0; i < core.N; i++) {
      const g = core.grateSpan(room, i);
      map.push({ kind: "box", x0: g.x0 + 1, y0: g.y - 6, x1: g.x1 - 1, y1: g.y, label: String(i + 1), tone: up[i] ? "idle" : "bad" });
    }
    const signed = (n) => (n > 0 ? "+" : "") + n;
    map.push({ kind: "label", x: (X0 + X1) / 2 * T, y: 14 * T, ctrl: true, color: "#c8402e",
      text: cracked.length ? t("불량 {list}", { list: cracked.map((i) => i + 1).join("·") }) : t("불량 없음") });
    if (!six) {
      map.push({ kind: "label", x: (X0 + X1) / 2 * T, y: 12.6 * T, ctrl: true, color: "#c8402e", text: t("매분 00초 {n}칸 이동", { n: signed(world.step ?? 0) }) });
      // the board above the trench, for everyone (the CCTV is too coarse to read it)
      map.push({ kind: "label", x: (X0 + X1) / 2 * T, y: 9.6 * T, color: "#c8402e", text: t("정기 점검 매분 00초 · 다음 {time}", { time: siteClock(Math.ceil((now + 1) / core.MINUTE) * core.MINUTE) }) });
    }
    if (WINCH0) map.push({ kind: "device", x: WINCH0.x, y: WINCH0.y - 12, label: t("비상 윈치"), state: "", tone: "idle", color: E.EQUIP.key.color });
    if (WINCH) map.push({ kind: "device", x: WINCH.x - 8, y: WINCH.y - 12, label: t("정비 윈치"), state: "", tone: "idle", color: E.EQUIP.key.color });
    // door D: a label over the door itself (its panel stands right next to the winch)
    map.push({ kind: "label", x: DOOR_X * T + 8, y: 9.2 * T, text: world.door ? t("문 D 열림") : t("문 D 잠김"), color: world.door ? "#3f8f4a" : "#c8402e" });
    map.push({ kind: "device", x: LEVER.x, y: LEVER.y - 8, label: t("퇴근 레버"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle", color: E.EQUIP.tall.color });
    map.push({ kind: "label", x: (X0 + X1) / 2 * T, y: 16.4 * T, text: t("빛 발판 · 조명"), color: E.EQUIP.light.color });
    map.push({ kind: "label", x: 35 * T, y: 14.5 * T, text: t("보행 보조 구간 · 4칸"), color: E.EQUIP.tall.color });
    const status = [
      { label: t("낙하 발판"), state: t("{up}/{n} 남음", { up: core.N - downCount, n: core.N }), tone: downCount ? "warn" : "ok" },
      { label: t("불량 발판"), state: cracked.length ? cracked.map((i) => i + 1).join("·") : t("없음"), tone: "warn", ctrl: true },
    ];
    if (six) status.push({ label: t("정비 윈치"), state: t("정비 {n}차", { n: world.gen ?? 0 }), tone: "idle" });
    else status.push({ label: t("정기 점검"), state: t("매분 00초 · {n}칸", { n: signed(world.step ?? 0) }), tone: "warn", ctrl: true });
    status.push({ label: t("문 D"), state: world.door ? t("열림") : t("잠김"), tone: world.door ? "ok" : "bad" });
    status.push({ label: t("퇴근 레버 · 보행 보조"), state: world.lever ? t("당김") : t("대기"), tone: world.lever ? "ok" : "idle" });
    return { map, status };
  }

  // ---------- 3D (see render3d.js for the kit) ----------

  function build3d(kit) {
    const { THREE, add, ux, uy, DEPTH } = kit;
    const lever = kit.lever(ux(LEVER.x), uy(LEVER.y));
    const panel = kit.terminal(ux(PANEL.x), uy(PANEL.y));
    const winches = [WINCH0, WINCH].filter(Boolean).map((w) => kit.terminal(ux(w.x), uy(w.y)));
    const FLOOR = uy(20 * T);
    kit.lamps(six ? [[5, uy(10 * T) - 0.04], [36, uy(1 * T) - 0.04]] : [[4, uy(9 * T) - 0.04], [35, uy(1 * T) - 0.04]]); // night: two lamps only
    kit.rails(six ? [[34, 35, 16], [37, 38, 12], [34, 35, 8], [37, 38, 4]] : [[32, 33, 16], [36, 37, 12], [32, 33, 8], [36, 37, 4]]);
    kit.column(six ? 9.5 : 7.5, FLOOR, 10);
    kit.vent(six ? 20 : 18, uy(10 * T));
    kit.fan(six ? 31 : 29.5, uy(12 * T));

    const steel = kit.mat("#59647a", { metalness: 0.6, roughness: 0.4 });
    const shake = kit.mat("#8a6a3a", { metalness: 0.4, roughness: 0.6 });
    const grates = Array.from({ length: core.N }, (_, i) => {
      const g = core.grateSpan(room, i);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(core.GRATE_W - 0.12, 0.22, DEPTH * 0.8), steel);
      const x = (g.x0 + g.x1) / 2 / T, y = uy(g.y) - 0.11;
      mesh.position.set(x, y, 0);
      add(mesh);
      return { mesh, x, y, drop: 0 };
    });
    // room 6-2: the maintenance board above the trench (its text is drawn in 2D on top)
    if (!six) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: "#1b1f27" }));
      board.position.set(ux(BOARD.x), uy(BOARD.y) + 0.3, -DEPTH / 2 + 0.06);
      add(board);
    }
    return {
      update(world, _actor, dt, _time, now = Date.now()) {
        lever.update(world.lever, dt);
        panel.setColor(world.door ? "#5bd67a" : E.EQUIP.key.color);
        for (const w of winches) w.setColor(E.EQUIP.key.color);
        const up = core.standing(world, now);
        grates.forEach((g, i) => {
          // a dropped grate falls out of sight; a re-hung one is simply back
          g.drop = up[i] ? 0 : Math.min(6, g.drop + dt * 14);
          const s = up[i] ? shaking(world, i, now) : null;
          g.mesh.material = s != null ? shake : steel;
          g.mesh.position.x = g.x + (s != null ? Math.sin(now / 25) * 0.04 : 0);
          g.mesh.position.y = g.y - g.drop;
          g.mesh.visible = g.drop < 6;
        });
      },
    };
  }

  /** The field camera: the light on its bridge looks down at the grates (render3d.js placeCamera). */
  function fieldView(actor) {
    if (actor?.character !== "light" || actor.y > 17 * T + 1 || actor.x < X0 * T - T || actor.x > X1 * T + T) return null;
    return { lift: -1.6, pitch: 0.42 };
  }

  // echo and phase have nothing to do here; picking among five is part of the room
  const characters = ["light", "key", "tall", "echo", "phase"];

  return {
    id: room,
    name: six ? t("야간 교대") : t("정기 점검"),
    characters,
    tileAt, SPAWN, LEVER, PANEL, WINCH, WINCH0, BOARD, DOOR_X, X0, X1, sign, traps,
    fresh, ensure, progress, newPlayer, doorOpen, solidAt, step, underFeet,
    hint, use, tick, acted, narrate, useless, mood,
    draw, drawBase, drawOverlay, schematic, build3d, fieldView,
    local: { newState: (tier = 1) => rules.newState(tier), publicWorld: rules.publicWorld, canClear: rules.canClear, act: rules.act, retier: rules.retier },
  };
}
