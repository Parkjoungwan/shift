// Server-side rules for room 4-2 "Echo choreography" (잔상 안무). Keep in step with public/lab14.js.
// One plate is a weight plate (the echo holds it, as in lab 4); the other reads badges and only
// counts workers on shift, so the echo, who has clocked out, does not hold it. Which is which is
// drawn when the room opens; the doors' closing delays follow from it and the tier (the badge
// door stays open long enough for a live worker to step off and run, the weight door does not).
// The doors themselves are client-side timing from the shared echo (lab4core.js). The server keeps
// the plate types and delays, and only lets the room clear once an echo has been left behind.

export interface Lab14State {
  tier: number;
  badge: 0 | 1; // which plate reads badges
  delays: number[]; // ms each door stays open after its plate is let go
}

export const BADGE_DELAY = [3000, 2600, 2200];
export const WEIGHT_DELAY = [500, 400, 300];
const tierIndex = (tier: unknown): number => Math.max(1, Math.min(3, Number(tier) || 1)) - 1;
const badgeOf = (state: Partial<Lab14State> | null | undefined): 0 | 1 => (state?.badge === 0 ? 0 : 1);

export function delaysFor(tier = 1, badge: 0 | 1 = 1): number[] {
  const k = tierIndex(tier);
  return [0, 1].map((i) => (i === badge ? BADGE_DELAY[k] : WEIGHT_DELAY[k]));
}

export function newState(tier = 1, rand: () => number = Math.random): Lab14State {
  const badge: 0 | 1 = rand() < 0.5 ? 0 : 1;
  return { tier: tierIndex(tier) + 1, badge, delays: delaysFor(tier, badge) };
}

export function retier(state: Lab14State, tier: number): boolean {
  state.tier = tierIndex(tier) + 1;
  state.badge = badgeOf(state);
  state.delays = delaysFor(state.tier, state.badge);
  return true;
}

/** The world the clients simulate: which plate reads badges and both delays come from the server. */
export function publicWorld(world: unknown, state: Lab14State): unknown {
  const base = world && typeof world === "object" && !Array.isArray(world) ? (world as Record<string, unknown>) : {};
  const badge = badgeOf(state);
  const delays = Array.isArray(state?.delays) && state.delays.length === 2 ? [...state.delays] : delaysFor(state?.tier ?? 1, badge);
  const { delay: _old, ...rest } = base; // rooms opened before the badge plates kept one delay
  return { ...rest, lab: 14, badge, delays, lever: base.lever === true };
}

/** The echo is added to the world by the Building; no echo, nobody got through both doors. */
export const canClear = (_state: Lab14State, world: unknown): boolean =>
  !!world && (world as Record<string, unknown>).lever === true && !!(world as Record<string, unknown>).echo;

export const id = 14;
export const characters = ["echo", "tall", "key"] as const;
