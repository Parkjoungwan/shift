// The worker's ID photo (출입증 사진): a 24×24 pixel portrait built from a "look", a short string
// with one base-36 digit per part. The server keeps the look next to the nickname
// (src/building.ts imports cleanLook), so the same face shows on the badge, the queue, the
// archive roster and the credits. "" is the blank silhouette (no look, or a hidden name).
//
// Shared by the browser and the Worker: nothing here touches a browser API at load time.

/** Parts in look order, with how many choices each has. Append new parts at the end only. */
export const PARTS = [
  { id: "skin", n: 6 },
  { id: "hair", n: 10 },
  { id: "hairColor", n: 8 },
  { id: "face", n: 8 },
  { id: "acc", n: 7 },
  { id: "hat", n: 7 },
  { id: "outfit", n: 6 },
  { id: "outfitColor", n: 8 },
];
export const LOOK_LENGTH = PARTS.length;

/** The look a client sent, or "" when it is not a valid one. */
export function cleanLook(input) {
  if (typeof input !== "string" || input.length !== LOOK_LENGTH) return "";
  for (let i = 0; i < LOOK_LENGTH; i++) {
    const v = parseInt(input[i], 36);
    if (!/[0-9a-z]/.test(input[i]) || !(v < PARTS[i].n)) return "";
  }
  return input;
}

export function decode(look) {
  const ok = cleanLook(look);
  if (!ok) return null;
  return Object.fromEntries(PARTS.map((p, i) => [p.id, parseInt(ok[i], 36)]));
}

export function encode(parts) {
  return PARTS.map((p) => (Math.max(0, Math.min(p.n - 1, parts[p.id] | 0))).toString(36)).join("");
}

/** A random look. Accessories and hats are rarer than none, so a crowd still reads as people. */
export function randomLook(rand = Math.random) {
  const pick = (n) => Math.floor(rand() * n);
  const parts = Object.fromEntries(PARTS.map((p) => [p.id, pick(p.n)]));
  if (rand() < 0.5) parts.acc = 0;
  if (rand() < 0.45) parts.hat = 0;
  return encode(parts);
}

/** A new random choice for one part, different from the current one. */
export function rollPart(look, id, rand = Math.random) {
  const parts = decode(look) ?? decode(randomLook());
  const p = PARTS.find((q) => q.id === id);
  parts[id] = (parts[id] + 1 + Math.floor(rand() * (p.n - 1))) % p.n;
  return encode(parts);
}

/** Steps one part forward or back, wrapping around. */
export function stepPart(look, id, dir) {
  const parts = decode(look) ?? decode(randomLook());
  const p = PARTS.find((q) => q.id === id);
  parts[id] = (parts[id] + dir + p.n) % p.n;
  return encode(parts);
}

const BG = "#ffffff"; // one white backdrop, like a real ID photo (never muted)
const SKIN = [["#f6d7b8", "#d9b090"], ["#eec39a", "#cf9f74"], ["#d9a577", "#b8845a"], ["#b67c52", "#94603b"], ["#8a5a3a", "#6c4229"], ["#5e3c27", "#45291a"]];
const HAIR = ["#1c1a1a", "#3b2618", "#6b4424", "#d9b45a", "#9c9a96", "#a8402a", "#3a5fa8", "#d77fa6"];
const CLOTH = ["#2f4a7a", "#3f6b45", "#7a2f32", "#3a3a3e", "#c98a2a", "#5a4a7a", "#2a7a78", "#8a8378"];
const INK = "#1e1c1a";
const SILHOUETTE = "#3a3936";

// A faded ID photo: every colour loses most of its saturation and drifts toward the paper tone
// (#e9e4d6), so the portraits sit with the forms instead of shouting over them.
const SATURATION = 0.4, PAPER = [233, 228, 214], FADE = 0.12;
const muted = new Map();
function mute(c) {
  if (muted.has(c)) return muted.get(c);
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  const out = rgb.map((v, i) => Math.round((lum + (v - lum) * SATURATION) * (1 - FADE) + PAPER[i] * FADE));
  const hex = "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("") + (m[2] ?? "");
  muted.set(c, hex);
  return hex;
}

