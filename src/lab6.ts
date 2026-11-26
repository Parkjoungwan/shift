// Server-side rules for lab 6 "Night shift" (야간 교대). The rules live in public/lab6core.js,
// shared with the browser: which grates are cracked, re-hanging them at a winch (a new cracked
// set each time; the far winch's slip goes only to the card that ran it), and door D.

import { rules6, type Lab6State } from "../public/lab6core.js";

export type { Lab6State };
export const { newState, act, retier, publicWorld, canClear } = rules6;
export const id = 6;
export const characters = ["light", "key", "tall", "echo", "phase"] as const;
