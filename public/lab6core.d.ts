// Types for lab6core.js, so the Worker (src/lab6.ts, src/lab16.ts) can import the same rules as the browser.

export interface Lab6State {
  gen: number;
  cracked: number[];
  door: boolean;
  tier: number;
  drop?: { gen: number; at: number };
}
export interface Lab16State {
  base: number[];
  step: number;
  door: boolean;
  tier: number;
  drop?: { gen: number; at: number };
}
interface Rules<S> {
  newState(tier?: number, rand?: () => number): S;
  act(state: S, character: string, what: unknown, logId?: number, rand?: () => number, now?: number): string;
  retier(state: S, tier: number): boolean;
  publicWorld(world: unknown, state: S): Record<string, unknown>;
  canClear(state: S, world: unknown): boolean;
}
export const rules6: Rules<Lab6State>;
export const rules16: Rules<Lab16State>;
export const N: number;
export const GRATE_W: number;
export const ROW: number;
export const FALL_MS: number;
export const MINUTE: number;
export const X0: Record<number, number>;
export function crackCount(tier?: number): number;
export function grateAt(room: number, tx: number): number;
export function grateSpan(room: number, i: number): { x0: number; x1: number; y: number };
export function dealStep(rand?: () => number): number;
export function rotate(set: number[], by: number): number[];
export function crackedNow(world: unknown, now: number): number[];
export function dealCracks(tier?: number, rand?: () => number, cyclic?: boolean): number[];
export function fallCounts(world: unknown, at: unknown, now: number): boolean;
export function isDown(world: unknown, i: number, now: number, extra?: unknown): boolean;
export function crackedAt(world: unknown, i: number, at: number): boolean;
export function standing(world: unknown, now: number, extra?: unknown): boolean[];
export function cleanFall(fall: unknown): (number | null)[];
