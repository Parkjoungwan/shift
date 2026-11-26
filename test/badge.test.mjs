// ID photo looks (public/badge.js): what the server accepts and how the form changes them.
// Run: node test/badge.test.mjs

import { LOOK_LENGTH, PARTS, cleanLook, decode, randomLook, rollPart, stepPart } from "../public/badge.js";

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log("FAIL " + what); } };

let seed = 3;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 500; i++) {
  const look = randomLook(rand);
  check(cleanLook(look) === look, `random look is valid: ${look}`);
}
check(cleanLook("") === "", "empty look is the silhouette");
check(cleanLook("z".repeat(LOOK_LENGTH)) === "", "out-of-range part is refused");
check(cleanLook("0".repeat(LOOK_LENGTH + 1)) === "", "wrong length is refused");
check(cleanLook({}) === "" && cleanLook(5) === "", "non-strings are refused");
check(cleanLook("<b>" + "0".repeat(LOOK_LENGTH - 3)) === "", "markup is refused");

const base = "0".repeat(LOOK_LENGTH);
for (const p of PARTS) {
  const rolled = decode(rollPart(base, p.id, rand)), before = decode(base);
  check(rolled[p.id] !== before[p.id], `rolling ${p.id} changes it`);
  check(PARTS.every((q) => q.id === p.id || rolled[q.id] === before[q.id]), `rolling ${p.id} leaves the other parts`);
  check(decode(stepPart(base, p.id, -1))[p.id] === p.n - 1, `stepping ${p.id} back wraps around`);
}

console.log(failed ? `${failed} badge check(s) failed` : "badge: all checks passed");
process.exit(failed ? 1 : 0);
