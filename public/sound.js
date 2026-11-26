// Sound, made in code with the Web Audio API: no audio files, nothing to license or download.
//
// Three layers under one master volume (and one mute switch, remembered in this browser):
//   ambience  the room you are in. The control console (white collar) is an office: mains hum,
//             a fluorescent tube's buzz, air conditioning, now and then a keyboard. The field (blue
//             collar, working) is the plant: a low machine drone that breathes, ventilation
//             rumble, distant metal. The full CCTV sits between them, thinner. See docs/two-views.md.
//   music     the console only: slow, polite lobby music in a minor key (the overseer's idea of
//             a pleasant workplace). It fades out when you clock in.
//   effects   one-shots: jump, land, devices, stamps, notes, the overseer's voice, accidents,
//             a room cleared, the last ten seconds of a shift.
// Browsers start audio only after a user gesture: unlock() is called on the first key or click.
// Everything here is best effort: with no Web Audio, every call does nothing.

const KEY = "shift.mute";

let ctx = null, master = null, buses = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === "1"; } catch { /* storage blocked */ }

const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;

/** Starts audio (call from a key or click handler). Safe to call often. */
export function unlock() {
  if (!AC) return;
  if (!ctx) {
    try { ctx = new AC(); } catch { return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    // a gentle limiter so stacked effects never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    buses = { amb: bus(0.55), music: bus(0.3), fx: bus(0.9) };
    noiseBuf = makeNoise();
    buildAmbience();
    setScene(scene, true);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

export const isMuted = () => muted;
export function setMuted(on) {
  muted = !!on;
  try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
}

function bus(level) {
  const g = ctx.createGain();
  g.gain.value = level;
  g.connect(master);
  return g;
}

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ---------- small building blocks ----------

const now = () => ctx.currentTime;

/** A tone with an attack/decay envelope. f: Hz or [from, to] for a sweep. */
function tone({ f, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, out = buses.fx, filter = null }) {
  const start = now() + t;
  const o = ctx.createOscillator();
  o.type = type;
  const [f0, f1] = Array.isArray(f) ? f : [f, f];
  o.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = o;
  if (filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = filter.type ?? "lowpass"; fl.frequency.value = filter.f; fl.Q.value = filter.q ?? 0.7;
    node.connect(fl); node = fl;
  }
  node.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** A burst of filtered noise. */
function noise({ t = 0, dur = 0.1, gain = 0.2, type = "bandpass", f = 1000, q = 1, f1 = null, out = buses.fx, attack = 0.002 }) {
  const start = now() + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type; fl.frequency.setValueAtTime(f, start); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(fl).connect(g).connect(out);
  src.start(start, Math.random());
  src.stop(start + dur + 0.05);
}

// ---------- effects ----------

const FX = {
  jump() { tone({ f: [260, 520], type: "square", dur: 0.09, gain: 0.05, filter: { f: 1800 } }); },
  land() { noise({ dur: 0.07, gain: 0.12, type: "lowpass", f: 380 }); },
  key() { tone({ f: 1500, type: "square", dur: 0.03, gain: 0.04, filter: { f: 3000 } }); },
  accept() {
    tone({ f: 880, dur: 0.08, gain: 0.12 });
    tone({ f: 1320, t: 0.08, dur: 0.12, gain: 0.12 });
  },
  deny() {
    tone({ f: 150, type: "square", dur: 0.22, gain: 0.09, filter: { f: 900 } });
    tone({ f: 112, type: "square", t: 0.02, dur: 0.22, gain: 0.07, filter: { f: 700 } });
  },
  stamp() {
    tone({ f: [110, 48], dur: 0.16, gain: 0.35 });
    noise({ dur: 0.04, gain: 0.18, type: "highpass", f: 1800 });
  },
  pin() {
    noise({ dur: 0.12, gain: 0.08, type: "highpass", f: 2500, f1: 5000 });
    tone({ f: 900, t: 0.1, dur: 0.05, gain: 0.08 });
  },
  door() {
    noise({ dur: 0.45, gain: 0.1, type: "bandpass", f: 300, f1: 1400, q: 1.5, attack: 0.05 });
    tone({ f: 70, type: "sawtooth", dur: 0.45, gain: 0.05, filter: { f: 200 } });
  },
  rattle() {
    for (let i = 0; i < 6; i++) noise({ t: i * 0.07, dur: 0.04, gain: 0.07, type: "highpass", f: 1600 });
  },
  clank() {
    noise({ dur: 0.35, gain: 0.25, type: "bandpass", f: 850, q: 9 });
    tone({ f: [240, 180], type: "triangle", dur: 0.6, gain: 0.12 });
    tone({ f: 611, type: "sine", dur: 0.5, gain: 0.05 });
  },
  zap() {
    tone({ f: [90, 60], type: "sawtooth", dur: 0.7, gain: 0.18, filter: { f: 2500 } });
    for (let i = 0; i < 8; i++) noise({ t: i * 0.06 + Math.random() * 0.03, dur: 0.05, gain: 0.2, type: "highpass", f: 2000 });
    tone({ f: [880, 440], type: "square", t: 0.75, dur: 0.35, gain: 0.06, filter: { f: 1500 } }); // the alarm
    tone({ f: [880, 440], type: "square", t: 1.15, dur: 0.35, gain: 0.06, filter: { f: 1500 } });
  },
  progress() {
    tone({ f: 659, dur: 0.18, gain: 0.08, type: "triangle" });
    tone({ f: 988, t: 0.1, dur: 0.3, gain: 0.07, type: "triangle" });
  },
  clear() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.09, dur: 0.5, gain: 0.12, type: "triangle" }));
    tone({ f: 2093, t: 0.36, dur: 1.2, gain: 0.05 }); // a bell on top
    tone({ f: [110, 55], t: 0.36, dur: 0.3, gain: 0.3 }); // the seal landing
  },
  clockin() {
    noise({ dur: 0.03, gain: 0.25, type: "highpass", f: 3000 }); // the punch clock
    tone({ f: 1760, t: 0.05, dur: 0.6, gain: 0.08 });
  },
  clockout() {
    noise({ dur: 0.03, gain: 0.25, type: "highpass", f: 3000 });
    tone({ f: 1175, t: 0.05, dur: 0.6, gain: 0.08 });
  },
  alert() {
    [784, 1047, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.12, dur: 0.11, gain: 0.08, type: "square", filter: { f: 2500 } }));
  },
  tick() { tone({ f: 1250, dur: 0.035, gain: 0.07, type: "square", filter: { f: 2600 } }); },
  chime() { // the building's own schedule (room 6-2's :00)
    tone({ f: 784, dur: 0.6, gain: 0.08 });
    tone({ f: 587, t: 0.3, dur: 0.9, gain: 0.08 });
  },
  phase() { tone({ f: [900, 180], type: "sine", dur: 0.4, gain: 0.12 }); },
  /** The overseer talks: a few dry blips, one per few characters. */
  voice(text = "") {
    const n = Math.max(3, Math.min(9, Math.round(String(text).length / 6)));
    for (let i = 0; i < n; i++) {
      tone({ f: 330 + Math.random() * 220, type: "square", t: i * 0.075, dur: 0.055, gain: 0.035, filter: { f: 1400 } });
    }
  },
};

