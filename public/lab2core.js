// Box rooms (lab 2 "Boxes" and room 2-2 "Safety mat"): rules shared by the browser and the server
// (src/lab2.ts and src/lab12.ts import this file). The server owns where every box is; a worker
// only asks to pick one up, set it down in a column, or drop the crane's box, and the rules here
// decide where it comes to rest. No DOM, no engine import: each room lists its map here and its
// lab module builds the same grid from it.

export const T = 16; // keep in step with engine.js
export const COLS = 40, ROWS = 22;
const SOLID = 1, DOOR = 3;

/**
 * One box room's rules. spec:
 *   lab: the room id; fills: the map ([x0, y0, x1, y1, value] over rock)
 *   plate: { c0, c1, row } the pressure plate's columns and the row a box rests in on it
 *   shelf(tier): where the stored boxes start, [col, row] each
 *   needed(tier): the weight the plate wants
 *   craneSlots, craneDefault: where the crane can drop its box, and where the light's sensor drops it
 *   shuffle(tier): true when the crane terminal's buttons are wired to the slots in a fresh order
 *     each time the room opens (state.wiring[k] = the slot button k drops at). The order is the
 *     control desk's secret (schematic items marked ctrl); the field learns it by pressing, once.
 *   chute: true when every crane spot off the plate is a disposal hatch: a box dropped there is
 *     lost for good (the walking aid cannot fetch it), and the crane hangs a fresh box when the
 *     shift ends. One drop per shift; the wiring stays, so the next card can learn from the tape.
 *   mats: the press safety mats, [c0, c1] column ranges at the floor (row 19); presses(tier): how
 *     many of them are working at this tier (the others are switched off)
 *   lever: what the lever needs, besides being reached: "crane" (the crane has dropped) or "gate"
 *   weigh: true when the stored boxes only look alike: each opening, needed(tier) of them are full
 *     and the rest empty (state.weights[i]: 1 full, 0 empty; the crane's box is full). Only full
 *     boxes weigh on the plate, and an empty box set on it seals the plate (state.jam) until the
 *     shift ends: the gate stays shut and nothing on the plate can be lifted. The walking aid
 *     feels the weight by lifting; the control desk's sheet labels it (ctrl). Without weigh (2-2)
 *     every box weighs 1 and nothing seals.
 */
