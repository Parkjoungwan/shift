// 2.5D renderer: the game still runs on the flat 2D plane of the current lab,
// this draws that plane as a 3D sci-fi lab.
// Two cameras, blended when the role changes:
//   cctv:  straight on, framed so the z = 0 plane maps exactly onto the 640 x 352 stage
//          (the whole room; it is the CCTV window of the control console).
//   field: close behind the worker at a low angle with a wide lens (the blue-collar view).
// Darkness, glyphs, notes and labels are drawn by the client into a 2D overlay canvas in
// world pixels, which is shown on a plane at z = 0, so they line up under either camera.
//
// The room (walls, doors, devices) is rebuilt whenever the lab changes; each lab adds its
// own devices through build3d(kit). The worker, its echo and the overseer drone stay.
//
// Art direction (reports/인디 게임 그래픽 아트 디렉션.md): the field is a painted factory floor,
// not a neon dashboard. Every lit surface uses one toon material (three light bands), there is
// no tone mapping, and one post pass draws depth outlines and snaps every pixel to FIELD_PALETTE
// with a faint ordered dither. The overlay (darkness, notes, pins) is drawn after that pass, so
// the workers' hand-drawn notes keep their own ink colours.
// Cost: one extra full-screen pass at 320 x 176, no second scene render (outlines use depth only).
// Set dressing (MegaKit wall panels, lamps, rails, consoles) is queued while a room is built
// and then merged into one mesh per material, so a whole room costs a handful of draw calls
// however many pieces it has. Models carry base-colour maps only (see scripts/models.py).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { T, COLS, ROWS, W, H, TILE, EQUIP, litBy, PHASE_OF, PHASE_COLOR, phaseSolid } from "./engine.js";

/**
 * The field's colours. A hue-shifted ramp from cool shadow to warm concrete, then the few
 * accents the game needs to say something: safety yellow (things you can use), signal red and
 * green (doors and states), and each equipment's colour, which is how you tell who is working.
 */
export const FIELD_PALETTE = [
  // ramp: cool dark to warm light
  "#0b0c0f", "#16181c", "#22252a", "#30322f", "#43423c", "#5c5850", "#7a7468", "#9d9584", "#c2b8a3", "#e6dcc6",
  // accents
  "#e8b830", // safety yellow: interactive
  "#c8402e", // signal red
  "#4fae5a", // signal green
  "#f4ecd8", // lamp white
  ...Object.values(EQUIP).map((e) => e.color),
];

// Three light bands for every toon material (NearestFilter so the bands stay hard).
const toonGradient = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
})();
/** The one lit material type in the field. */
const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonGradient, ...params });
/**
 * Swaps a loaded model's materials for toon ones, keeping colour, texture and glow.
 * tint: multiplies the colour, e.g. to mute decor so it never wears the "interactive" yellow.
 */
function toonify(root, tint = null) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => toon({ color: tint ? m.color.clone().multiply(tint) : m.color, map: m.map ?? null, emissive: m.emissive ?? 0x000000, emissiveMap: m.emissiveMap ?? null, transparent: m.transparent, opacity: m.opacity, side: m.side });
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