/** Plays a named effect. Unknown names and calls before unlock() do nothing. */
export function play(name, arg) {
  if (!ctx || muted || ctx.state !== "running") return;
  try { FX[name]?.(arg); } catch { /* never let a sound break the game */ }
}

// ---------- ambience ----------

let amb = null;
function buildAmbience() {
  // office: mains hum, a fluorescent tube's buzz, air conditioning
  const office = ctx.createGain(); office.gain.value = 0; office.connect(buses.amb);
  const hum = ctx.createOscillator(); hum.frequency.value = 60;
  const humG = ctx.createGain(); humG.gain.value = 0.05; hum.connect(humG).connect(office);
  const hum2 = ctx.createOscillator(); hum2.frequency.value = 120;
  const hum2G = ctx.createGain(); hum2G.gain.value = 0.015; hum2.connect(hum2G).connect(office);
  const tube = ctx.createOscillator(); tube.type = "sawtooth"; tube.frequency.value = 120;
  const tubeF = ctx.createBiquadFilter(); tubeF.type = "bandpass"; tubeF.frequency.value = 3200; tubeF.Q.value = 6;
  const tubeG = ctx.createGain(); tubeG.gain.value = 0.006; tube.connect(tubeF).connect(tubeG).connect(office);
  const air = ctx.createBufferSource(); air.buffer = noiseBuf; air.loop = true;
  const airF = ctx.createBiquadFilter(); airF.type = "lowpass"; airF.frequency.value = 700;
  const airG = ctx.createGain(); airG.gain.value = 0.05; air.connect(airF).connect(airG).connect(office);

  // field: a machine drone that breathes, ventilation rumble
  const field = ctx.createGain(); field.gain.value = 0; field.connect(buses.amb);
  const rumble = ctx.createBufferSource(); rumble.buffer = noiseBuf; rumble.loop = true; rumble.playbackRate.value = 0.5;
  const rumbleF = ctx.createBiquadFilter(); rumbleF.type = "lowpass"; rumbleF.frequency.value = 220;
  const rumbleG = ctx.createGain(); rumbleG.gain.value = 0.22; rumble.connect(rumbleF).connect(rumbleG).connect(field);
  const droneF = ctx.createBiquadFilter(); droneF.type = "lowpass"; droneF.frequency.value = 160; droneF.Q.value = 4;
  const droneG = ctx.createGain(); droneG.gain.value = 0.05; droneF.connect(droneG).connect(field);
  const drones = [55, 55.6, 82.4].map((f) => { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(droneF); return o; });
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = ctx.createGain(); lfoG.gain.value = 70; lfo.connect(lfoG).connect(droneF.frequency);

  for (const o of [hum, hum2, tube, ...drones, lfo]) o.start();
  for (const s of [air, rumble]) s.start(0, Math.random());
  amb = { office, field };
  sometimes();
}