export function boxRoom(spec) {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(SOLID));
  for (const [x0, y0, x1, y1, v] of spec.fills) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = v;
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? SOLID : grid[ty][tx]);
  const { plate, craneSlots, craneDefault = 0, mats = [] } = spec;
  const clampTier = (tier) => Math.max(1, Math.min(3, tier));
  const shuffles = (tier) => !!spec.shuffle?.(clampTier(tier));

  /** Button k drops at slot k, or (shuffled) a fresh random order: every order is solvable. */
  function newWiring(shuffled) {
    const w = craneSlots.map((_, k) => k);
    if (shuffled) {
      for (let i = w.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [w[i], w[j]] = [w[j], w[i]];
      }
    }
    return w;
  }
  /** This opening's wiring; a state saved before wiring existed is wired straight (button k, slot k). */
  function wiringOf(state) {
    const w = state?.wiring, n = craneSlots.length;
    const ok = Array.isArray(w) && w.length === n && w.every((v) => Number.isInteger(v) && v >= 0 && v < n) && new Set(w).size === n;
    return ok ? w.slice() : craneSlots.map((_, k) => k);
  }

  /** Which of n stored boxes are full this opening (`full` of them, at random), the crane's box last (full). */
  function newWeights(n, full) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const w = new Array(n).fill(0);
    for (const i of order.slice(0, full)) w[i] = 1;
    w.push(1);
    return w;
  }
  /** Box i's weight: 1 full, 0 empty. Rooms that do not weigh, and states saved before weights, weigh 1 each. */
  function weightOf(state, i) {
    const w = state?.weights;
    if (!spec.weigh || !Array.isArray(w) || w.length !== state.boxes.length) return 1;
    return w[i] === 0 ? 0 : 1;
  }

  /** tier 1-3: the plate's weight, the boxes on the shelf, the working presses, the crane's wiring. */
  function newState(tier = 1) {
    const boxes = spec.shelf(clampTier(tier)).map(([col, row]) => ({ col, row }));
    boxes.push({ col: null, row: null }); // the crane's box, still hanging
    const shuffled = shuffles(tier);
    const needed = spec.needed(clampTier(tier));
    const state = {
      boxes, crane: boxes.length - 1, held: -1, needed, presses: spec.presses?.(clampTier(tier)) ?? 0,
      wiring: newWiring(shuffled), shuffled, pressed: -1, lost: -1, rearm: false,
    };
    if (spec.weigh) Object.assign(state, { weights: newWeights(boxes.length - 1, needed), jam: false });
    return state;
  }

  const boxAt = (state, col, row) => state.boxes.findIndex((b, i) => i !== state.held && b.col === col && b.row === row);
  const open = (state, col, row) => tileAt(col, row) === 0 && boxAt(state, col, row) < 0;
  const onPlate = (b) => !!b && b.col !== null && b.col >= plate.c0 && b.col <= plate.c1;

  /** Where a box set down in this column, starting at this row, comes to rest; null when it cannot go there. */
  function restRow(state, col, from) {
    if (!Number.isInteger(col) || !Number.isInteger(from) || !open(state, col, from)) return null;
    let r = from;
    while (r + 1 < ROWS && open(state, col, r + 1)) r++;
    return r;
  }

  /** The weight resting on the plate (stacks count; an empty box weighs nothing). */
  function plateLoad(state) {
    let n = 0;
    for (let col = plate.c0; col <= plate.c1; col++) {
      for (let row = plate.row, i; row >= 0 && (i = boxAt(state, col, row)) >= 0; row--) n += weightOf(state, i);
    }
    return n;
  }
  const gateOpen = (state) => !state.jam && plateLoad(state) >= state.needed;

  /** Press i's safety mat has a box on it (or the press is switched off at this tier): it stays up. */
  function matHeld(state, i) {
    const m = mats[i];
    if (!m) return false;
    if (i >= (state.presses ?? mats.length)) return true;
    for (let col = m[0]; col <= m[1]; col++) if (boxAt(state, col, 19) >= 0) return true;
    return false;
  }

  /**
   * "pick:i" (walking aid): lifts box i, if nothing sits on it. "drop:i:col:row" (walking aid): sets
   * the held box down in that column from that row. "crane:k" (card): presses button k, and the
   * crane drops its box at the slot that button is wired to (once). "sensor" (light): the sensor
   * drops it at the default slot.
   */
  function act(state, character, what) {
    if (typeof what !== "string") return "bad";
    const [verb, ...args] = what.split(":");
    const nums = args.map(Number);
    if (verb === "pick") {
      const i = nums[0], b = state.boxes[i];
      if (character !== "tall" || !b || b.col === null || state.held >= 0) return "bad";
      if (state.jam && onPlate(b)) return "sealed"; // the sealed plate holds what is on it until the shift ends
      if (boxAt(state, b.col, b.row - 1) >= 0) return "buried"; // something sits on it
      state.held = i;
      return "picked";
    }
    if (verb === "drop") {
      const [i, col, row] = nums;
      if (character !== "tall" || state.held !== i) return "bad";
      const r = restRow(state, col, row);
      if (r === null) return "blocked";
      state.boxes[i] = { col, row: r };
      state.held = -1;
      // an empty box on the plate: short weight, and the plate seals itself for the rest of the shift
      if (spec.weigh && onPlate(state.boxes[i]) && weightOf(state, i) === 0) {
        state.jam = true;
        return "jammed";
      }
      return "dropped";
    }
    if (verb === "crane" || verb === "sensor") {
      if (verb === "crane" && character !== "key") return "bad";
      if (verb === "sensor" && (character !== "light" || craneDefault === null)) return "bad";
      if (state.crane < 0) return "empty";
      const k = verb === "crane" ? nums[0] : -1;
      if (verb === "crane" && (!Number.isInteger(k) || k < 0 || k >= craneSlots.length)) return "bad";
      const slot = verb === "crane" ? wiringOf(state)[k] : craneDefault;
      if (!Number.isInteger(slot) || slot < 0 || slot >= craneSlots.length) return "bad";
      const col = craneSlots[slot];
      state.pressed = k; // which button did it: on the record for everyone (-1: the sensor)
      if (spec.chute && (col < plate.c0 || col > plate.c1)) {
        // off the plate: down the disposal hatch, gone; a fresh box at the end of this shift
        state.boxes[state.crane] = { col: null, row: null };
        state.crane = -1;
        state.lost = slot;
        state.rearm = true;
        return "lost";
      }
      const r = restRow(state, col, 12);
      if (r === null) { state.pressed = -1; return "blocked"; }
      state.boxes[state.crane] = { col, row: r };
      state.crane = -1;
      return "craned";
    }
    return "bad";
  }

  /**
   * A shift ended: a box still in someone's arms goes back where it was picked up, a sealed plate
   * opens its seal (the empty box stays where it was set: the record of the mistake), and a crane
   * that lost its box down the hatch hangs a fresh one (same wiring: the tape still holds).
   */
  function shiftEnded(state) {
    let changed = false;
    if (state.held >= 0) {
      state.held = -1;
      changed = true;
    }
    if (state.jam) {
      state.jam = false;
      changed = true;
    }
    if (state.rearm && state.crane < 0) {
      state.crane = state.boxes.length - 1; // the crane's box is always the last one
      state.boxes[state.crane] = { col: null, row: null };
      state.rearm = false;
      state.lost = -1;
      state.pressed = -1;
      changed = true;
    }
    return changed;
  }

  function retier(state, tier) {
    if (gateOpen(state)) return false;
    const fresh = newState(tier);
    state.needed = fresh.needed;
    state.presses = fresh.presses;
    // a tier that shuffles (or stops shuffling) rewires the crane, while it still has its box
    if (state.crane >= 0 && fresh.shuffled !== !!state.shuffled) {
      state.wiring = fresh.wiring;
      state.shuffled = fresh.shuffled;
    }
    // more boxes wanted than there are: store the missing ones where a fresh room keeps them
    const weighed = spec.weigh && Array.isArray(state.weights) && state.weights.length === state.boxes.length;
    const stored = state.boxes.length - 1;
    for (const [col, row] of spec.shelf(clampTier(tier)).slice(stored)) {
      const r = restRow(state, col, row - 2) ?? row;
      state.boxes.splice(state.boxes.length - 1, 0, { col, row: r });
      if (weighed) state.weights.splice(state.weights.length - 1, 0, 1); // a newly stored box is full
      if (state.crane >= 0) state.crane = state.boxes.length - 1;
    }
    if (weighed) {
      // never more weight wanted than there is: fill empty boxes (off the plate, last first) until there is
      const crane = state.boxes.length - 1;
      let full = state.weights.filter((w, i) => i !== crane && w !== 0).length;
      for (let i = crane - 1; i >= 0 && full < state.needed; i--) {
        if (state.weights[i] === 0 && !onPlate(state.boxes[i])) { state.weights[i] = 1; full++; }
      }
    }
    return true;
  }

  const leverReady = (state) => (spec.lever === "gate" ? gateOpen(state) : state.crane < 0);

  function publicWorld(world, state) {
    const base = world && typeof world === "object" && !Array.isArray(world) ? world : {};
    const out = {
      ...base, lab: spec.lab, boxes: state.boxes.map((b) => ({ ...b })), crane: state.crane, held: state.held,
      needed: state.needed, load: plateLoad(state), gate: gateOpen(state), presses: state.presses ?? 0,
      // the wiring travels with the world for the control desk's sheet (schematic, ctrl items only)
      wiring: wiringOf(state), shuffled: !!state.shuffled, pressed: state.crane < 0 ? state.pressed ?? -1 : -1,
      lost: state.crane < 0 ? state.lost ?? -1 : -1, // the hatch the box went down, this shift
    };
    if (spec.weigh) {
      // the weights travel for the carrier's hands and the control desk's sheet (ctrl labels only);
      // the seal is public: everyone sees the plate refuse
      out.weights = state.boxes.map((_, i) => weightOf(state, i));
      out.jam = !!state.jam;
    }
    out.lever = leverReady(state) && base.lever === true; // out of reach until then
    return out;
  }

  const canClear = (state, world) => leverReady(state) && !!world && world.lever === true;

  return {
    FILLS: spec.fills, tileAt, PLATE: plate, CRANE_SLOTS: craneSlots, CRANE_DEFAULT: craneDefault, MATS: mats,
    newState, wiringOf, weightOf, restRow, plateLoad, gateOpen, matHeld, act, shiftEnded, retier, publicWorld, canClear,
  };
}

