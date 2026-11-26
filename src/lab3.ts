// Server-side rules for lab 3 "Glyphs". The wall never leaves the server except to the light
// worker standing at it. Fields the puzzle depends on (door, tries, gen, seen, the lock) are
// owned here and override whatever a client sends. Keep the constants and rules in step with
// public/lab3.js.
//
// The catch: the wall carries two rows, this issue's and the last one's, each with a pip tag,
// and they look alike. Only the terminal knows this issue's tag (the card standing at it sees it;
// the control desk sees it as wiring). Typing last issue's row is a thinking mistake and locks
// the terminal for the shift. Every new issue paints over the older row.
//
// `code` is the wall as the light reads it: [tag, g, g, g, g] per row, top row first. The name
// stays so that a plain `lab.code` read (src/labs.ts) hands the light the whole wall.

export const GLYPH_COUNT = 6;
export const CODE_LENGTH = 4;
export const MAX_TRIES = 3; // wrong entries before the older row is painted over
export const PER_SHIFT = 2; // plain wrong entries one shift may make before the terminal locks for it
export const LOCK_MS = 60_000; // fallback when no shift end arrives
export const TAGS = 6; // pip tags 1..6
export const WALL_ROWS = 2;
export const WALL_LENGTH = WALL_ROWS * (1 + CODE_LENGTH);

export interface LabState {
  code: number[]; // the wall: two rows of [tag, four glyphs]
  row: number; // which row is this issue's (0 top, 1 bottom)
  gen: number; // bumps every time the wall is painted
  genAt?: number; // when the current issue was painted (ms); older states lack it
  genWhy?: string; // why: "open" | "pass" (a verification round) | "reset" (three misses)
  tries: number;
  seen: boolean; // a light worker has read the current wall
  door: boolean;
  passes: number; // codes entered correctly so far
  needed: number; // codes the door wants: more staff, more verification (docs/campaign.md)
  shiftWrong?: number; // wrong entries since the shift began (PER_SHIFT locks; last issue's row locks at once)
  wrongAt?: number;
  stale?: number; // how many times last issue's row was typed (public, for the overseer's line)
}

function randInt(n: number): number {
  const limit = 256 - (256 % n); // reject the top of the byte range: every value equally likely
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    if (b < limit) return b % n;
  }
}

export function randomCode(): number[] {
  return Array.from({ length: CODE_LENGTH }, () => randInt(GLYPH_COUNT));
}

const at = (row: number) => row * (1 + CODE_LENGTH);
export const answer = (lab: LabState): number[] => lab.code.slice(at(lab.row) + 1, at(lab.row) + 1 + CODE_LENGTH);
export const issueOf = (lab: LabState): number => lab.code[at(lab.row)];
export const staleCode = (lab: LabState): number[] => lab.code.slice(at(1 - lab.row) + 1, at(1 - lab.row) + 1 + CODE_LENGTH);

/** A new issue paints over the older row: new glyphs (never the kept row's), a tag unlike the last two. */
function issue(lab: LabState, why: string): void {
  const keep = lab.row;
  const into = 1 - keep;
  const keptTag = lab.code[at(keep)];
  const keptGlyphs = lab.code.slice(at(keep) + 1, at(keep) + 1 + CODE_LENGTH).join();
  const old = lab.code[at(into)];
  const tags = Array.from({ length: TAGS }, (_, i) => i + 1).filter((g) => g !== keptTag && g !== old);
  let glyphs = randomCode();
  while (glyphs.join() === keptGlyphs) glyphs = randomCode();
  lab.code.splice(at(into), 1 + CODE_LENGTH, tags[randInt(tags.length)], ...glyphs);
  lab.row = into;
  lab.genAt = Date.now();
  lab.genWhy = why;
  lab.tries = 0;
  lab.seen = false;
}

/** The wall as the room opens: last issue's row (from before the opening) and this one's, top or bottom at random. */
function paintFresh(lab: LabState): void {
  lab.row = randInt(WALL_ROWS); // the old row; issue() paints the other
  lab.code = Array(WALL_LENGTH).fill(0);
  lab.code.splice(at(lab.row), 1 + CODE_LENGTH, 1 + randInt(TAGS), ...randomCode());
  issue(lab, "open");
}

/** tier 1-3: how many correct codes the door wants (one per verification round). */
export function newLab(tier = 1): LabState {
  const lab = { gen: 1, tries: 0, seen: false, door: false, passes: 0, needed: Math.max(1, Math.min(3, tier)), shiftWrong: 0, wrongAt: 0, stale: 0 } as LabState;
  paintFresh(lab);
  return lab;
}

