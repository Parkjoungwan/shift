// Server-side rules for room 1-2 "Shift order" (교대 순서). Keep in step with public/lab11.js.
// The card reader and the light sensor must both be approved, in the order of this opening
// (wire: 0 the card first, 1 the light first; shuffled every time the room opens and shown only
// on the control desk's blueprint), before the hall door to the lever opens. A device used out of
// turn is refused, publicly, until the other has been approved. The server owns all of it.

export type Device = "reader" | "sensor";

export interface Lab11State {
  swiped: boolean; // the card reader has been approved
  charged: boolean; // the sensor has been approved (it saw enough light)
  refused: Device[]; // used out of turn since the last approval (public: a red lamp)
  doorB: boolean; // the hall door: both approved
  wire: 0 | 1; // 0: the reader first; 1: the sensor first
  dwell: number; // seconds the sensor wants the light on it: more staff, more procedure
}

export const dwellFor = (tier = 1): number => 2 + 2 * Math.max(1, Math.min(3, tier));
export const firstOf = (wire: number): Device => (wire ? "sensor" : "reader");
const DEVICE_OF: Record<string, Device> = { door: "reader", sensor: "sensor" };
const WHO: Record<Device, string> = { reader: "key", sensor: "light" };
const DONE = { reader: "swiped", sensor: "charged" } as const;

export function newState(tier = 1): Lab11State {
  const wire = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) as 0 | 1;
  return { swiped: false, charged: false, refused: [], doorB: false, wire, dwell: dwellFor(tier) };
}

export type ActResult = "open" | "accepted" | "order" | "already" | "bad";

/** "door": the card at the reader. "sensor": the light, having held its beam long enough. */
export function act(state: Lab11State, character: string, what: unknown): ActResult {
  const dev = typeof what === "string" ? DEVICE_OF[what] : undefined;
  if (!dev || character !== WHO[dev]) return "bad";
  if (state[DONE[dev]]) return "already";
  const other: Device = dev === "reader" ? "sensor" : "reader";
  if (firstOf(state.wire ?? 0) !== dev && !state[DONE[other]]) {
    state.refused = [...(state.refused ?? []).filter((d) => d !== dev), dev];
    return "order";
  }
  state[DONE[dev]] = true;
  state.refused = [];
  if (state.swiped && state.charged) {
    state.doorB = true;
    return "open";
  }
  return "accepted";
}

export function retier(state: Lab11State, tier: number): boolean {
  if (state.charged) return false;
  state.dwell = dwellFor(tier);
  return true;
}

export function publicWorld(world: unknown, state: Lab11State): unknown {
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {
    ...base, lab: 11, swiped: !!state.swiped, charged: !!state.charged, refused: [...(state.refused ?? [])], doorB: !!state.doorB,
    wire: state.wire ?? 0, dwell: state.dwell,
  };
  out.lever = !!state.doorB && base.lever === true; // the lever is in the shelf hall, behind the door
  return out;
}

export const canClear = (state: Lab11State, world: unknown): boolean => !!state.doorB && !!world && (world as Record<string, unknown>).lever === true;

export const id = 11;
export const characters = ["key", "light", "tall"] as const;
