# Copies the CC0 models the game uses from assets-src/ (downloaded packs, not in git)
# into public/models/, shrinking textures for the web.
# Usage: python -I scripts/models.py
#
# Sources (all CC0 1.0):
#   Kenney Space Station Kit      https://kenney.nl/assets/space-station-kit
#   Quaternius Sci-Fi Essentials  https://quaternius.com/packs/scifiessentialskit.html
#   Quaternius Modular Sci-Fi MegaKit  https://quaternius.com/packs/modularscifimegakit.html
import json, os, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src")
OUT = os.path.join(ROOT, "public", "models")

KENNEY = os.path.join(SRC, "kenney-space-station", "x")
KENNEY_MODELS = ["computer-wide", "computer-system", "chair"]
DRONE = os.path.join(SRC, "quaternius-essentials", "x", "glTF")
DRONE_TEX_SIZE = 512

# Quaternius Modular Sci-Fi MegaKit: wall panels and fittings. Every piece maps onto a few
# shared trim sheets, so the renderer can merge a whole room into one mesh per material.
MEGAKIT = os.path.join(SRC, "quaternius-megakit", "x", "Modular SciFi MegaKit[Standard]")
MEGAKIT_MODELS = {
    "Walls": ["WallAstra_Straight_Flat", "WallBand_Straight", "WallAstra_Straight_Flat_Window", "ShortWall_AccentStrip_Straight"],
    "Props": ["Prop_Light_Wide", "Prop_Rail_2", "Prop_Rail_4", "Prop_Computer", "Prop_Vent_Small", "Prop_Fan_Small", "Prop_Fan_Small_Propeller"],
    "Columns": ["Column_Simple"],
}
MEGAKIT_TEX_SIZE = 512
# The pack's trim sheets come in a red-accented variant; the lab uses the plain grey one.
NEUTRAL = {"T_Trim_01_BaseColor_Red": "T_Trim_01_BaseColor", "T_Trim_02_BaseColor_Red": "T_Trim_02_BaseColor"}
# The renderer has no normal, roughness or occlusion maps: at 320 x 176 they cost more than they show.
DROP_MAPS = ("normalTexture", "occlusionTexture", "emissiveTexture")


def megakit(out):
    """Copies the chosen MegaKit pieces with base-colour textures only, shrunk for the web."""
    os.makedirs(os.path.join(out, "tex"))
    written = {}
    # the pack does not keep every texture beside every model: find each one anywhere in it
    pngs = {}
    for top in ("Textures", "glTF"):
      for dp, _, files in os.walk(os.path.join(MEGAKIT, top)):
        for fn in files:
            if fn.endswith(".png"):
                pngs.setdefault(fn[:-4], os.path.join(dp, fn))
    for folder, names in MEGAKIT_MODELS.items():
        src_dir = os.path.join(MEGAKIT, "glTF", folder)
        for name in names:
            with open(os.path.join(src_dir, name + ".gltf"), encoding="utf-8") as f:
                gltf = json.load(f)  # data only
            # keep base colour, drop every other map
            used = set()
            for mat in gltf.get("materials", []):
                for key in DROP_MAPS:
                    mat.pop(key, None)
                pbr = mat.get("pbrMetallicRoughness", {})
                pbr.pop("metallicRoughnessTexture", None)
                if "baseColorTexture" in pbr:
                    used.add(pbr["baseColorTexture"]["index"])
            # renumber the textures that are still used, and point them at shared files
            old_tex = gltf.get("textures", [])
            keep = sorted(used)
            remap = {old: new for new, old in enumerate(keep)}
            images, image_index, textures = [], {}, []
            for old in keep:
                t = dict(old_tex[old])
                img = gltf["images"][t["source"]]
                stem = os.path.splitext(os.path.basename(img["uri"]))[0]
                stem = NEUTRAL.get(stem, stem)
                if stem not in written:
                    written[stem] = shrink(pngs[stem], os.path.join(out, "tex"), stem)
                if stem not in image_index:
                    image_index[stem] = len(images)
                    images.append({"name": stem, "uri": "tex/" + written[stem], "mimeType": mime(written[stem])})
                t["source"] = image_index[stem]
                textures.append(t)
            for mat in gltf.get("materials", []):
                tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                if tex:
                    tex["index"] = remap[tex["index"]]
            gltf["textures"], gltf["images"] = textures, images
            if not textures:
                gltf.pop("textures"); gltf.pop("images"); gltf.pop("samplers", None)
            for buf in gltf.get("buffers", []):
                uri = os.path.basename(buf["uri"])
                shutil.copy(os.path.join(src_dir, uri), os.path.join(out, uri))
                buf["uri"] = uri
            with open(os.path.join(out, name + ".gltf"), "w", encoding="utf-8") as f:
                json.dump(gltf, f, separators=(",", ":"))

    # A tiling panel for the solid blocks, cut from the plain trim sheet's large wall panels.
    sheet = Image.open(pngs["T_Trim_02_BaseColor"]).convert("RGB")
    w, h = sheet.size
    panel = sheet.crop((0, int(h * 0.235), w, int(h * 0.592))).resize((512, 256), Image.LANCZOS)
    panel.save(os.path.join(out, "tex", "panel.jpg"), quality=85, optimize=True)
    shutil.copy(os.path.join(MEGAKIT, "License_Standard.txt"), os.path.join(out, "LICENSE.txt"))


