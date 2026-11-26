// Room 6-2 "Scheduled maintenance" (정기 점검): the grates are re-hung on the building clock.
// The room is built by nightshift.js (shared with lab 6); the rules are in lab6core.js.

import { nightRoom } from "./nightshift.js";

export * from "./engine.js";

const R = nightRoom(16);
export const {
  id, name, characters, tileAt, SPAWN, LEVER, PANEL, WINCH, WINCH0, BOARD, DOOR_X, X0, X1, sign, traps,
  fresh, ensure, progress, newPlayer, doorOpen, solidAt, step, underFeet,
  hint, use, tick, acted, narrate, useless, mood,
  draw, drawBase, drawOverlay, schematic, build3d, fieldView, local,
} = R;
