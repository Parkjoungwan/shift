// Types for directives.js, so the Worker (src/building.ts) can import the same rules as the browser.

export type Phrase = [number, number] | [number, number, number, number, number];
export interface PinInput { n: number; x: number; y: number; msg: Phrase | null }

export const PINS: number;
export const STAMPS_PER_SHIFT: number;
export const STAMP_INK: string;
export const STAMPS: Record<"ok" | "wrong" | "old", { label: string; shape: string; color: string }>;
export const SIGNS: Record<string, { color: string; ink: string }>;
export function signFor(msg: unknown): string;
export const TEMPLATES: string[];
export const WORDS: { group: string; words: string[] }[];
export const ALL_WORDS: string[];
export const CONNECTORS: string[];
export function cleanPhrase(msg: unknown): Phrase | null;
export function phraseText(msg: unknown): string;
export function cleanPin(input: unknown): PinInput | null;
