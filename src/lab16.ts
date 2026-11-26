// Server-side rules for room 6-2 "Scheduled maintenance" (정기 점검). The rules live in
// public/lab6core.js, shared with the browser: the grates are re-hung at every minute's :00 on
// the server clock, and the cracked set moves along the row by this opening's step.

import { rules16, type Lab16State } from "../public/lab6core.js";

export type { Lab16State };
export const { newState, act, retier, publicWorld, canClear } = rules16;
export const id = 16;
export const characters = ["light", "key", "tall", "echo", "phase"] as const;
