// Checks that every lab keeps the contract the client, the console and the offline mode rely on
// (public/labs.js lists it), that the browser and the server run the labs in the same order, and
// that a lab's blueprint and narration work on a fresh world. Usage: node test/labs.test.mjs

import { readFileSync } from "node:fs";
import { LABS, ORDER } from "../public/labs.js";

let failed = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
  if (!ok) failed++;
}

const server = readFileSync(new URL("../src/labs.ts", import.meta.url), "utf8");
const serverOrder = JSON.parse(/export const ORDER = (\[[^\]]*\]);/.exec(server)?.[1] ?? "null");
check("browser and server run the labs in the same order", JSON.stringify(serverOrder) === JSON.stringify(ORDER), `${serverOrder} vs ${ORDER}`);
check("every lab in the order exists", ORDER.every((id) => LABS[id]));
for (const id of ORDER) check(`lab ${id} has server rules`, new RegExp(`\n  ${id}: \{`).test(server));

const NEEDS = ["id", "name", "characters", "SPAWN", "tileAt", "solidAt", "doorOpen", "fresh", "ensure", "progress", "newPlayer", "step",
  "hint", "use", "narrate", "useless", "mood", "draw", "drawOverlay", "build3d", "schematic", "local"];
for (const id of ORDER) {
  const lab = LABS[id];
  const src = readFileSync(new URL(`../public/lab${id}.js`, import.meta.url), "utf8");
  const missing = NEEDS.filter((k) => lab[k] === undefined);
  check(`lab ${id} exports the lab contract`, !missing.length && lab.id === id, missing.join(", "));
  const local = lab.local ?? {};
  check(`lab ${id} has offline rules`, ["newState", "publicWorld", "canClear"].every((k) => typeof local[k] === "function"));
  // a lab whose use() opens the keypad needs a terminal offline too; one that asks the server to act, act
  if (/openPad\(/.test(src)) check(`lab ${id}: its keypad works offline (local.enter)`, typeof local.enter === "function");
  // a darkness that cuts the light's hole with even-odd must clip to its area first, or the light
  // carries a black disc around wherever the room is lit
  const dark = /export function drawDarkness[\s\S]*?\n}/.exec(src)?.[0] ?? "";
  if (dark.includes('"evenodd"')) check(`lab ${id}: the light's hole in the dark never paints the lit room`, dark.includes("clip()"));
  if (/api\.act\(/.test(src)) check(`lab ${id}: its devices work offline (local.act)`, typeof local.act === "function");
  // a fresh world, as everyone sees it before the first worker
  let world = null;
  try { world = local.publicWorld(lab.fresh(), local.newState(1)); } catch (err) { check(`lab ${id}: a fresh public world`, false, err.message); continue; }
  check(`lab ${id}: a fresh world belongs to this lab`, world?.lab === id || (id === 3 && world?.lab === 3));
  try {
    const sch = lab.schematic({ world, now: 0, actor: null, echo: null });
    check(`lab ${id}: the blueprint draws a fresh world`, Array.isArray(sch.map) && Array.isArray(sch.status) && sch.status.length > 0);
  } catch (err) { check(`lab ${id}: the blueprint draws a fresh world`, false, err.message); }
  try {
    lab.narrate(world, world); lab.mood(world, world); lab.hint(world, lab.newPlayer(), lab.characters[0], 0, 1);
    check(`lab ${id}: narration and hints take a fresh world`, true);
  } catch (err) { check(`lab ${id}: narration and hints take a fresh world`, false, err.message); }
  check(`lab ${id}: the entrance is open floor`, !lab.solidAt(world, Math.floor(lab.SPAWN.x / 16), Math.floor(lab.SPAWN.y / 16) - 1, null) && lab.solidAt(world, Math.floor(lab.SPAWN.x / 16), Math.floor(lab.SPAWN.y / 16), null));
  check(`lab ${id}: its equipment exists`, lab.characters.every((c) => lab.EQUIP[c]));
  if (lab.LEVER) {
    // a body (22 px, two tiles) has to fit standing at the lever: floor under it, open space above
    const tx = Math.floor(lab.LEVER.x / 16), row = lab.LEVER.y / 16;
    const room = [1, 2].every((k) => !lab.solidAt(world, tx, row - k, null)) && lab.solidAt(world, tx, row, null);
    check(`lab ${id}: there is room to stand at the lever`, Number.isInteger(row) && room);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