/** A state stored by an older build (one bare row of four) gets a fresh wall. */
export function fix(lab: LabState): LabState {
  if (!Array.isArray(lab.code) || lab.code.length !== WALL_LENGTH || (lab.row !== 0 && lab.row !== 1)) {
    lab.gen = (lab.gen ?? 0) + 1;
    paintFresh(lab);
  }
  lab.shiftWrong ??= 0;
  lab.wrongAt ??= 0;
  lab.stale ??= 0;
  return lab;
}

export const locked = (lab: LabState, now = Date.now()): boolean =>
  (lab.shiftWrong ?? 0) >= PER_SHIFT && now - (lab.wrongAt ?? 0) < LOCK_MS;

export type EnterResult = "open" | "pass" | "wrong" | "stale" | "reset" | "locked" | "already" | "bad";

export function enter(lab: LabState, input: unknown, now = Date.now()): EnterResult {
  fix(lab);
  if (lab.door) return "already";
  if (
    !Array.isArray(input) ||
    input.length !== CODE_LENGTH ||
    !input.every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_COUNT)
  ) {
    return "bad";
  }
  if (lab.shiftWrong && now - (lab.wrongAt ?? 0) >= LOCK_MS) lab.shiftWrong = 0;
  if (locked(lab, now)) return "locked";
  const same = (code: number[]) => input.every((g, i) => g === code[i]);
  if (same(answer(lab))) {
    lab.tries = 0;
    lab.passes = (lab.passes ?? 0) + 1;
    if (lab.passes >= (lab.needed ?? 1)) {
      lab.door = true;
      return "open";
    }
    // one round verified: fresh glyphs over the older row, so the light has to read again
    lab.gen++;
    issue(lab, "pass");
    return "pass";
  }
  const stale = same(staleCode(lab));
  lab.tries++;
  lab.wrongAt = now;
  if (stale) {
    lab.stale = (lab.stale ?? 0) + 1;
    lab.shiftWrong = PER_SHIFT; // a note from the wrong issue is not a typo: the shift is spent
  } else lab.shiftWrong = (lab.shiftWrong ?? 0) + 1;
  if (lab.tries >= MAX_TRIES) {
    lab.gen++;
    issue(lab, "reset"); // every note about this issue now describes last issue's row
    return "reset";
  }
  return stale ? "stale" : "wrong";
}

/** A shift ended: the next card worker gets the terminal back. True when the state changed. */
export function shiftEnded(lab: LabState): boolean {
  if (!lab.shiftWrong) return false;
  lab.shiftWrong = 0;
  return true;
}

/** The glyph wall (lab.read): only the light, standing at it, sees both rows and their tags. */
export function read(lab: LabState, character: string): { gen: number; code: number[] } | null {
  if (character !== "light") return null;
  fix(lab);
  lab.seen = true;
  return { gen: lab.gen, code: [...lab.code] };
}

/** The admin's procedure valve: more staff, more verification rounds. */
export function retier(lab: LabState, tier: number): boolean {
  lab.needed = Math.max(tier, lab.passes ?? 0);
  return true;
}

/**
 * Builds the world everyone sees: the client's world with the protected fields
 * taken from the server and the wall removed. A null world stays null (fresh run).
 */
export function publicWorld(world: unknown, lab: LabState, now = Date.now()): unknown {
  if (!world || typeof world !== "object" || Array.isArray(world)) return null;
  fix(lab);
  const out: Record<string, unknown> = { ...(world as Record<string, unknown>) };
  delete out.code;
  delete out.shiftWrong;
  delete out.wrongAt;
  out.lab = 3;
  // gen / genAt / genWhy: when the wall was last painted and why. The tape keeps every world, so its
  // event strip can mark "glyphs changed" and a note written before that is provably stale.
  out.gen = lab.gen;
  out.genAt = lab.genAt ?? 0;
  out.genWhy = lab.genWhy ?? "open";
  out.tries = lab.tries;
  out.seen = lab.seen;
  out.door = lab.door;
  out.passes = lab.passes ?? 0;
  out.needed = lab.needed ?? 1;
  // Wiring, like the other rooms' (README "배선은 월드에 실려 갑니다"): this issue's tag for the
  // card's terminal screen and the row for the control desk's sheet. Never a glyph.
  out.issue = issueOf(lab);
  out.row = lab.row;
  out.locked = !lab.door && locked(lab, now);
  out.stale = lab.stale ?? 0;
  // The lever sits behind the door: it cannot be pulled while the door is shut.
  if (!lab.door) out.lever = false;
  return out;
}

export const id = 3;
export const characters = ["key", "tall", "light"] as const;
export const newState = (tier = 1) => newLab(tier);
export function canClear(lab: LabState, world: unknown): boolean {
  return lab.door && !!world && (world as Record<string, unknown>).lever === true;
}
