// Collects every translation key: each Korean string literal in public/*.js and each Korean
// text node or attribute in public/index.html. The Korean sentence is the key (see public/i18n.js).
//
//   node scripts/i18n-keys.mjs           writes i18n/keys.json (key → where it is used) and
//                                        reports keys missing from each dictionary
//   node scripts/i18n-keys.mjs --check   exits 1 on a missing key or a Korean template literal
//
// Exported for test/i18n.test.mjs.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const HANGUL = /[가-힣ㄱ-ㆎ]/;

/** Walks JS source and yields { kind: "str" | "tpl", text, line } for every literal. */
export function literals(src) {
  const out = [];
  let i = 0, line = 1, prev = ""; // prev: last significant char, to tell a regex from a division
  const n = src.length;
  const tplStack = []; // brace depth inside each open ${
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      i = stop; continue;
    }
    if (c === '"' || c === "'") {
      const start = line; let s = ""; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === "\n") line++;
        s += src[i++];
      }
      i++;
      out.push({ kind: "str", text: unescape(s), line: start });
      prev = c; continue;
    }
    if (c === "`" || (c === "}" && tplStack.length && tplStack[tplStack.length - 1] === 0)) {
      if (c === "}") tplStack.pop();
      const start = line; let s = ""; i++;
      let opened = false;
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { opened = true; i += 2; break; }
        if (src[i] === "\n") line++;
        s += src[i++];
      }
      if (opened) tplStack.push(0); else i++;
      out.push({ kind: "tpl", text: s, line: start });
      prev = "`"; continue;
    }
    if (c === "{" && tplStack.length) tplStack[tplStack.length - 1]++;
    if (c === "}" && tplStack.length) tplStack[tplStack.length - 1]--;
    if (c === "/" && /[(,=:[!&|?{};]|^$/.test(prev)) {
      // regex literal
      i++;
      let cls = false;
      while (i < n && (src[i] !== "/" || cls)) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false;
        i++;
      }
      i++;
      while (/[a-z]/.test(src[i] ?? "")) i++;
      prev = "/"; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

function unescape(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, e) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ""), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", 0: "\0" }[e] ?? e;
  });
}

/** Korean text in the page: text nodes (trimmed, spaces collapsed) and a few attributes. */
export function htmlKeys(html) {
  const keys = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of body.matchAll(/>([^<]+)</g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (HANGUL.test(text)) keys.push(text);
  }
  for (const m of body.matchAll(/\s(placeholder|aria-label|title)="([^"]*)"/g)) {
    if (HANGUL.test(m[2])) keys.push(m[2]);
  }
  return keys;
}

export const SKIP = new Set(["i18n.js"]);
export function jsFiles() {
  return readdirSync(new URL("public/", ROOT)).filter((f) => f.endsWith(".js") && !SKIP.has(f)).map((f) => "public/" + f);
}

/** { keys: Map<key, string[] where>, templates: [{ file, line, text }] } */
export function collect() {
  const keys = new Map();
  const templates = [];
  const add = (k, where) => { if (!keys.has(k)) keys.set(k, []); keys.get(k).push(where); };
  for (const f of jsFiles()) {
    const src = readFileSync(new URL(f, ROOT), "utf8");
    for (const lit of literals(src)) {
      if (!HANGUL.test(lit.text)) continue;
      if (lit.kind === "tpl") templates.push({ file: f, line: lit.line, text: lit.text });
      else add(lit.text, `${f}:${lit.line}`);
    }
  }
  const html = readFileSync(new URL("public/index.html", ROOT), "utf8");
  for (const k of htmlKeys(html)) add(k, "public/index.html");
  return { keys, templates };
}

export async function dictionaries() {
  const out = {};
  for (const l of ["en", "ja", "zh"]) out[l] = (await import(pathToFileURL(fileURLToPath(new URL(`public/i18n/${l}.js`, ROOT))).href + "?" + Date.now())).default;
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { keys, templates } = collect();
  const dicts = await dictionaries();
  let bad = 0;
  for (const tp of templates) { console.log(`template literal with Korean: ${tp.file}:${tp.line}  \`${tp.text}\``); bad++; }
  for (const [l, d] of Object.entries(dicts)) {
    const missing = [...keys.keys()].filter((k) => !d[k]);
    const stale = Object.keys(d).filter((k) => !keys.has(k));
    console.log(`${l}: ${keys.size - missing.length}/${keys.size} translated, ${missing.length} missing, ${stale.length} unused`);
    if (missing.length) bad++;
  }
  if (process.argv.includes("--check")) process.exit(bad ? 1 : 0);
  mkdirSync(new URL("i18n/", ROOT), { recursive: true });
  writeFileSync(new URL("i18n/keys.json", ROOT), JSON.stringify(Object.fromEntries(keys), null, 1) + "\n");
  console.log(`i18n/keys.json: ${keys.size} keys`);
}
