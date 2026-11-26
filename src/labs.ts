// Every lab the building has, and the order a run goes through them.
// Keep ORDER in step with public/labs.js.

import type { Character } from "./shared";
import * as lab1 from "./lab1";
import * as lab2 from "./lab2";
import * as lab3 from "./lab3";
import * as lab4 from "./lab4";
import * as lab5 from "./lab5";
import * as lab6 from "./lab6";
import * as lab9 from "./lab9";
import * as lab11 from "./lab11";
import * as lab12 from "./lab12";
import * as lab13 from "./lab13";
import * as lab14 from "./lab14";
import * as lab15 from "./lab15";
import * as lab16 from "./lab16";

export interface ServerLab {
  id: number;
  characters: readonly Character[];
  /** tier 1-3: how much procedure this opening of the room asks for (docs/campaign.md) */
  newState(tier?: number): unknown;
  /** The world everyone may see: protected fields from the server state, secrets removed. */
  publicWorld(world: unknown, state: unknown): unknown;
  canClear(state: unknown, world: unknown): boolean;
  /** The terminal, for labs that have one: the card types glyphs (lab.enter). */
  enter?(state: unknown, input: unknown): string;
  /** The admin's procedure valve moved: fit the open lab to the new tier. True when the state changed. */
  retier?(state: unknown, tier: number): boolean;
  /** A worker does something at a device (lab.act): the server judges it by the worker's equipment. */
  act?(state: unknown, character: string, what: unknown, logId: number): string;
  /** The overseer's unsigned directive after a shift (lab 5), or nothing. */
  /** The overseer's forged pin after a shift; logId is the (false) signature, 0 for unsigned. */
  forge?(state: unknown, ended?: { logId: number; character: string }): { x: number; y: number; msg: unknown; logId?: number };
  /** A worker reads a surface only its equipment can (lab.read): what is written there, or null. */
  read?(state: unknown, character: string): { gen: number; code: number[]; part?: string } | null;
  /** A shift ended (lab 2: a carried box goes back). True when the state changed. */
  shiftEnded?(state: unknown): boolean;
}