// Head and body as horizontal spans [row, x0, x1] (inclusive), on the 24×24 grid.
const HEAD = [[5, 9, 14], [6, 8, 15], [7, 7, 16], [8, 7, 16], [9, 7, 16], [10, 7, 16], [11, 7, 16], [12, 7, 16], [13, 8, 15], [14, 8, 15], [15, 9, 14], [16, 10, 13]];
const NECK = [[16, 10, 13], [17, 10, 13], [18, 10, 13]];
const BODY = [[19, 6, 17], [20, 4, 19], [21, 3, 20], [22, 2, 21], [23, 2, 21]];

/**
 * Draws the portrait with its top-left at (x, y), each grid pixel `px` screen pixels.
 * Pass a look of "" for the blank silhouette.
 */
export function drawFace(ctx, look, x, y, px) {
  const L = decode(look);
  const R = (cx, cy, w, h, c) => { ctx.fillStyle = mute(c); ctx.fillRect(x + cx * px, y + cy * px, w * px, h * px); };
  const spans = (list, c) => { for (const [r, a, b] of list) R(a, r, b - a + 1, 1, c); };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (!L) {
    ctx.fillStyle = BG; ctx.fillRect(x, y, 24 * px, 24 * px);
    spans(HEAD, SILHOUETTE); spans(NECK, SILHOUETTE); spans(BODY, SILHOUETTE);
    ctx.restore();
    return;
  }
  const [skin, shade] = SKIN[L.skin];
  const hair = HAIR[L.hairColor];
  const cloth = CLOTH[L.outfitColor];
  ctx.fillStyle = BG; ctx.fillRect(x, y, 24 * px, 24 * px);
  // long hair falls behind the shoulders
  if (L.hair === 3) { R(6, 8, 2, 12, hair); R(16, 8, 2, 12, hair); }
  if (L.hair === 4) { R(6, 8, 2, 7, hair); R(16, 8, 2, 7, hair); }
  spans(NECK, shade);
  outfit(R, spans, L.outfit, cloth, skin);
  spans(HEAD, skin);
  R(7, 11, 1, 2, shade); R(16, 11, 1, 2, shade); // ears' shadow
  // a darker rim keeps light hair readable against pale skin and the white backdrop
  const rim = shadeOf(hair);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) hairOn((cx, cy, w, h) => R(cx + dx, cy + dy, w, h, rim), L.hair, rim);
  hairOn(R, L.hair, hair);
  face(R, L.face, shade);
  accessory(R, L.acc, skin);
  hat(R, L.hat, cloth, hair);
  ctx.restore();
}

/** The same colour, darker: for outlines. */
function shadeOf(c) {
  const n = parseInt(c.slice(1, 7), 16);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.55).toString(16).padStart(2, "0")).join("");
}

