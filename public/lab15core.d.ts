// Types for lab15core.js, so the Worker (src/lab15.ts) can import the same rules as the browser.

import type { Phrase } from "./directives.js";

export interface Lab15State {
  phase: "blue" | "red";
  anchor: "blue" | "red" | null;
  used: { logId: number; n: number };
  boxes: { col: number; row: number }[];
  needed: number;
  seen?: { logId: number; character: string }[]; // shifts that acted here: what the overseer signs with
}
export const FILLS: number[][];
export function tileAt(tx: number, ty: number): number;
export const PLATES: number[];
export const SOCKETS: { blue: number; red: number };
export const SWITCHES_PER_SHIFT: number;
export function newState(tier?: number): Lab15State;
export function settle(state: Lab15State): void;
export function plateLoad(state: Lab15State): number;
export function gateOpen(state: Lab15State): boolean;
export function act(state: Lab15State, character: string, what: unknown, logId?: number): string;
export function retier(state: Lab15State, tier: number): boolean;
export function publicWorld(world: unknown, state: Lab15State): Record<string, unknown>;
export function canClear(state: Lab15State, world: unknown): boolean;
export const SEEN_MAX: number;
export const FORGE_AT: { x: number; y: number };
export const FORGE_TRUTH: number;
export const EQUIP_WORD: Record<string, string>;
export function neededNext(state: Lab15State): string;
export function wastedNow(state: Lab15State): string[];
export function forgers(state: Lab15State, ended?: { logId: number; character: string } | null): number[];
export function forge(
  state: Lab15State,
  ended?: { logId: number; character: string } | null,
  rand?: () => number,
): { x: number; y: number; msg: Phrase; logId: number };
