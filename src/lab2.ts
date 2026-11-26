// Server-side rules for lab 2 "Boxes". The rules live in public/lab2core.js, shared with the
// browser, so a box comes to rest in the same place on both sides. The server owns the boxes and
// the crane's wiring (straight in this room; state.wiring travels with the world for the sheet).
// newState also decides, each opening, which stored boxes are full (state.weights): only full ones
// weigh on the plate, and an empty one set on it seals the plate until the shift ends (state.jam).

export { act, canClear, newState, publicWorld, retier, shiftEnded, type Lab2State } from "../public/lab2core.js";

export const id = 2;
export const characters = ["tall", "key", "light"] as const;
