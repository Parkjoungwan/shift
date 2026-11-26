# Builds the itch.io upload: public/ without the admin page, with the server host
# baked into index.html (itch serves the game from its own domain, so the client
# cannot use location.host).
# Usage: python -I scripts/build-itch.py <server host, e.g. gameoff-shift.name.workers.dev>
import os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
OUT = os.path.join(ROOT, "dist", "gameoff-shift-itch.zip")
SKIP_DIRS = {"admin"}


def main():
    if len(sys.argv) < 2 or not re.fullmatch(r"[A-Za-z0-9.-]+(:\d+)?", sys.argv[1]):
        sys.exit("usage: build-itch.py <server host>")
    host = sys.argv[1]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dirs, files in os.walk(PUBLIC):
            dirs[:] = [d for d in dirs if not (dp == PUBLIC and d in SKIP_DIRS)]
            for fn in files:
                path = os.path.join(dp, fn)
                rel = os.path.relpath(path, PUBLIC).replace(os.sep, "/")
                if rel == "index.html":
                    with open(path, encoding="utf-8") as f:
                        html = f.read()
                    tag = f'<script>window.SHIFT_SERVER = "{host}";</script>\n'
                    marker = '<script type="module" src="client.js"></script>'
                    if marker not in html:
                        sys.exit("client.js script tag not found in index.html")
                    z.writestr(rel, html.replace(marker, tag + marker))
                else:
                    z.write(path, rel)
                count += 1
    print(f"{OUT}: {count} files, {os.path.getsize(OUT) / 1024:.0f} KB, server {host}")


if __name__ == "__main__":
    main()