def shrink(src, out_dir, stem):
    """Saves a texture at MEGAKIT_TEX_SIZE: JPEG when it has no transparency, PNG when it does."""
    im = Image.open(src)
    im.thumbnail((MEGAKIT_TEX_SIZE, MEGAKIT_TEX_SIZE), Image.LANCZOS)
    if im.mode == "RGBA" and im.getextrema()[3][0] < 255:
        im.save(os.path.join(out_dir, stem + ".png"), optimize=True)
        return stem + ".png"
    im.convert("RGB").save(os.path.join(out_dir, stem + ".jpg"), quality=85, optimize=True)
    return stem + ".jpg"


def mime(filename):
    return "image/png" if filename.endswith(".png") else "image/jpeg"


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    # Kenney: GLB files that share one tiny colormap
    k_out = os.path.join(OUT, "kenney")
    os.makedirs(os.path.join(k_out, "Textures"))
    for name in KENNEY_MODELS:
        shutil.copy(os.path.join(KENNEY, "Models", "GLB format", name + ".glb"), k_out)
    shutil.copy(os.path.join(KENNEY, "Models", "GLB format", "Textures", "colormap.png"), os.path.join(k_out, "Textures"))
    shutil.copy(os.path.join(KENNEY, "License.txt"), os.path.join(k_out, "LICENSE.txt"))

    # Quaternius eye drone: the overseer. glTF + bin, textures shrunk to 512 px.
    d_out = os.path.join(OUT, "overseer")
    os.makedirs(d_out)
    with open(os.path.join(DRONE, "Enemy_EyeDrone.gltf"), encoding="utf-8") as f:
        gltf = json.load(f)  # data only
    for buf in gltf.get("buffers", []):
        uri = os.path.basename(buf["uri"])
        shutil.copy(os.path.join(DRONE, uri), os.path.join(d_out, uri))
        buf["uri"] = uri
    for img in gltf.get("images", []):
        uri = os.path.basename(img["uri"])
        im = Image.open(os.path.join(DRONE, uri))
        im.thumbnail((DRONE_TEX_SIZE, DRONE_TEX_SIZE))
        im.save(os.path.join(d_out, uri), optimize=True)
        img["uri"] = uri
    with open(os.path.join(d_out, "drone.gltf"), "w", encoding="utf-8") as f:
        json.dump(gltf, f)
    shutil.copy(os.path.join(SRC, "quaternius-essentials", "x", "License_Standard.txt"), os.path.join(d_out, "LICENSE.txt"))

    megakit(os.path.join(OUT, "megakit"))

    total = 0
    for dp, _, files in os.walk(OUT):
        for fn in files:
            total += os.path.getsize(os.path.join(dp, fn))
    print(f"public/models: {total / 1024:.0f} KB")


if __name__ == "__main__":
    sys.exit(main())