export const LABS: Record<number, ServerLab> = {
  1: {
    id: 1,
    characters: lab1.characters,
    newState: lab1.newState,
    publicWorld: (w, s) => lab1.publicWorld(w, s as lab1.Lab1State),
    canClear: (s, w) => lab1.canClear(s as lab1.Lab1State, w),
    act: (s, character, what) => lab1.act(s as lab1.Lab1State, character, what),
    retier: (s, tier) => lab1.retier(s as lab1.Lab1State, tier),
  },
  2: {
    id: 2,
    characters: lab2.characters,
    newState: lab2.newState,
    publicWorld: (w, s) => lab2.publicWorld(w, s as lab2.Lab2State),
    canClear: (s, w) => lab2.canClear(s as lab2.Lab2State, w),
    act: (s, character, what) => lab2.act(s as lab2.Lab2State, character, what),
    retier: (s, tier) => lab2.retier(s as lab2.Lab2State, tier),
    shiftEnded: (s) => lab2.shiftEnded(s as lab2.Lab2State),
  },
  3: {
    id: 3,
    characters: lab3.characters,
    newState: lab3.newState,
    publicWorld: (w, s) => lab3.publicWorld(w, s as lab3.LabState),
    canClear: (s, w) => lab3.canClear(s as lab3.LabState, w),
    enter: (s, input) => lab3.enter(s as lab3.LabState, input),
    // only the light, at the glyph wall, sees the ultraviolet rows (both, with their tags)
    read: (s, character) => lab3.read(s as lab3.LabState, character),
    retier: (s, tier) => lab3.retier(s as lab3.LabState, tier),
    shiftEnded: (s) => lab3.shiftEnded(s as lab3.LabState), // a stale or doubled miss locks the terminal for one shift
  },
  4: {
    id: 4,
    characters: lab4.characters,
    newState: lab4.newState,
    publicWorld: (w, s) => lab4.publicWorld(w, s as lab4.Lab4State),
    canClear: (s, w) => lab4.canClear(s as lab4.Lab4State, w),
  },
  5: {
    id: 5,
    characters: lab5.characters,
    newState: lab5.newState,
    publicWorld: (w, s) => lab5.publicWorld(w, s as lab5.Lab5State),
    canClear: (s, w) => lab5.canClear(s as lab5.Lab5State, w),
    act: (s, character, what, logId) => lab5.act(s as lab5.Lab5State, character, what, logId),
    retier: (s, tier) => lab5.retier(s as lab5.Lab5State, tier),
    forge: (s, ended) => lab5.forge(s as lab5.Lab5State, ended),
  },
  11: {
    id: 11,
    characters: lab11.characters,
    newState: lab11.newState,
    publicWorld: (w, s) => lab11.publicWorld(w, s as lab11.Lab11State),
    canClear: (s, w) => lab11.canClear(s as lab11.Lab11State, w),
    act: (s, character, what) => lab11.act(s as lab11.Lab11State, character, what),
    retier: (s, tier) => lab11.retier(s as lab11.Lab11State, tier),
  },
  12: {
    id: 12,
    characters: lab12.characters,
    newState: lab12.newState,
    publicWorld: (w, s) => lab12.publicWorld(w, s as lab12.Lab2State),
    canClear: (s, w) => lab12.canClear(s as lab12.Lab2State, w),
    act: (s, character, what) => lab12.act(s as lab12.Lab2State, character, what),
    retier: (s, tier) => lab12.retier(s as lab12.Lab2State, tier),
    shiftEnded: (s) => lab12.shiftEnded(s as lab12.Lab2State),
  },
  13: {
    id: 13,
    characters: lab13.characters,
    newState: lab13.newState,
    publicWorld: (w, s) => lab13.publicWorld(w, s as lab13.Lab13State),
    canClear: (s, w) => lab13.canClear(s as lab13.Lab13State, w),
    enter: (s, input) => lab13.enter(s as lab13.Lab13State, input),
    read: (s, character) => lab13.read(s as lab13.Lab13State, character),
    retier: (s, tier) => lab13.retier(s as lab13.Lab13State, tier),
    shiftEnded: (s) => lab13.shiftEnded(s as lab13.Lab13State),
  },
  14: {
    id: 14,
    characters: lab14.characters,
    newState: lab14.newState,
    publicWorld: (w, s) => lab14.publicWorld(w, s as lab14.Lab14State),
    canClear: (s, w) => lab14.canClear(s as lab14.Lab14State, w),
    retier: (s, tier) => lab14.retier(s as lab14.Lab14State, tier),
  },
  15: {
    id: 15,
    characters: lab15.characters,
    newState: lab15.newState,
    publicWorld: (w, s) => lab15.publicWorld(w, s as lab15.Lab15State),
    canClear: (s, w) => lab15.canClear(s as lab15.Lab15State, w),
    act: (s, character, what, logId) => lab15.act(s as lab15.Lab15State, character, what, logId),
    retier: (s, tier) => lab15.retier(s as lab15.Lab15State, tier),
    forge: (s, ended) => lab15.forge(s as lab15.Lab15State, ended),
  },
  6: {
    id: 6,
    characters: lab6.characters,
    newState: (tier) => lab6.newState(tier),
    publicWorld: (w, s) => lab6.publicWorld(w, s as lab6.Lab6State),
    canClear: (s, w) => lab6.canClear(s as lab6.Lab6State, w),
    // the far winch's inspection slip comes back in the result, to the card that ran it only
    act: (s, character, what) => lab6.act(s as lab6.Lab6State, character, what),
    retier: (s, tier) => lab6.retier(s as lab6.Lab6State, tier),
  },
  16: {
    id: 16,
    characters: lab16.characters,
    newState: (tier) => lab16.newState(tier),
    publicWorld: (w, s) => lab16.publicWorld(w, s as lab16.Lab16State),
    canClear: (s, w) => lab16.canClear(s as lab16.Lab16State, w),
    act: (s, character, what) => lab16.act(s as lab16.Lab16State, character, what),
    retier: (s, tier) => lab16.retier(s as lab16.Lab16State, tier),
  },
  9: {
    id: 9,
    characters: lab9.characters,
    newState: lab9.newState,
    publicWorld: (w, s) => lab9.publicWorld(w, s as lab9.Lab9State),
    canClear: (s, w) => lab9.canClear(s as lab9.Lab9State, w),
    enter: (s, input) => lab9.enter(s as lab9.Lab9State, input),
    shiftEnded: (s) => lab9.shiftEnded(s as lab9.Lab9State), // a wrong entry locks the terminal for one shift
    retier(s, tier) {
      // a new tear of the note, unless someone already got the exit open
      const lab = s as lab9.Lab9State;
      if (lab.door || lab.pieces.length === Math.max(1, Math.min(3, tier))) return false;
      lab.pieces = lab9.tornNote(tier);
      // the tape's event strip marks a new note like any other re-issue
      Object.assign(lab, { gen: ((lab as { gen?: number }).gen ?? 1) + 1, genAt: Date.now(), genWhy: "tier" });
      return true;
    },
  },
};

// The last lab is always "Clocking out" (9); the ones before it are added as they are built.
export const ORDER = [1, 11, 2, 12, 3, 13, 4, 14, 5, 15, 6, 16, 9];
export const FIRST = ORDER[0];

// Stages (공정): a lab's second stage is a room of its own, id 10 + the lab's number, that
// twists the lab's mechanic (docs/campaign.md §2.2). Keep in step with public/labs.js.
export const labNo = (room: number): number => (room > 10 ? room - 10 : room);
export const stageOf = (room: number): number => (room > 10 ? 2 : 1);
/** How many stages this room's lab has in the run; the admin's valve (1) leaves only the first. */
export function stagesOf(room: number, valve = 2): number {
  return valve <= 1 ? 1 : ORDER.filter((r) => labNo(r) === labNo(room)).length;
}
/** The room after this one; with the valve at 1, second stages are skipped. */
export function nextRoom(room: number, valve = 2): number | undefined {
  return ORDER.slice(ORDER.indexOf(room) + 1).find((r) => valve > 1 || stageOf(r) === 1);
}
