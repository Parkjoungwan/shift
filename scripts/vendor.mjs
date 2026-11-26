// Copies the parts of three.js the browser needs into public/vendor, so the game
// runs as plain ES modules with no bundler (and works as a static itch.io upload).
// Usage: npm run vendor

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const three = join(root, "node_modules", "three");
const out = join(root, "public", "vendor");

const files = [
  ["build/three.module.min.js", "three.module.min.js"],
  ["LICENSE", "three.LICENSE.txt"],
  ...[
    "loaders/GLTFLoader.js",
    "utils/BufferGeometryUtils.js",
    "utils/SkeletonUtils.js",
  ].map((f) => [join("examples/jsm", f), join("addons", f)]),
];

rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(three, from), dest);
}
console.log(`copied ${files.length} files to public/vendor`);
