// Every lab the building has, and the order a run goes through them.
// Keep ORDER in step with src/labs.ts.
//
// A lab module exports (see lab3.js and lab4.js):
//   id, name, sign, characters, SPAWN, tileAt, solidAt, doorOpen, bodies?
//   fresh(), ensure(world), progress(world), newPlayer(), step(world, p, input, character, dt, now)
//   hint(world, p, character, now), use(api), tick?(api), narrate(prev, next), useless(world, character), mood(prev, next)
//   draw(ctx, opts), drawOverlay(ctx, opts), drawDarkness?(ctx, opts), build3d(kit), local (offline rules),
//   schematic({ world, now, actor, echo }) for the control console (see console.js)

import * as lab1 from "./lab1.js";
import * as lab2 from "./lab2.js";
import * as lab3 from "./lab3.js";
import * as lab4 from "./lab4.js";
import * as lab5 from "./lab5.js";
import * as lab6 from "./lab6.js";
import * as lab9 from "./lab9.js";
import * as lab11 from "./lab11.js";
import * as lab12 from "./lab12.js";
import * as lab13 from "./lab13.js";
import * as lab14 from "./lab14.js";
import * as lab15 from "./lab15.js";
import * as lab16 from "./lab16.js";

export const LABS = { 1: lab1, 2: lab2, 3: lab3, 4: lab4, 5: lab5, 6: lab6, 9: lab9, 11: lab11, 12: lab12, 13: lab13, 14: lab14, 15: lab15, 16: lab16 };
// The last lab is always "Clocking out" (9); the ones before it are added as they are built.
export const ORDER = [1, 11, 2, 12, 3, 13, 4, 14, 5, 15, 6, 16, 9];
export const FIRST = ORDER[0];

// Stages (공정): a lab's second stage is a room of its own, id 10 + the lab's number, that
// twists the lab's mechanic (docs/campaign.md §2.2). Keep in step with src/labs.ts.
export const labNo = (room) => (room > 10 ? room - 10 : room);
export const stageOf = (room) => (room > 10 ? 2 : 1);
export const stagesOf = (room, valve = 2) => (valve <= 1 ? 1 : ORDER.filter((r) => labNo(r) === labNo(room)).length);
/** "01", "01-2": how a room is written on screens and in the record. */
export const roomCode = (room) => `${String(labNo(room)).padStart(2, "0")}${stageOf(room) > 1 ? `-${stageOf(room)}` : ""}`;
export const nextRoom = (room, valve = 2) => ORDER.slice(ORDER.indexOf(room) + 1).find((r) => valve > 1 || stageOf(r) === 1);

export function labFor(id) {
  return LABS[id] ?? LABS[FIRST];
}
