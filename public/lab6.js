// Lab 6 "Night shift" (야간 교대): drop grates over a shock trench, re-hung at a winch.
// The room is built by nightshift.js (shared with room 6-2); the rules are in lab6core.js.

import { nightRoom } from "./nightshift.js";

export * from "./engine.js";

const R = nightRoom(6);
export const {
  id, name, characters, tileAt, SPAWN, LEVER, PANEL, WINCH, WINCH0, BOARD, DOOR_X, X0, X1, sign, traps,
  fresh, ensure, progress, newPlayer, doorOpen, solidAt, step, underFeet,
  hint, use, tick, acted, narrate, useless, mood,
  draw, drawBase, drawOverlay, schematic, build3d, fieldView, local,
} = R;
