#!/usr/bin/env python3
"""
Registers the helper with Firefox on Windows, for this user only.

Double-click cta-install.exe, or run this file with Python:

    python install.py

Firefox finds a native messaging host by reading a manifest whose path is
named in the registry, under the current user. No administrator rights are
needed, nothing is installed anywhere else, and the only two things written
are the manifest beside this file and that one registry value.

Linux and macOS use install.sh instead. A shell script can be read in a
second there, and a terminal is not in anybody's way.
"""

import json
import os
import sys
from pathlib import Path

KEY = r"Software\Mozilla\NativeMessagingHosts\convert_them_all"
MANIFEST = "convert_them_all.json"
TEMPLATE = "cta_host.json"
PROGRAM = "cta-helper.exe"
SOURCE = "cta_host.py"
WRAPPER = "cta_host.bat"

# Firefox runs whatever the manifest names, and it cannot run a .py file. The
# source route therefore needs a program to point at, which is all this is.
# py is the launcher that comes with python.org installs; python is what the
# Microsoft Store build provides. Either will do.
WRAPPER_TEXT = """@echo off
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0cta_host.py" %*
) else (
  python "%~dp0cta_host.py" %*
)
"""


def beside():
    """The folder this is running from, whether as source or as a program."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def choose(folder):
    """What Firefox should launch, and whether a wrapper is needed for it.

    The program when it is here, which is what a release carries. The source
    otherwise, which is what a checkout carries, and that needs the wrapper.
    """
    program = folder / PROGRAM
    if program.is_file():
        return program, False
    source = folder / SOURCE
    if source.is_file():
        return folder / WRAPPER, True
    raise FileNotFoundError(
        f"Neither {PROGRAM} nor {SOURCE} is in {folder}.\n"
        "Unzip the whole folder and run this from inside it.")


def write_manifest(folder, target):
    """The manifest Firefox reads, with the real path in it.

    A Windows path is full of backslashes and this is JSON, where a backslash
    starts an escape. json.dumps does that correctly; writing the path in by
    hand is how this breaks.
    """
    template = (folder / TEMPLATE).read_text(encoding="utf-8")
    body = template.replace('"__PATH__"', json.dumps(str(target)))
    # Parsed before it is written: a manifest Firefox cannot read is worse
    # than no manifest at all, because nothing says so.
    json.loads(body)
    manifest = folder / MANIFEST
    manifest.write_text(body, encoding="utf-8")
    return manifest


def register(manifest):
    """Name the manifest in the registry. The value is the manifest, not the
    program: pointing it at the program is the mistake that leaves Firefox
    silently refusing to talk to anything."""
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, KEY) as key:
        winreg.SetValue(key, "", winreg.REG_SZ, str(manifest))


def installed_path():
    """What the registry says now, for anyone checking afterwards."""
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY) as key:
        return winreg.QueryValue(key, "")


def pause():
    """Wait, but only when a person is watching.

    Double-clicked, this gets its own console window, which closes the moment
    the program ends and takes every word with it. Run from a terminal, or by
    a script, a pause is just something in the way.
    """
    if not sys.stdin or not sys.stdin.isatty():
        return
    print("\nSuccess! Press any key to close.")
    try:
        import msvcrt

        msvcrt.getch()
    except ImportError:
        input()


def main():
    folder = beside()
    try:
        target, wrapper = choose(folder)
        if wrapper:
            (folder / WRAPPER).write_text(WRAPPER_TEXT, encoding="ascii")
        manifest = write_manifest(folder, target)
        if os.name == "nt":
            register(manifest)
        else:
            print("This installer is for Windows. Use install.sh instead.")
            return 1
    except Exception as error:  # noqa: BLE001 - the person reading has to know
        print(f"It did not work: {error}")
        pause()
        return 1

    print(f"Installed: {manifest}")
    print(f"Helper:    {target}")
    print()
    print('Go back to Convert Them All and press "installation complete, reload".')
    pause()
    return 0


if __name__ == "__main__":
    sys.exit(main())