// ---------- lab 2 "Boxes" ----------

const lab2 = boxRoom({
  lab: 2,
  fills: [
    [1, 12, 14, 19, 0], // the storeroom
    [3, 16, 7, 16, SOLID], // the storage shelf, 4 tiles up (walking aid)
    [15, 16, 15, 19, DOOR], // gate G: open while the plate carries enough weight
    [16, 12, 38, 19, 0], // the crane hall
    [33, 15, 35, 15, SOLID], // the lever ledge, 5 tiles up: only from a box (4 from its top)
  ],
  plate: { c0: 9, c1: 10, row: 19 },
  // three on the shelf (nearest its free end first), a fourth by the gate from tier 2: always more
  // boxes than full ones, so there is always an empty one to mistake for the real thing
  shelf: (tier) => [[5, 15], [4, 15], [3, 15], [12, 19]].slice(0, Math.min(4, tier + 2)),
  needed: (tier) => tier, // full boxes the plate wants (only full ones weigh)
  weigh: true, // the boxes only look alike: which ones are full changes every opening
  craneSlots: [21, 27, 31], // far, middle, under the lever
  craneDefault: 0, // the light's sensor drops it here: it cannot choose
  // wired straight at every tier: this is where the field learns that button 3 is the spot under
  // the lever (2-2 then breaks the habit). The wiring is still the control desk's on the sheet.
  shuffle: () => false,
  lever: "crane",
});
export const { FILLS, tileAt, PLATE, CRANE_SLOTS, CRANE_DEFAULT, newState, wiringOf, weightOf, restRow, plateLoad, gateOpen, act, shiftEnded, retier, publicWorld, canClear } = lab2;
export const SHELF_COLS = [5, 4, 3];

