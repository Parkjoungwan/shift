// Server-side rules for room 2-2 "Safety mat". The rules live in public/lab2core.js (room12),
// shared with the browser: where boxes come to rest, which press mats hold a box, and the crane
// terminal's wiring (newState shuffles which button drops where, every time the room opens).

import { room12, type Lab2State } from "../public/lab2core.js";

export type { Lab2State };
export const { newState, publicWorld, canClear, act, retier, shiftEnded } = room12;
export const id = 12;
export const characters = ["tall", "key"] as const;
