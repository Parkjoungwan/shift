// The registration form's two extras: the language picker and the ID badge photo.
// client.js owns the form itself (name, submit, errors); this wires the parts that don't
// talk to the server until the name is sent.

import { LANGS, lang, setLang, t } from "./i18n.js";
import { PARTS, cleanLook, decode, drawFace, randomLook, rollPart, stepPart } from "./badge.js";

const PART_NAME = {
  skin: t("피부색"), hair: t("머리"), hairColor: t("머리색"), face: t("표정"),
  acc: t("소품"), hat: t("모자"), outfit: t("옷"), outfitColor: t("옷 색"),
};

/**
 * store: { get(key), set(key, value) } (storage may be blocked in an iframe).
 * keyLook: where the look is kept. beforeReload(): called before a language switch reloads the page.
 * Returns { look() } for the hello message.
 */
export function setupIntro({ store, keyLook, beforeReload }) {
  const $ = (id) => document.getElementById(id);
  let look = cleanLook(store.get(keyLook)) || randomLook();
  store.set(keyLook, look);

  // language: native names, never translated
  const row = $("langRow");
  for (const l of LANGS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l.name;
    b.lang = l.id;
    if (l.id === lang) b.className = "on";
    b.onclick = () => { if (l.id !== lang) { beforeReload?.(); setLang(l.id); } };
    row.append(b);
  }

  const grid = $("lookGrid");
  const labels = {};
  for (const p of PARTS) {
    const cell = document.createElement("div");
    cell.className = "part";
    const prev = document.createElement("button"); prev.type = "button"; prev.textContent = "◀";
    const next = document.createElement("button"); next.type = "button"; next.textContent = "▶";
    const name = document.createElement("button"); // press the name for a random pick of just this part
    name.type = "button"; name.className = "roll"; name.title = t("이 항목만 무작위로");
    labels[p.id] = name;
    name.onclick = () => change(rollPart(look, p.id));
    prev.onclick = () => change(stepPart(look, p.id, -1));
    next.onclick = () => change(stepPart(look, p.id, 1));
    cell.append(prev, name, next);
    grid.append(cell);
  }
  $("lookRandom").onclick = () => change(randomLook());

  function render() {
    const c = $("badgeFace"), g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    drawFace(g, look, 0, 0, c.width / 24);
    const parts = decode(look);
    for (const p of PARTS) labels[p.id].textContent = `🎲 ${PART_NAME[p.id]} ${parts[p.id] + 1}`;
  }
  function change(next) {
    look = next;
    store.set(keyLook, look);
    render();
  }
  render();
  return { look: () => look };
}