// ---------- room 2-2 "Safety mat" ----------

/**
 * The crane is on this side of the gate now, over the plate: the card opens the gate with the
 * crane's box. The hall's presses never rest long enough to run under, but each stops dead with a
 * box on its safety mat. The walking aid stocks the mats from the hall shelf, and the last box
 * goes under the lever.
 * The crane terminal has three buttons over three spots (left of the plate, the plate, right of
 * it), wired in a fresh order each time the room opens. Lab 2 taught "button 3 is the good spot";
 * here only the control desk sees which button is the plate. The crane drops once per shift, and
 * the spots off the plate are disposal hatches: a wrong button loses the box and the shift. The
 * crane hangs a fresh box when the shift ends, wired the same, so at most two shifts are lost.
 */
export const room12 = boxRoom({
  lab: 12,
  fills: [
    [1, 12, 14, 19, 0], // the storeroom, with the crane
    [15, 16, 15, 19, DOOR], // gate G
    [16, 12, 38, 19, 0], // the press hall
    [16, 16, 20, 16, SOLID], // the hall shelf, 4 tiles up
    [35, 15, 37, 15, SOLID], // the lever ledge, 5 tiles up
  ],
  plate: { c0: 9, c1: 10, row: 19 },
  // one box per working press, and one for under the lever
  shelf: (tier) => [19, 18, 17].slice(0, (tier >= 2 ? 2 : 1) + 1).map((col) => [col, 15]),
  needed: () => 1, // the crane's box alone holds the gate
  craneSlots: [7, 9, 12], // left of the plate, the plate, right of it (buttons: see shuffle)
  craneDefault: null, // no sensor in this room
  shuffle: () => true, // every opening
  chute: true, // spots off the plate are disposal hatches: a wrong button costs the box and the shift
  mats: [[23, 26], [29, 32]], // each mat starts a column before its press: set the box down from safe floor
  presses: (tier) => (tier >= 2 ? 2 : 1),
  lever: "gate",
});