function outfit(R, spans, kind, cloth, skin) {
  spans(BODY, cloth);
  if (kind === 0) { // hi-vis work vest over a shirt
    spans(BODY, "#e8e2d4");
    R(3, 21, 5, 3, "#e8b830"); R(16, 21, 5, 3, "#e8b830"); R(5, 20, 3, 1, "#e8b830"); R(16, 20, 3, 1, "#e8b830");
    R(3, 22, 5, 1, "#d8d8d0"); R(16, 22, 5, 1, "#d8d8d0");
    R(9, 19, 6, 1, cloth);
  } else if (kind === 1) { // suit and tie
    R(9, 19, 6, 2, "#f2efe8"); R(10, 21, 4, 1, "#f2efe8"); R(11, 19, 2, 5, cloth === CLOTH[2] ? "#2f4a7a" : "#7a2f32");
    R(8, 19, 1, 3, "#1e1c1a"); R(15, 19, 1, 3, "#1e1c1a");
  } else if (kind === 2) { // coverall: zip and chest pocket
    R(11, 19, 1, 5, "#1e1c1a"); R(14, 21, 3, 2, "#00000033"); R(9, 19, 6, 1, "#00000022");
  } else if (kind === 3) { // hoodie: hood around the neck and strings
    R(7, 18, 10, 2, cloth); R(9, 18, 6, 1, "#00000033"); R(10, 20, 1, 3, "#f2efe8"); R(13, 20, 1, 3, "#f2efe8");
  } else if (kind === 4) { // lab coat over a coloured shirt
    spans(BODY, "#f2efe8"); R(10, 19, 4, 5, cloth); R(9, 19, 1, 4, "#c8c4ba"); R(14, 19, 1, 4, "#c8c4ba"); R(16, 21, 3, 1, "#3a5fa8");
  } else { // uniform: collar, shoulder tabs and a name tag
    R(9, 19, 2, 2, "#f2efe8"); R(13, 19, 2, 2, "#f2efe8"); R(4, 20, 3, 1, "#e8b830"); R(17, 20, 3, 1, "#e8b830"); R(15, 21, 4, 2, "#f2efe8");
  }
}

function hairOn(R, kind, c) {
  switch (kind) {
    case 0: break; // shaved
    case 1: R(8, 4, 8, 1, c); R(7, 5, 10, 2, c); R(7, 7, 1, 2, c); R(16, 7, 1, 2, c); break; // short
    case 2: R(8, 4, 9, 1, c); R(7, 5, 10, 2, c); R(7, 7, 4, 1, c); R(7, 7, 1, 3, c); R(16, 7, 1, 3, c); break; // side part
    case 3: R(8, 4, 8, 1, c); R(7, 5, 10, 3, c); R(6, 7, 2, 4, c); R(16, 7, 2, 4, c); break; // long
    case 4: R(8, 4, 8, 1, c); R(7, 5, 10, 3, c); R(7, 8, 1, 4, c); R(16, 8, 1, 4, c); R(6, 7, 1, 6, c); R(17, 7, 1, 6, c); break; // bob
    case 5: R(8, 4, 8, 1, c); R(7, 5, 10, 2, c); R(7, 7, 1, 2, c); R(16, 7, 1, 2, c); R(17, 6, 2, 2, c); R(18, 8, 2, 6, c); break; // ponytail
    case 6: for (let i = 0; i < 5; i++) R(8 + i * 2, 3 + (i % 2), 1, 2, c); R(7, 5, 10, 2, c); break; // spiky
    case 7: R(7, 2, 10, 2, c); R(5, 4, 14, 3, c); R(5, 7, 2, 5, c); R(17, 7, 2, 5, c); R(7, 7, 2, 1, c); R(15, 7, 2, 1, c); break; // curly
    case 8: R(10, 1, 4, 3, c); R(8, 4, 8, 1, c); R(7, 5, 10, 2, c); R(7, 7, 1, 2, c); R(16, 7, 1, 2, c); break; // bun
    case 9: R(10, 1, 4, 6, c); R(7, 6, 1, 3, c); R(16, 6, 1, 3, c); break; // crest
  }
}

