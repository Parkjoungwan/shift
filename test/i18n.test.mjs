// Languages (public/i18n.js): every Korean string on screen has an English, Japanese and
// Chinese entry with the same {slots}, and the code keeps to the rules the key extractor needs.
// Run: node test/i18n.test.mjs

import { readFileSync } from "node:fs";
import { collect, dictionaries, jsFiles, literals } from "../scripts/i18n-keys.mjs";

let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log("FAIL " + what); } };

const { keys, templates } = collect();
for (const tp of templates) check(false, `Korean inside a template literal: ${tp.file}:${tp.line} \`${tp.text}\``);

// t() takes a literal; dynamic Korean goes through tr()
for (const f of jsFiles()) {
  const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const m of code.matchAll(/(?<![\w.$])t\(\s*([^\s)])/g)) {
    check(m[1] === '"' || m[1] === "'", `${f}: t() needs a string literal, got t(${m[1]}…`);
  }
}

const slots = (s) => [...s.matchAll(/\{(\w*)\}/g)].map((m) => m[1]).sort().join(",");
const dicts = await dictionaries();
for (const [lang, d] of Object.entries(dicts)) {
  let missing = 0;
  for (const k of keys.keys()) {
    const v = d[k];
    if (typeof v !== "string" || !v.trim()) { missing++; continue; }
    check(slots(v) === slots(k), `${lang}: slots differ for "${k}" → "${v}"`);
    check(!/[가-힣]/.test(v), `${lang}: Hangul left in "${k}" → "${v}"`);
  }
  check(missing === 0, `${lang}: ${missing} of ${keys.size} keys have no translation (node scripts/i18n-keys.mjs lists them)`);
}

// the extractor itself: a quick sanity check on tricky syntax
const lits = literals("const a = x / 2; const r = /'/g; const s = `가${b ? \"나\" : '다'}라`; // '주석'\n");
check(JSON.stringify(lits.map((l) => l.kind + ":" + l.text)) === JSON.stringify(["tpl:가", "str:나", "str:다", "tpl:라"]), "extractor reads strings inside template slots: " + JSON.stringify(lits));

console.log(failed ? `${failed} i18n check(s) failed` : `i18n: ${keys.size} keys, all languages complete`);
process.exit(failed ? 1 : 0);
