// Server-side rules for room 5-2 "Phase drop". The rules live in public/lab15core.js, shared with
// the browser: the room's phase, the anchor, and where falling boxes come to rest.

export { act, canClear, forge, newState, publicWorld, retier, type Lab15State } from "../public/lab15core.js";

export const id = 15;
export const characters = ["phase", "tall", "key"] as const;