function face(R, kind, shade) {
  const eyes = (dy = 0, h = 1) => { R(9, 10 + dy, 2, h, INK); R(13, 10 + dy, 2, h, INK); };
  switch (kind) {
    case 0: eyes(); R(10, 13, 4, 1, shade); break; // plain
    case 1: eyes(0, 2); R(10, 13, 4, 1, INK); R(9, 12, 1, 1, INK); R(14, 12, 1, 1, INK); break; // smile
    case 2: eyes(1); R(9, 9, 2, 1, shade); R(13, 9, 2, 1, shade); R(10, 14, 4, 1, shade); break; // tired
    case 3: R(9, 10, 1, 2, INK); R(14, 10, 1, 2, INK); R(11, 13, 2, 2, INK); break; // surprised
    case 4: eyes(); R(9, 8, 2, 1, INK); R(13, 8, 2, 1, INK); R(10, 14, 4, 1, INK); R(9, 13, 1, 1, INK); R(14, 13, 1, 1, INK); break; // stern
    case 5: R(9, 10, 2, 1, INK); R(13, 11, 2, 1, INK); R(10, 13, 3, 1, INK); break; // wink
    case 6: eyes(0, 2); R(11, 13, 2, 1, INK); R(8, 12, 1, 1, "#e08a8a"); R(15, 12, 1, 1, "#e08a8a"); break; // blush
    case 7: eyes(); R(10, 13, 4, 1, INK); R(13, 12, 1, 1, INK); break; // smirk
  }
}

function accessory(R, kind) {
  switch (kind) {
    case 0: break;
    case 1: R(8, 9, 4, 1, INK); R(8, 11, 4, 1, INK); R(8, 9, 1, 3, INK); R(11, 9, 1, 3, INK); R(12, 10, 1, 1, INK); R(13, 9, 4, 1, INK); R(13, 11, 4, 1, INK); R(13, 9, 1, 3, INK); R(16, 9, 1, 3, INK); break; // glasses
    case 2: R(8, 9, 4, 3, INK); R(13, 9, 4, 3, INK); R(12, 10, 1, 1, INK); R(9, 9, 1, 1, "#6a6a70"); R(14, 9, 1, 1, "#6a6a70"); break; // sunglasses
    case 3: R(8, 12, 8, 3, "#e8eef0"); R(9, 15, 6, 1, "#e8eef0"); R(7, 12, 1, 1, "#c8d0d4"); R(16, 12, 1, 1, "#c8d0d4"); break; // mask
    case 4: R(13, 12, 3, 1, "#e8d2b0"); R(14, 11, 1, 3, "#e8d2b0"); break; // plaster
    case 5: R(13, 9, 3, 3, INK); R(7, 8, 10, 1, INK); break; // eye patch
    case 6: R(7, 13, 1, 1, "#e8c040"); R(16, 13, 1, 1, "#e8c040"); break; // earrings
  }
}

function hat(R, kind, cloth, hair) {
  switch (kind) {
    case 0: break;
    case 1: R(8, 2, 8, 1, "#e8b830"); R(7, 3, 10, 3, "#e8b830"); R(5, 6, 14, 1, "#c89a20"); R(11, 2, 2, 4, "#f2d060"); break; // hard hat
    case 2: R(8, 3, 8, 1, cloth); R(7, 4, 10, 2, cloth); R(15, 6, 5, 1, cloth); R(11, 4, 2, 1, "#f2efe8"); break; // cap
    case 3: R(8, 2, 8, 1, cloth); R(7, 3, 10, 3, cloth); R(7, 6, 10, 1, "#00000044"); R(11, 1, 2, 1, cloth); break; // beanie
    case 4: R(7, 6, 10, 1, "#d03a3a"); break; // headband
    case 5: R(7, 6, 10, 1, INK); R(8, 5, 3, 2, "#9fd0e0"); R(13, 5, 3, 2, "#9fd0e0"); break; // goggles up
    case 6: R(8, 4, 8, 1, INK); R(6, 9, 2, 4, "#d03a3a"); R(16, 9, 2, 4, "#d03a3a"); R(7, 5, 1, 4, INK); R(16, 5, 1, 4, INK); break; // ear muffs
  }
  void hair;
}

/** A small canvas element with the portrait, for lists (queue, roster, credits). */
export function faceCanvas(look, px = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 24 * px;
  c.className = "face";
  drawFace(c.getContext("2d"), look, 0, 0, px);
  return c;
}
