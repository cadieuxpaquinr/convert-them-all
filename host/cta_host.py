#!/usr/bin/env python3
"""
Convert Them All: the native messaging helper.

A browser extension cannot run a program, so this does it. Firefox starts it,
talks to it over stdin and stdout, and stops it when the add-on disconnects.

The wire format is Firefox's: a 4 byte native-order length, then that many bytes
of UTF-8 JSON.

This file answers questions about the machine. It reports what it found; the
add-on decides what to say about it, because only the add-on knows which
platform's wording and commands to show.
"""

import json
import os
import platform
import shutil
import struct
import subprocess
import sys
from pathlib import Path

# Raised when the add-on needs something this file does not yet do, so an old
# helper left behind by an earlier install is told to update rather than
# failing in a way nobody can read.
HOST_VERSION = 1

TOOL_TIMEOUT = 15


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (length,) = struct.unpack("@I", raw)
    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        return None
    return json.loads(body.decode("utf-8"))


def write_message(message):
    body = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def run(command):
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=TOOL_TIMEOUT,
        shell=False,
    )


def tool(name, args, pick):
    """Where a tool is and which version it is, or why it is not usable."""
    path = shutil.which(name)
    if not path:
        return {"found": False}
    try:
        result = run([path] + args)
    except (OSError, subprocess.SubprocessError) as error:
        return {"found": True, "path": path, "broken": str(error)}
    text = result.stdout.strip() or result.stderr.strip()
    return {"found": True, "path": path, "version": pick(text)}


def first_word_after(text, marker):
    parts = text.split()
    for index, word in enumerate(parts):
        if word == marker and index + 1 < len(parts):
            return parts[index + 1]
    return text.splitlines()[0] if text else ""


def downloads_folder():
    """The usual place, without assuming English folder names on Linux."""
    configured = os.environ.get("XDG_DOWNLOAD_DIR")
    if configured:
        return Path(os.path.expandvars(configured)).expanduser()
    dirs = Path.home() / ".config" / "user-dirs.dirs"
    if dirs.is_file():
        try:
            for line in dirs.read_text(encoding="utf-8").splitlines():
                if line.startswith("XDG_DOWNLOAD_DIR="):
                    value = line.split("=", 1)[1].strip().strip('"')
                    return Path(os.path.expandvars(value.replace("$HOME", str(Path.home()))))
        except OSError:
            pass
    return Path.home() / "Downloads"


def folder_state(path):
    folder = Path(path)
    state = {"path": str(folder), "exists": folder.is_dir()}
    state["writable"] = state["exists"] and os.access(folder, os.W_OK)
    return state


def report():
    return {
        "type": "report",
        "host": HOST_VERSION,
        "platform": sys.platform,
        "machine": platform.machine(),
        "python": platform.python_version(),
        "home": str(Path.home()),
        "ytdlp": tool("yt-dlp", ["--version"], lambda text: text.splitlines()[0].strip()),
        "ffmpeg": tool("ffmpeg", ["-version"], lambda text: first_word_after(text, "version")),
        "downloads": folder_state(downloads_folder()),
    }


def handle(message):
    kind = message.get("type") if isinstance(message, dict) else None
    if kind == "ping":
        return report()
    if kind == "check-folder":
        return {"type": "folder", **folder_state(message.get("path", ""))}
    return {
        "type": "error",
        "reason": "unknown-request",
        "detail": f"This helper does not understand {kind!r}.",
        "host": HOST_VERSION,
    }


def main():
    while True:
        try:
            message = read_message()
        except (ValueError, struct.error) as error:
            write_message({"type": "error", "reason": "bad-message", "detail": str(error)})
            return
        if message is None:
            return
        try:
            write_message(handle(message))
        except Exception as error:  # noqa: BLE001 - the add-on must hear about it
            write_message({"type": "error", "reason": "helper-failed", "detail": str(error)})


if __name__ == "__main__":
    main()
