#!/usr/bin/env python3
"""
Rebuild the test harness pages from the add-on as it stands.

The harnesses load the real modules against a stubbed browser, and they live
outside the repository because snap Firefox cannot read /tmp. Copying the
scripts without regenerating the pages has broken a run three times now: the
markup goes stale, an element is missing, and the failure looks like a fault in
the code rather than in the harness. One command, always both.

    ./dev/sync-harness.py

Each <name>-drive.js becomes <name>-drive.html. A <name>.seed.html beside it, if
there is one, is inserted after the stub, which is how a harness arranges what
the page starts with.
"""

import pathlib
import shutil
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
HARNESS = pathlib.Path.home() / "snap/firefox/common/cta-preview"
STUB = '<script src="stub.js"></script>'


def main():
    if not HARNESS.is_dir():
        print(f"No harness folder at {HARNESS}", file=sys.stderr)
        return 1

    for source in list(REPO.glob("*.js")) + [REPO / "theme.css"]:
        shutil.copy2(source, HARNESS / source.name)

    page = (REPO / "app.html").read_text(encoding="utf-8")
    page = page.replace('<link rel="stylesheet" href="theme.css">',
                        f'<link rel="stylesheet" href="theme.css">\n  {STUB}', 1)

    # Driverless, for the harnesses that load the app in a frame rather than
    # driving it in place. Both went stale and were missing two modules.
    (HARNESS / "app.html").write_text(page, encoding="utf-8")
    (HARNESS / "app-bridge.html").write_text(
        page.replace(STUB, '<script src="bridge-app.js"></script>', 1),
        encoding="utf-8")

    built = 0
    for driver in sorted(HARNESS.glob("*-drive.js")):
        name = driver.stem
        body = page
        seed = HARNESS / f"{name}.seed.html"
        if seed.is_file():
            body = body.replace(STUB, STUB + "\n  " + seed.read_text(encoding="utf-8"), 1)
        body = body.replace('<script src="app.js"></script>',
                            f'<script src="app.js"></script>\n'
                            f'  <script src="{name}.js"></script>')
        (HARNESS / f"{name}.html").write_text(body, encoding="utf-8")
        built += 1

    print(f"Synced {built} harness pages from {REPO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