// Outline + palette + dither, in one full-screen pass. Reads the scene's colour (linear) and
// depth, writes sRGB to the screen.
const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float cameraNear, cameraFar;
  uniform vec3 palette[${FIELD_PALETTE.length}];
  uniform float dither;      // dither amplitude, in sRGB units
  uniform vec2 ditherShift;  // camera offset in render pixels, so the pattern sticks to the world
  uniform float outline;     // 0 = off, 1 = on
  varying vec2 vUv;
  float linearDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)), i = x + y * 4;
    float m[16];
    m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
    m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
    for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.47;
    return 0.0;
  }
  void main() {
    vec3 c = toSRGB(texture2D(tColor, vUv).rgb);
    if (outline > 0.5) {
      // a pixel in front of a neighbour by enough is on an object's silhouette: darken it
      float d0 = linearDepth(vUv);
      float limit = max(0.3, d0 * 0.015);
      float gap = 0.0;
      gap = max(gap, linearDepth(vUv + vec2(texel.x, 0.0)) - d0);
      gap = max(gap, linearDepth(vUv - vec2(texel.x, 0.0)) - d0);
      gap = max(gap, linearDepth(vUv + vec2(0.0, texel.y)) - d0);
      gap = max(gap, linearDepth(vUv - vec2(0.0, texel.y)) - d0);
      if (gap > limit) c *= 0.45;
    }
    c += dither * bayer4(gl_FragCoord.xy + ditherShift);
    // nearest palette colour (weighted RGB, close enough to perceptual at this many colours)
    vec3 best = palette[0]; float bestD = 1e9;
    for (int i = 0; i < ${FIELD_PALETTE.length}; i++) {
      vec3 d = (c - palette[i]) * vec3(0.55, 0.75, 0.40);
      float e = dot(d, d);
      if (e < bestD) { bestD = e; best = palette[i]; }
    }
    gl_FragColor = vec4(best, 1.0);
  }`;

const DEPTH = 2; // thickness of walls and floors, centred on the play plane
const FOV = 24;
const MAX_PIXEL_RATIO = 1.25;
// Pixel rendering: draw at 1/PIXEL of the 640 x 352 layout and scale up without smoothing.
// Default 2; ?pixel=0 gives the smooth full-resolution view, ?pixel=3 a chunkier one.
const pixelParam = new URLSearchParams(location.search).get("pixel");
export const PIXEL = pixelParam === null ? 2 : Math.max(0, Math.min(6, Math.round(Number(pixelParam) || 0)));

/** World pixels (y down) to scene units (y up). */
const ux = (px) => px / T;
const uy = (py) => ROWS - py / T;

function canvasTexture(w, h, paint, repeatX = 1, repeatY = 1) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// back wall: large, low-contrast panels (one panel per 4 x 4 tiles)
const panelTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = "#2a2926"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#1c1c1b"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  g.fillStyle = "#33322e"; g.fillRect(10, h / 2 - 3, w - 20, 6);
}, COLS / 4, ROWS / 4);

const hazardTex = () => canvasTexture(64, 16, (g, w, h) => {
  g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#d8a21c";
  for (let x = -h; x < w + h; x += 16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, h); g.fill(); }
});

// 5 x 7 bitmap glyphs for signs. Drawn 2 texels per font pixel, so strokes survive
// low-resolution (pixel) rendering instead of breaking up like a smooth font does.
const FONT = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  L: [16, 16, 16, 16, 16, 16, 31],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  E: [31, 16, 16, 30, 16, 16, 31],
  X: [17, 17, 10, 4, 10, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
};
const SIGN_TEXELS = 16; // texels per scene unit

/** A stencilled sign plate, w x h scene units, with crisp (nearest) sampling: dark paint on concrete. */
function pixelSignTex(text, w, h) {
  const tw = w * SIGN_TEXELS, th = h * SIGN_TEXELS, S = 2;
  const tex = canvasTexture(tw, th, (g) => {
    g.fillStyle = "#c2b8a3"; g.fillRect(0, 0, tw, th);
    g.fillStyle = "#16181c";
    g.fillRect(0, 0, tw, 2); g.fillRect(0, th - 2, tw, 2); g.fillRect(0, 0, 2, th); g.fillRect(tw - 2, 0, 2, th);
    const cw = 6 * S, textW = text.length * cw - S;
    const x0 = Math.round((tw - textW) / 2), y0 = Math.round((th - 7 * S) / 2);
    [...text].forEach((ch, i) => {
      (FONT[ch] ?? FONT[" "]).forEach((row, y) => {
        for (let x = 0; x < 5; x++) if (row & (16 >> x)) g.fillRect(x0 + i * cw + x * S, y0 + y * S, S, S);
      });
    });
    // four rivets
    g.fillStyle = "#5c5850";
    for (const [x, y] of [[5, 5], [tw - 7, 5], [5, th - 7], [tw - 7, th - 7]]) g.fillRect(x, y, 2, 2);
  });
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** A boxy maintenance robot. ghost: a see-through green copy for the echo. */
function makeRobot({ ghost = false } = {}) {
  // About 1.3 units tall, to sit inside the 0.625 x 1.375 unit collision box.
  const group = new THREE.Group();
  const see = ghost ? { transparent: true, opacity: 0.42, depthWrite: false } : {};
  // painted like plant equipment: off-white shell, near-black joints, the equipment colour as its lamp
  const shell = ghost ? new THREE.MeshBasicMaterial({ color: "#46c98a", ...see }) : toon({ color: "#d8cfbb" });
  const dark = ghost ? new THREE.MeshBasicMaterial({ color: "#1d6a48", ...see }) : toon({ color: "#2b2b29" });
  const accent = new THREE.MeshBasicMaterial({ color: ghost ? "#b8ffd8" : "#ffffff", ...see });
  const box = (w, h, d, mat, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return mesh;
  };
  /** A limb hanging from a pivot, so it can swing around its top end. */
  const limb = (w, h, d, mat, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(box(w, h, d, mat, 0, -h / 2, 0));
    return pivot;
  };

  const rig = new THREE.Group(); // turns to face the way it walks
  const legL = limb(0.15, 0.32, 0.17, dark, 0, 0.32, -0.11);
  const legR = limb(0.15, 0.32, 0.17, dark, 0, 0.32, 0.11);
  const torso = box(0.36, 0.46, 0.5, shell, 0, 0.55, 0);
  const chest = box(0.03, 0.09, 0.3, accent, 0.18, 0.62, 0); // status light on the front
  const pack = box(0.14, 0.34, 0.36, dark, -0.24, 0.58, 0); // equipment pack on the back
  const armL = limb(0.12, 0.36, 0.12, shell, 0, 0.76, -0.32);
  const armR = limb(0.12, 0.36, 0.12, shell, 0, 0.76, 0.32);
  const head = box(0.4, 0.3, 0.42, shell, 0.02, 0.98, 0);
  const visor = box(0.04, 0.1, 0.32, accent, 0.23, 1.0, 0);
  const antenna = box(0.08, 0.14, 0.08, dark, -0.1, 1.2, 0.12);
  rig.add(legL, legR, torso, chest, pack, armL, armR, head, visor, antenna);
  group.add(rig);
  return { group, rig, legL, legR, armL, armR, accent, ghost, lastX: null, lastY: null, walk: 0, squash: 1 };
}

/** Moves and animates a robot to follow an actor ({x, y, face, character}) or hides it. */
function poseRobot(robot, actor, dt) {
  robot.group.visible = !!actor;
  if (!actor) { robot.lastX = robot.lastY = null; return; }
  if (!robot.ghost) {
    const color = EQUIP[actor.character]?.color ?? "#ffffff";
    robot.accent.color.set(color);
  }
  const x = ux(actor.x), y = uy(actor.y);
  const vx = robot.lastX === null ? 0 : (x - robot.lastX) / Math.max(dt, 1e-3);
  const vy = robot.lastY === null ? 0 : (y - robot.lastY) / Math.max(dt, 1e-3);
  robot.lastX = x; robot.lastY = y;
  robot.group.position.set(x, y, robot.ghost ? -0.05 : 0);
  // The model's front is +x. Turn toward the walking direction, three-quarters to the camera,
  // always through the camera-facing angle, never the back.
  const target = (actor.face ?? 1) > 0 ? -0.6 : -Math.PI + 0.6;
  robot.rig.rotation.y += (target - robot.rig.rotation.y) * Math.min(1, dt * 12);
  const moving = Math.abs(vx) > 0.5 && Math.abs(vy) < 0.5;
  const airborne = Math.abs(vy) >= 0.5 && Math.abs(vy) < 30; // a lift ride is not a jump
  robot.walk = moving ? robot.walk + dt * 12 : robot.walk * 0.8;
  const swing = moving ? Math.sin(robot.walk) * 0.7 : 0;
  robot.legL.rotation.z = swing;
  robot.legR.rotation.z = -swing;
  robot.armL.rotation.z = -swing * 0.8 + (airborne ? 0.9 : 0);
  robot.armR.rotation.z = swing * 0.8 + (airborne ? 0.9 : 0);
  const stretch = THREE.MathUtils.clamp(1 + (airborne ? vy : 0) * 0.025, 0.85, 1.18);
  robot.squash += (stretch - robot.squash) * Math.min(1, dt * 10);
  robot.rig.scale.set(1 / Math.sqrt(robot.squash), robot.squash, 1 / Math.sqrt(robot.squash));
  robot.rig.position.y = moving ? Math.abs(Math.cos(robot.walk)) * 0.04 : 0;
}

export function create(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping smears the toon bands; the palette sets the look
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // The scene is drawn into this target (colour + depth), then the post pass draws it to the screen.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(1, 1),
  });
  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2() }, cameraNear: { value: 1 }, cameraFar: { value: 200 },
      // the palette in sRGB, as written (not through THREE.Color, which converts to linear)
      palette: { value: FIELD_PALETTE.map((hex) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255))) },
      dither: { value: 0.035 }, ditherShift: { value: new THREE.Vector2() }, outline: { value: 1 },
    },
  });
  const postScene = new THREE.Scene(), postCamera = new THREE.Camera();
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);

  // Render at the size the canvas is actually shown, not more.
  const bufferSize = new THREE.Vector2();
  function fit() {
    if (PIXEL) {
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(W / PIXEL), Math.round(H / PIXEL), false);
      canvas.style.imageRendering = "pixelated";
    } else {
      const w = canvas.clientWidth || W, h = Math.round(w * (H / W));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(w, h, false);
    }
    renderer.getDrawingBufferSize(bufferSize);
    target.setSize(bufferSize.x, bufferSize.y);
    post.uniforms.texel.value.set(1 / bufferSize.x, 1 / bufferSize.y);
  }
  fit();
  new ResizeObserver(fit).observe(canvas);

  const BACKGROUND = "#0b0c0f";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  // Fog only in the field: it pushes the far wall back and gives the close view depth layers.
  const fog = new THREE.Fog(BACKGROUND, 1000, 2000);
  scene.fog = fog;

  // Straight-on perspective: z = 0 fills the frame exactly, walls show their inner sides.
  const camera = new THREE.PerspectiveCamera(FOV, COLS / ROWS, 1, 200);
  const dist = ROWS / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  // Light structure: a dim, cool fill so shadows stay readable, and one strong warm key from
  // above and in front, so tops and fronts separate into clear toon bands.
  const hemi = new THREE.HemisphereLight("#8f97a8", "#2a2620", 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff1d6", 2.4);
  key.position.set(-10, 30, 9); // mostly from above: floors and tops catch the light, fronts fall a band darker
  scene.add(key);

  // A cleared room (client.js celebrate): the lights pulse green and the camera takes a knock.
  const LIGHTS = { hemi: hemi.color.clone(), key: key.color.clone(), green: new THREE.Color("#5bff8a"), keyGreen: new THREE.Color("#b8ffcc") };
  let cheer = null;
  function celebrate(ms = 1800) { cheer = { start: performance.now(), ms }; }
  function applyCheer() {
    if (!cheer) return;
    const t = (performance.now() - cheer.start) / cheer.ms;
    if (t >= 1) { cheer = null; hemi.color.copy(LIGHTS.hemi); key.color.copy(LIGHTS.key); hemi.intensity = 0.9; return; }
    const pulse = (1 - t) * (0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 4))); // three green pulses, fading
    hemi.color.copy(LIGHTS.hemi).lerp(LIGHTS.green, pulse);
    key.color.copy(LIGHTS.key).lerp(LIGHTS.keyGreen, pulse * 0.7);
    hemi.intensity = 0.9 + pulse * 0.9;
    const knock = Math.max(0, 1 - t * 5) * 0.14; // a short shake at the start only
    camera.position.x += (Math.random() - 0.5) * knock;
    camera.position.y += (Math.random() - 0.5) * knock;
  }

  // ---------- the 2D overlay, shown on the play plane after the post pass ----------
  let overlayTex = null;
  const overlayMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const overlayPlane = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), overlayMat);
  overlayPlane.position.set(COLS / 2, ROWS / 2, 0);
  overlayPlane.visible = false;
  const overlayScene = new THREE.Scene();
  overlayScene.add(overlayPlane);
  function setOverlay(canvas2d) {
    if (!canvas2d) { overlayPlane.visible = false; return; }
    if (!overlayTex || overlayTex.image !== canvas2d) {
      overlayTex?.dispose();
      overlayTex = new THREE.CanvasTexture(canvas2d);
      overlayTex.colorSpace = THREE.SRGBColorSpace;
      overlayTex.minFilter = THREE.LinearFilter;
      overlayTex.generateMipmaps = false;
      overlayMat.map = overlayTex;
      overlayMat.needsUpdate = true;
    }
    overlayTex.needsUpdate = true;
    overlayPlane.visible = true;
  }

  // ---------- cameras ----------
  const FIELD = { fov: 46, dist: 8.5, yaw: 0.5, pitch: 0.16, ahead: 2.2, lift: 1.4 };
  const cam = { blend: 0, yaw: FIELD.yaw, ahead: FIELD.ahead, x: COLS / 2, y: ROWS / 2, lift: FIELD.lift, pitch: FIELD.pitch };
  const fieldPos = new THREE.Vector3(), fieldLook = new THREE.Vector3();
  const cctvPos = new THREE.Vector3(), cctvLook = new THREE.Vector3(), look = new THREE.Vector3();
  function placeCamera(mode, actor, v, dt, lab = null) {
    const target = mode === "field" && actor ? 1 : 0;
    const k = Math.min(1, dt * 2.5);
    cam.blend += (target - cam.blend) * k;
    if (Math.abs(target - cam.blend) < 0.002) cam.blend = target;

    // cctv: straight on, matching the 2D view {x, y, zoom}
    let cx = ux(v.x), cy = uy(v.y);
    if (PIXEL && cam.blend === 0) {
      // snap the camera to whole render pixels so walls do not shimmer while it follows
      const upp = COLS / v.zoom / (W / PIXEL);
      cam.texelX = Math.round(cx / upp);
      cam.texelY = Math.round(cy / upp);
      cx = cam.texelX * upp;
      cy = cam.texelY * upp;
    } else cam.texelX = cam.texelY = 0;
    cctvPos.set(cx, cy, dist / v.zoom);
    cctvLook.set(cx, cy, 0);

    // field: behind the worker's shoulder, looking where they are going
    if (actor) {
      const face = actor.face ?? 1;
      const kk = Math.min(1, dt * 2);
      cam.yaw += (FIELD.yaw * face - cam.yaw) * kk;
      cam.ahead += (FIELD.ahead * face - cam.ahead) * kk;
      cam.x += (ux(actor.x) - cam.x) * Math.min(1, dt * 8);
      cam.y += (uy(actor.y) - cam.y) * Math.min(1, dt * 5);
      // a lab may ask the field camera to look further down for a moment (lab 6: the light on its
      // bridge reads the grates three tiles below)
      const want = lab?.fieldView?.(actor) ?? null;
      cam.lift += ((want?.lift ?? FIELD.lift) - cam.lift) * kk;
      cam.pitch += ((want?.pitch ?? FIELD.pitch) - cam.pitch) * kk;
    }
    fieldLook.set(cam.x + cam.ahead, cam.y + cam.lift, 0);
    fieldPos.set(
      fieldLook.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * FIELD.dist,
      fieldLook.y + Math.sin(cam.pitch) * FIELD.dist,
      Math.cos(cam.yaw) * Math.cos(cam.pitch) * FIELD.dist,
    );

    const b = cam.blend * cam.blend * (3 - 2 * cam.blend); // ease in and out
    camera.position.lerpVectors(cctvPos, fieldPos, b);
    look.lerpVectors(cctvLook, fieldLook, b);
    camera.lookAt(look);
    const fov = FOV + (FIELD.fov - FOV) * b;
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  // back wall: a plain backdrop, set behind the MegaKit panels that cover the open parts of a room
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, ROWS),
    toon({ map: panelTex() }),
  );
  wall.position.set(COLS / 2, ROWS / 2, -DEPTH / 2 - 0.6);
  wall.matrixAutoUpdate = false;
  wall.updateMatrix();
  scene.add(wall);

  // ---------- CC0 models (Kenney Space Station Kit, Quaternius eye drone and MegaKit) ----------
  // They load in the background; the room is playable before they arrive.
  THREE.Cache.enabled = true; // models share texture files: fetch each once
  const loader = new GLTFLoader();
  const modelBase = new URL("./models/", import.meta.url).href;
  const cache = new Map();
  const load = (path) => {
    if (!cache.has(path)) cache.set(path, loader.loadAsync(modelBase + path));
    return cache.get(path);
  };

  // Solid tiles: the MegaKit wall panel, mapped by world position (4 x 2 tiles per repeat)
  // so neighbouring blocks read as one continuous surface with no extra geometry.
  const blockTex = new THREE.TextureLoader().load(modelBase + "megakit/tex/panel.jpg");
  blockTex.colorSpace = THREE.SRGBColorSpace;
  blockTex.wrapS = blockTex.wrapT = THREE.RepeatWrapping;
  // the rock the rooms are cut into: a dark cross-section, so the lighter rooms read first
  const steel = toon({ color: "#4a4842", map: blockTex });
  steel.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
      {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 an = abs(normal);
        vMapUv = (an.z > 0.5 ? wp.xy : an.x > 0.5 ? wp.zy : wp.xz) * vec2(0.25, 0.5);
      }`);
  };
  steel.customProgramCacheKey = () => "steel-world-uv-toon";

  // MegaKit materials, shared by every room: one per texture and kind, so pieces merge.
  const KIT_TINT = new THREE.Color("#a29a8a"); // the grey trim sheets, warmed toward the concrete ramp
  const kitMats = new Map();
  function kitMaterial(src) {
    const name = src.name ?? "";
    const kind = /Light/.test(name) ? "light" : /Glass/.test(name) ? "glass" : /Black/.test(name) ? "black" : /Screen/.test(name) ? "screen" : "trim";
    const textured = kind === "trim" || kind === "screen";
    const key = textured ? kind + "|" + (src.map?.name ?? "") + "|" + (src.map ? "" : src.color?.getHexString()) : kind;
    if (kitMats.has(key)) return kitMats.get(key);
    let mat;
    if (kind === "light") mat = new THREE.MeshBasicMaterial({ color: "#f4ecd8" });
    else if (kind === "glass") mat = new THREE.MeshBasicMaterial({ color: "#0e1c27" });
    else if (kind === "black") mat = new THREE.MeshBasicMaterial({ color: "#07090c" });
    else if (kind === "screen") mat = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: "#7fb8d8" });
    else mat = toon({ map: src.map ?? null, color: (src.color ?? new THREE.Color(1, 1, 1)).clone().multiply(KIT_TINT) });
    kitMats.set(key, mat);
    return mat;
  }

  /** A geometry with only float position, normal and uv, indexed: the shape mergeGeometries wants. */
  function plainGeometry(src) {
    const g = new THREE.BufferGeometry();
    const n = src.getAttribute("position").count;
    for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]]) {
      const a = src.getAttribute(name);
      const out = new Float32Array(n * size);
      if (a) for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(out, size));
    }
    const index = src.index ? Array.from(src.index.array) : [...Array(n).keys()];
    g.setIndex(index);
    return g;
  }

  /**
   * Set dressing for one room. add(name, spec) queues a MegaKit piece; finish() loads them all
   * and merges them into one mesh per material, then warms up the shaders.
   * spec: { x, y, z, rx, ry, s, sx, sy, sz, ax, ay, az, skip } where ax/ay/az pick which side of
   * the placed piece's bounding box lands on x/y/z: "min", "max" or "mid" (default x mid,
   * y min, z mid), and skip names nodes to leave out.
   */
  function makeDeco() {
    const items = [];
    const rot = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    return {
      add(name, spec) { items.push({ name, spec }); },
      async finish(target) {
        const names = [...new Set(items.map((i) => i.name))];        const loaded = new Map();
        await Promise.all(names.map(async (name) => {
          try { loaded.set(name, await load(`megakit/${name}.gltf`)); }
          catch (err) { console.warn("model failed", name, err); }
        }));
        if (room !== target) return; // the lab changed while loading
        const buckets = new Map();
        const local = new THREE.Matrix4(), place = new THREE.Matrix4(), box = new THREE.Box3(), tmp = new THREE.Box3();
        for (const { name, spec } of items) {
          const gltf = loaded.get(name);
          if (!gltf) continue;
          const root = gltf.scene;
          root.updateMatrixWorld(true);
          const meshes = [];
          root.traverse((o) => { if (o.isMesh && !(spec.skip ?? []).includes(o.name) && !(spec.skip ?? []).includes(o.parent?.name)) meshes.push(o); });
          // rotate and scale, then move so the chosen side of the bounding box lands on the target
          rot.set(spec.rx ?? 0, spec.ry ?? 0, spec.rz ?? 0);
          q.setFromEuler(rot);
          const s = spec.s ?? 1;
          place.compose(new THREE.Vector3(), q, one.clone().set((spec.sx ?? 1) * s, (spec.sy ?? 1) * s, (spec.sz ?? 1) * s));
          box.makeEmpty();
          for (const m of meshes) {
            m.geometry.computeBoundingBox();
            tmp.copy(m.geometry.boundingBox).applyMatrix4(local.multiplyMatrices(place, m.matrixWorld));
            box.union(tmp);
          }
          const pick = (axis, want, dflt) => {
            const side = spec["a" + axis] ?? dflt;
            const v = side === "min" ? box.min[axis] : side === "max" ? box.max[axis] : (box.min[axis] + box.max[axis]) / 2;
            return (want ?? 0) - v;
          };
          const shift = new THREE.Matrix4().makeTranslation(pick("x", spec.x, "mid"), pick("y", spec.y, "min"), pick("z", spec.z, "mid"));
          for (const m of meshes) {
            const g = plainGeometry(m.geometry);
            g.applyMatrix4(local.multiplyMatrices(shift, place).multiply(m.matrixWorld));
            const mat = kitMaterial(m.material);
            if (!buckets.has(mat)) buckets.set(mat, []);
            buckets.get(mat).push(g);
          }
        }
        for (const [mat, geos] of buckets) {
          const merged = mergeGeometries(geos, false);
          geos.forEach((g) => g.dispose());
          if (!merged) continue;
          const mesh = new THREE.Mesh(merged, mat);
          mesh.matrixAutoUpdate = false;
          mesh.userData.keepMaterial = true; // materials are shared by every room
          target.add(mesh);
        }
        // compile the new shaders now rather than stalling on the first frame that shows them
        renderer.compileAsync?.(scene, camera).catch(() => {});
      },
    };
  }

  // ---------- the room of the current lab ----------

  let room = null, roomLab = null, devices = null, doorRuns = [], bridgeMeshes = [], phaseMeshes = [], spinners = [];

  function buildRoom(lab) {
    if (room) {
      scene.remove(room);
      room.traverse((o) => {
        if (o.userData.shared) return; // loaded models share geometry with the loader cache
        o.geometry?.dispose?.();
        if (o.userData.keepMaterial) return; // shared by every room
        for (const m of [].concat(o.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); }
      });
    }
    room = new THREE.Group();
    scene.add(room);
    roomLab = lab;
    spinners = [];
    const add = (...objs) => room.add(...objs);
    const deco = makeDeco();

    const solids = [], tops = [], bridges = [], doors = [], phases = [];
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const v = lab.tileAt(tx, ty);
        if (v === TILE.SOLID || v === TILE.FAKE) { // a fake wall is drawn as rock (you walk through it)
          solids.push([tx, ty]);
          const above = lab.tileAt(tx, ty - 1);
          if (ty > 0 && above !== TILE.SOLID && above !== TILE.FAKE) tops.push([tx, ty]);
        } else if (v === TILE.BRIDGE) bridges.push([tx, ty]);
        else if (PHASE_OF[v]) phases.push([tx, ty, v]);
        else if (v === TILE.DOOR) doors.push([tx, ty]);
      }
    }
    // solid tiles: one instanced mesh, one material mapped by world position, so neighbours
    // read as one surface
    const block = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, DEPTH), steel, solids.length);
    block.userData.keepMaterial = true;
    const m = new THREE.Matrix4();
    solids.forEach(([tx, ty], i) => { m.makeTranslation(tx + 0.5, ROWS - ty - 0.5, 0); block.setMatrixAt(i, m); });
    add(block);

    // back wall panels, 4 x 3 tiles each, wherever the room is open in front of them
    const open = (tx, ty) => tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && lab.tileAt(tx, ty) !== TILE.SOLID;
    for (let top = ROWS - 3, row = 0; top > -3; top -= 3, row++) {
      for (let left = 0, col = 0; left < COLS; left += 4, col++) {
        let seen = false;
        for (let ty = top; ty < top + 3 && !seen; ty++) for (let tx = left; tx < left + 4 && !seen; tx++) seen = open(tx, ty);
        if (!seen) continue;
        // a calm wall: plain panels, a banded skirting row at the floor, a window now and then
        const name = row === 0 ? "WallBand_Straight" : (col * 3 + row * 2) % 7 === 3 ? "WallAstra_Straight_Flat_Window" : "WallAstra_Straight_Flat";
        deco.add(name, { x: left + 2, y: ROWS - top - 3, z: -DEPTH / 2, ry: -Math.PI / 2, az: "max" });
      }
    }

    // a thin glowing edge on every walkable top, at least one render pixel thick even on CCTV
    // painted step edges: pale concrete paint, not a glow (yellow is kept for things you can use)
    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: "#e6dcc6", fog: false }), tops.length);
    tops.forEach(([tx, ty], i) => { m.makeTranslation(tx + 0.5, ROWS - ty - 0.065, DEPTH / 2 - 0.06); trim.setMatrixAt(i, m); });
    add(trim);

    // light bridges: hard light, visible only while the light worker is near
    const bridgeMat = new THREE.MeshBasicMaterial({ color: EQUIP.light.color, fog: false }); // hard light from the light's lamp
    bridgeMeshes = bridges.map(([tx, ty]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.12, DEPTH * 0.8), bridgeMat);
      mesh.position.set(tx + 0.5, ROWS - ty - 0.06, 0);
      mesh.userData.tile = [tx, ty];
      add(mesh);
      return mesh;
    });

    // phase blocks (lab 5): solid crates in their colour; a faint outline for the phase shifter when not
    const phaseMats = {};
    for (const c of ["blue", "red"]) {
      phaseMats[c] = { solid: toon({ color: PHASE_COLOR[c] }), ghost: new THREE.MeshBasicMaterial({ color: PHASE_COLOR[c], wireframe: true, transparent: true, opacity: 0.45 }) };
    }
    phaseMeshes = phases.map(([tx, ty, v]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, DEPTH * 0.85), phaseMats[PHASE_OF[v]].solid);
      mesh.position.set(tx + 0.5, ROWS - ty - 0.5, 0);
      mesh.userData.tile = [tx, ty, v];
      mesh.userData.mats = phaseMats[PHASE_OF[v]];
      add(mesh);
      return mesh;
    });

    // blast doors: one slab per vertical run of door tiles, sliding up into the ceiling when open
    const runs = new Map();
    for (const [tx, ty] of doors) {
      const run = [...runs.values()].find((r) => r.tx === tx && r.bottom === ty - 1);
      if (run) run.bottom = ty;
      else runs.set(`${tx},${ty}`, { tx, top: ty, bottom: ty });
    }
    doorRuns = [...runs.values()].map(({ tx, top, bottom }) => {
      const h = bottom - top + 1;
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, h, DEPTH * 0.9), toon({ color: "#43423c" })));
      const glow = new THREE.MeshBasicMaterial({ color: "#ff3b3b" });
      for (let i = 1; i < h; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, DEPTH * 0.92), glow);
        s.position.y = -h / 2 + i;
        group.add(s);
      }
      const x = tx + 0.5, y = ROWS - top - h / 2;
      group.position.set(x, y, 0);
      add(group);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), new THREE.MeshBasicMaterial({ map: hazardTex() }));
      hz.position.set(x, ROWS - top + 0.25, -DEPTH / 2 + 0.01);
      add(hz);
      return { tx, ty: top, h, y, group, glow, open: 0 };
    });

    if (lab.sign) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ map: pixelSignTex(lab.sign.text, 6, 2) }));
      sign.position.set(lab.sign.x, lab.sign.y, -DEPTH / 2 + 0.02);
      add(sign);
    }

    try {
      devices = lab.build3d ? lab.build3d(makeKit(add, deco)) : null;
    } catch (err) {
      console.warn("lab 3D build failed", err);
      devices = null;
    }
    deco.finish(room).catch((err) => console.warn("set dressing failed", err));
    block.matrixAutoUpdate = trim.matrixAutoUpdate = false;
  }

  /** What a lab's build3d(kit) gets to build its devices with. */
  function makeKit(add, deco) {
    const BACK = -DEPTH / 2 + 0.04;
    const mat = (color) => toon({ color }); // the one lit material type (see FIELD_PALETTE)
    return {
      THREE, add, ux, uy, DEPTH, ROWS, COLS, mat, hazardTex,
      /**
       * A static MegaKit piece (merged with the rest of the room). Scene units; see makeDeco for spec.
       * Pieces: WallAstra_Straight_Flat, WallBand_Straight, WallAstra_Straight_Flat_Window,
       * ShortWall_AccentStrip_Straight, Prop_Light_Wide, Prop_Rail_2, Prop_Rail_4, Prop_Computer,
       * Prop_Vent_Small, Prop_Fan_Small, Column_Simple.
       */
      piece(name, spec) { deco.add(name, spec); },
      /** A vent grille on the back wall, centred at (x, y). */
      vent(x, y) { deco.add("Prop_Vent_Small", { x, y, z: -DEPTH / 2, rx: Math.PI / 2, ay: "mid", az: "min", s: 0.9 }); },
      /** A pillar against the back wall standing on y, scaled to `height`. */
      column(x, y, height = 5) { deco.add("Column_Simple", { x, y, z: -DEPTH / 2, sy: height / 5, az: "min" }); },
      /** A wall fan on the back wall, centred at (x, y), with a spinning propeller. */
      fan(x, y) {
        const z = -DEPTH / 2;
        deco.add("Prop_Fan_Small", { x, y, z, rx: Math.PI / 2, ay: "mid", az: "min", skip: ["Prop_Fan_Small_Propeller"] });
        const target = room;
        load("megakit/Prop_Fan_Small_Propeller.gltf").then((gltf) => {
          if (room !== target) return;
          const blades = new THREE.Group();
          gltf.scene.traverse((o) => {
            if (!o.isMesh) return;
            const mesh = new THREE.Mesh(o.geometry, kitMaterial(o.material));
            mesh.userData.shared = true;
            blades.add(mesh);
          });
          const holder = new THREE.Group(); // stands the fan up against the wall
          holder.rotation.x = Math.PI / 2;
          holder.position.set(x, y, z + 0.12);
          holder.add(blades);
          add(holder);
          spinners.push(blades);
        }).catch((err) => console.warn("model failed", err));
      },
      /** A Kenney model standing at (x, y) with its back against the wall. */
      async prop(name, x, y, { s = 1.6, ry = 0, z = null } = {}) {
        try {
          const gltf = await load(`kenney/${name}.glb`);
          // once per model (clones share it); Kenney props are decor, so mute them toward concrete
          if (!gltf.userData.toon) { toonify(gltf.scene, new THREE.Color("#8f8a80")); gltf.userData.toon = true; }
          const o = gltf.scene.clone(true);
          o.traverse((c) => { c.userData.shared = true; });
          o.scale.setScalar(s);
          o.rotation.y = ry;
          o.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(o);
          o.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y, z ?? BACK - box.min.z);
          add(o);
        } catch (err) {
          console.warn("model failed", name, err);
        }
      },
      /** A console (MegaKit computer) with a status strip on its front in the colour of its state. */
      terminal(x, y) {
        // the console is 1.59 tall with its front at z + 0.35; scaled to stand about as tall as the worker
        deco.add("Prop_Computer", { x, y, z: -0.3, s: 0.95, az: "max" });
        const screenMat = new THREE.MeshBasicMaterial({ color: "#e0b83a" });
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), screenMat);
        strip.position.set(x, y + 0.9, -0.29);
        add(strip);
        return { setColor: (c) => screenMat.color.set(c) };
      },
      lever(x, y) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), mat("#2b3240"));
        base.position.set(x, y + 0.12, -0.4);
        const pivot = new THREE.Group();
        pivot.position.set(x, y + 0.22, -0.4);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8), mat("#9aa3b2", { metalness: 0.7, roughness: 0.3 }));
        handle.position.y = 0.4;
        const knobMat = new THREE.MeshBasicMaterial({ color: "#ff4040" });
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), knobMat);
        knob.position.y = 0.82;
        pivot.add(handle, knob);
        add(base, pivot);
        let angle = -0.7;
        return {
          update(on, dt) {
            angle += ((on ? 0.7 : -0.7) - angle) * Math.min(1, dt * 6);
            pivot.rotation.z = angle;
            knobMat.color.set(on ? "#40ff80" : "#ff4040");
          },
        };
      },
      /**
       * Ceiling lamps: glow only, no light sources. [[x, y], ...] in scene units, y the lamp's top.
       * The MegaKit lamp is one half of a fitting, so each lamp is two halves back to back.
       */
      lamps(list) {
        // seen straight on, the fitting is edge-on: a glow strip under it keeps the light readable
        const glow = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), kitMaterial({ name: "M_Light" }), list.length);
        const m = new THREE.Matrix4();
        list.forEach(([x, y], i) => {
          deco.add("Prop_Light_Wide", { x, y: y + 0.07, z: 0, ax: "max", ay: "max", s: 0.65 });
          deco.add("Prop_Light_Wide", { x, y: y + 0.07, z: 0, ax: "min", ay: "max", s: 0.65, ry: Math.PI });
          glow.setMatrixAt(i, m.makeTranslation(x, y - 0.1, 0));
        });
        glow.userData.keepMaterial = true;
        add(glow);
      },
      /** Safety rails along ledges [[x0, x1, topRow], ...] (tile columns, the ledge's top row). */
      rails(list) {
        for (const [x0, x1, top] of list) {
          const len = x1 - x0 + 1;
          const name = len > 2.5 ? "Prop_Rail_4" : "Prop_Rail_2";
          // the rail runs along its z axis: turn it along x and stretch it to the ledge
          deco.add(name, { x: x0 + len / 2, y: uy(top * T), z: -0.75, ry: Math.PI / 2, sz: (len - 0.1) / (name === "Prop_Rail_4" ? 3.93 : 1.95), sy: 0.8 });
        }
      },
    };
  }

  // ---------- the overseer: an eye drone that hovers near the worker and watches ----------

  const overseer = { root: null, mixer: null, actions: {}, current: null, prev: null };
  load("overseer/drone.gltf").then((gltf) => {
    const root = gltf.scene;
    toonify(root);
    root.scale.setScalar(0.85);
    root.position.set(31.5, 12, -0.4);
    scene.add(root);
    overseer.root = root;
    overseer.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) overseer.actions[clip.name] = overseer.mixer.clipAction(clip);
    playOverseer("Idle");
    overseer.mixer.addEventListener("finished", () => playOverseer("Idle"));
  }).catch((err) => console.warn("overseer failed", err));

  function playOverseer(name, once = false) {
    const next = overseer.actions[name];
    if (!next || overseer.current === next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (overseer.current) overseer.current.crossFadeTo(next, 0.25, false);
    overseer.current = next;
  }

  const lookTarget = new THREE.Vector3();
  function updateOverseer(lab, world, actor, dt, time) {
    if (!overseer.root) return;
    overseer.mixer.update(dt);
    const prev = overseer.prev;
    if (prev && prev.lab === world.lab) {
      const anim = lab.mood?.(prev, world);
      if (anim) playOverseer(anim, true);
    }
    overseer.prev = { ...world }; // a copy: the worker's world is changed in place
    // hover a little behind and above the worker, inside the room
    const r = overseer.root;
    const tx = actor ? ux(actor.x) - (actor.face ?? 1) * 1.6 : 31.5;
    const ty = actor ? Math.min(ROWS - 2.5, uy(actor.y) + 2.8) : 12;
    const k = Math.min(1, dt * 1.5);
    r.position.x += (THREE.MathUtils.clamp(tx, 1.5, COLS - 1.5) - r.position.x) * k;
    r.position.y += (ty + Math.sin(time * 1.4) * 0.12 - r.position.y) * k;
    lookTarget.set(actor ? ux(actor.x) : camera.position.x, actor ? uy(actor.y) + 0.8 : camera.position.y, actor ? 0 : camera.position.z);
    r.lookAt(lookTarget);
  }

  const worker = makeRobot();
  // Always in the scene so the light count never changes (that would recompile shaders).
  const lamp = new THREE.PointLight("#c9a8ff", 0, 7, 1.6);
  lamp.position.set(0.35, 1.3, 1.5);
  worker.group.add(lamp);
  scene.add(worker.group);
  const echoRobot = makeRobot({ ghost: true });
  scene.add(echoRobot.group);

  /**
   * mode: "cctv" (straight on, following `view`) or "field" (close behind the actor).
   * overlay: a 2D canvas in world pixels (any multiple of 640 x 352) shown on the play plane.
   */
  function render({ lab, world, actor, echo = null, time = 0, dt = 1 / 60, now = Date.now(), view = null, mode = "cctv", overlay = null }) {
    if (lab !== roomLab) buildRoom(lab);
    placeCamera(mode, actor, view ?? { x: W / 2, y: H / 2, zoom: 1 }, Math.min(dt, 0.1), lab);
    applyCheer();
    setOverlay(overlay);

    // bridges exist only in the light
    for (const b of bridgeMeshes) b.visible = litBy(actor, b.userData.tile[0], b.userData.tile[1]);
    for (const b of phaseMeshes) {
      const on = phaseSolid(world, b.userData.tile[2]);
      b.material = on ? b.userData.mats.solid : b.userData.mats.ghost;
      b.visible = on || actor?.character === "phase";
    }

    for (const d of doorRuns) {
      const open = lab.doorOpen(world, d.tx, d.ty, now);
      d.open += ((open ? 1 : 0) - d.open) * Math.min(1, dt * 3);
      d.group.position.y = d.y + d.open * (d.h + 0.2);
      d.glow.color.set(open ? "#3bff7a" : "#ff3b3b");
    }

    for (const s of spinners) s.rotation.y += dt * 9;
    devices?.update(world, actor, dt, time, now, echo);
    poseRobot(worker, actor, dt);
    lamp.intensity = actor?.character === "light" ? 9 + Math.sin(time * 9) * 0.6 : 0;
    poseRobot(echoRobot, echo, dt);
    updateOverseer(lab, world, actor, dt, time);

    // fog only up close: the field view gets depth layers, the CCTV stays flat and clear
    fog.near = THREE.MathUtils.lerp(1000, 9, cam.blend);
    fog.far = THREE.MathUtils.lerp(2000, 30, cam.blend);

    // 1) the scene into the target, 2) outlines + palette to the screen, 3) the overlay on top
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    post.uniforms.cameraNear.value = camera.near;
    post.uniforms.cameraFar.value = camera.far;
    // the dither pattern follows the snapped CCTV camera so it sticks to the walls; in the moving
    // field view it stays faint, so it does not crawl
    post.uniforms.ditherShift.value.set(cam.texelX ?? 0, cam.texelY ?? 0);
    // At this pixel size a dither reads as checkered noise on flat faces, so it is off: the
    // palette posterizes into clean bands instead. (Kept in the shader for fog or light falloff.)
    post.uniforms.dither.value = 0;
    renderer.render(postScene, postCamera);
    if (overlayPlane.visible) {
      renderer.autoClear = false;
      renderer.render(overlayScene, camera);
      renderer.autoClear = true;
    }
  }

  /** Where the overseer drone is on the 640 x 352 screen, or null before it has loaded. */
  const projected = new THREE.Vector3();
  function overseerScreen() {
    if (!overseer.root) return null;
    projected.copy(overseer.root.position);
    projected.y += 0.55; // just above the drone
    projected.project(camera);
    if (projected.z > 1) return null;
    return { x: ((projected.x + 1) / 2) * W, y: ((1 - projected.y) / 2) * H };
  }

  /** A world point (px) on the 640 x 352 stage, or null behind the camera. */
  function project(x, y) {
    projected.set(ux(x), uy(y), 0).project(camera);
    if (projected.z > 1) return null;
    return { x: ((projected.x + 1) / 2) * W, y: ((1 - projected.y) / 2) * H };
  }

  /** The world point (px) on the play plane under a stage point, or null. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function unproject(sx, sy) {
    ndc.set((sx / W) * 2 - 1, 1 - (sy / H) * 2);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x * T, y: (ROWS - hit.y) * T };
  }

  return { render, renderer, pixel: PIXEL, overseerScreen, project, unproject, celebrate, inField: () => cam.blend > 0.5 };
}
