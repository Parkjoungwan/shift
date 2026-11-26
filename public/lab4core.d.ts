// Types for lab4core.js, so the Worker (src/lab4.ts) can import the same rules as the browser.

export interface Pos { x: number; y: number; face?: number }
export interface Echo { at: number; frames: [number, number, number][] }
export interface Lab4State { callAt: number | null; calls: number; arriveMs?: number }
export interface Plate { x0: number; x1: number; y: number }

export const ECHO_MS: number;
export const ECHO_STEP: number;
export const ECHO_FRAMES: number;
export function recordEcho(samples: { t: number; x: number; y: number; f: number }[], end: number): Echo | null;
export function cleanFrames(frames: unknown): [number, number, number][] | null;
export function echoAt(echo: Echo | null | undefined, now: number): (Pos & { character: string }) | null;

export const LIFT: Record<string, number>;
export const DELAY_MIN: number;
export const DELAY_MAX: number;
export const DELAY_STEP: number;
export const DELAYS: number[];
export function arriveMsOf(src: unknown): number;
type LiftAt = { y: number; phase: string; arriveIn: number | null; leavesIn?: number };
export function lift(callAt: number | null, now: number, arriveMs?: number): LiftAt;
export function liftIn(world: unknown, now: number): LiftAt;

export const PLATES: Plate[];
export function onPlate(pos: Pos | null | undefined, plate: Plate): boolean;
export function platesHeld(worker: Pos | null, echo: Pos | null): boolean[];
export function echoOnPlateBetween(echo: Echo | null, plate: Plate, from: number, to: number): boolean;

export function newState(tier?: number, rand?: () => number): Lab4State;
export function publicWorld(world: unknown, state: Lab4State): Record<string, unknown> | null;
export function canClear(state: Lab4State, world: unknown): boolean;
export function call(state: Lab4State, world: Record<string, unknown> | null, worker: Pos | null, echo: Echo | null, now: number):
  "no-power" | "busy" | "not-held" | "called";