let scene = "office";
/** "office" (the console), "field" (working), "cctv" (watching the full CCTV), or "quiet". */
export function setScene(next, force = false) {
  if (next === scene && !force) return;
  scene = next;
  if (!ctx || !amb) return;
  const t = now();
  const level = { office: [1, 0], field: [0, 1], cctv: [0.35, 0.45], quiet: [0, 0] }[scene] ?? [0, 0];
  amb.office.gain.setTargetAtTime(level[0], t, 0.6);
  amb.field.gain.setTargetAtTime(level[1], t, 0.6);
  music(scene === "office");
}

/** Now and then: a keyboard in the office, metal somewhere far off in the plant. */
function sometimes() {
  const wait = 1500 + Math.random() * 4500;
  setTimeout(() => {
    if (ctx && !muted && ctx.state === "running") {
      if (scene === "office" && Math.random() < 0.6) {
        const n = 3 + Math.floor(Math.random() * 8);
        for (let i = 0; i < n; i++) noise({ t: i * (0.07 + Math.random() * 0.08), dur: 0.02, gain: 0.025, type: "bandpass", f: 2400 + Math.random() * 1500, q: 3, out: buses.amb });
      } else if (scene === "field" || scene === "cctv") {
        const f = 400 + Math.random() * 900;
        noise({ dur: 0.5, gain: 0.05, type: "bandpass", f, q: 12, out: buses.amb });
        tone({ f: f / 2, type: "triangle", dur: 0.8, gain: 0.02, out: buses.amb });
      }
    }
    sometimes();
  }, wait);
}

// ---------- music: the lobby tune on the console ----------

// A slow minor progression (Am9 - Fmaj7 - Dm9 - E7sus4), soft pads and a few bell notes.
const CHORDS = [
  [220, 261.6, 329.6, 392, 493.9],
  [174.6, 220, 261.6, 329.6, 392],
  [146.8, 220, 261.6, 349.2, 440],
  [164.8, 220, 246.9, 293.7, 392],
];
const BAR = 4.8; // seconds per chord
let musicOn = false, musicTimer = null, bar = 0;

function music(on) {
  if (on === musicOn) return;
  musicOn = on;
  clearTimeout(musicTimer);
  if (on) playBar();
}

function playBar() {
  if (!musicOn || !ctx) return;
  if (!muted && ctx.state === "running") {
    const chord = CHORDS[bar % CHORDS.length];
    // the pad: each note a soft, slow-swelling sine pair
    chord.forEach((f, i) => {
      for (const d of [0, 0.7]) tone({ f: f + d, type: "sine", t: i * 0.03, dur: BAR + 0.6, gain: 0.025, attack: 1.4, out: buses.music });
    });
    tone({ f: chord[0] / 2, type: "triangle", dur: BAR, gain: 0.05, attack: 0.5, out: buses.music }); // bass
    // a few bell notes from the chord, an octave up, on a slow grid
    for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.45) continue;
      const f = chord[1 + Math.floor(Math.random() * (chord.length - 1))] * 2;
      tone({ f, type: "sine", t: 0.6 + k * 1.2, dur: 1.4, gain: 0.03, out: buses.music });
      tone({ f: f * 2.01, type: "sine", t: 0.6 + k * 1.2, dur: 0.5, gain: 0.008, out: buses.music });
    }
  }
  bar++;
  musicTimer = setTimeout(playBar, BAR * 1000);
}
