// Types for lab2core.js, so the Worker (src/lab2.ts) can import the same rules as the browser.

export interface Box { col: number | null; row: number | null }
export interface Lab2State {
  boxes: Box[]; crane: number; held: number; needed: number; presses?: number;
  /** wiring[k]: the crane slot button k drops at (this opening's order; ctrl on the sheet) */
  wiring?: number[]; shuffled?: boolean;
  /** the button that dropped the crane's box (-1: the sensor, or not yet) */
  pressed?: number;
  /** room 2-2: the hatch slot the box went down this shift (-1: none); a fresh box at shift end */
  lost?: number; rearm?: boolean;
  /** lab 2: weights[i] 1 full, 0 empty (this opening's secret; ctrl on the sheet), the crane's box last */
  weights?: number[];
  /** lab 2: an empty box landed on the plate: sealed (gate shut, plate boxes held) until the shift ends */
  jam?: boolean;
}

export const T: number;
export const COLS: number;
export const ROWS: number;
export const FILLS: number[][];
export function tileAt(tx: number, ty: number): number;
export const PLATE: { c0: number; c1: number; row: number };
export const SHELF_COLS: number[];
export const CRANE_SLOTS: number[];
export const CRANE_DEFAULT: number;

export function newState(tier?: number): Lab2State;
export function wiringOf(state: Lab2State): number[];
export function weightOf(state: Lab2State, i: number): number;
export function restRow(state: Lab2State, col: number, from: number): number | null;
export function plateLoad(state: Lab2State): number;
export function gateOpen(state: Lab2State): boolean;
export function act(state: Lab2State, character: string, what: unknown): string;
export function shiftEnded(state: Lab2State): boolean;
export function retier(state: Lab2State, tier: number): boolean;
export function publicWorld(world: unknown, state: Lab2State): Record<string, unknown>;
export function canClear(state: Lab2State, world: unknown): boolean;

export interface BoxRoom {
  FILLS: number[][];
  tileAt(tx: number, ty: number): number;
  PLATE: { c0: number; c1: number; row: number };
  CRANE_SLOTS: number[];
  CRANE_DEFAULT: number | null;
  MATS: number[][];
  newState(tier?: number): Lab2State;
  wiringOf(state: Lab2State): number[];
  weightOf(state: Lab2State, i: number): number;
  restRow(state: Lab2State, col: number, from: number): number | null;
  plateLoad(state: Lab2State): number;
  gateOpen(state: Lab2State): boolean;
  matHeld(state: Lab2State, i: number): boolean;
  act(state: Lab2State, character: string, what: unknown): string;
  shiftEnded(state: Lab2State): boolean;
  retier(state: Lab2State, tier: number): boolean;
  publicWorld(world: unknown, state: Lab2State): Record<string, unknown>;
  canClear(state: Lab2State, world: unknown): boolean;
}
export function boxRoom(spec: unknown): BoxRoom;
export const room12: BoxRoom;
