// Server-side rules for lab 4 "Elevator". The rules themselves live in public/lab4core.js,
// shared with the browser, so the lift and the echo behave the same on both sides.
// The server owns when the lift was called and this opening's arrival delay (30-50 s, drawn in
// newState when the room opens); the echo itself is kept by the Building.

export { call, canClear, cleanFrames, newState, publicWorld, recordEcho, DELAYS, ECHO_MS, type Echo, type Lab4State } from "../public/lab4core.js";

export const id = 4;
export const characters = ["echo", "key", "tall", "light"] as const;
