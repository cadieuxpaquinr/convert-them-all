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
import signal
import struct
import subprocess
import sys
import urllib.parse
from collections import deque
from pathlib import Path

# Raised when the add-on needs something this file does not yet do, so an old
# helper left behind by an earlier install is told to update rather than
# failing in a way nobody can read.
HOST_VERSION = 2

TOOL_TIMEOUT = 15

# yt-dlp is told to mark its own lines, so progress and the final path can be
# picked out of everything else it prints.
PROGRESS_MARK = "CTAPROG|"
FILE_MARK = "CTAFILE|"

# Enough of the tail to explain a failure, not enough to flood the add-on.
TAIL_LINES = 40

# The running yt-dlp, so it can be stopped when Firefox lets go of the helper.
child = None


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


# yt-dlp needs a JavaScript runtime to unscramble some sites, YouTube above all.
# Only deno is enabled by default, so a runtime that is already here is named on
# the command line rather than asking anyone to install another one.
JS_RUNTIMES = ("deno", "bun", "node")


def js_runtime():
    for name in JS_RUNTIMES:
        found = shutil.which(name)
        if found:
            return {"found": True, "name": name, "path": found}
    return {"found": False}


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
        "jsruntime": js_runtime(),
        "downloads": folder_state(downloads_folder()),
    }


def stop_child(*_):
    """Firefox kills the helper when the add-on disconnects; take yt-dlp along."""
    if child and child.poll() is None:
        child.terminate()
    sys.exit(0)


def wanted_url(url):
    """Only the web. A file: or data: address would be someone else's file."""
    try:
        parsed = urllib.parse.urlparse(str(url))
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return str(url)


def wanted_folder(path):
    """Inside the user's home, resolved first so no link leads out of it."""
    home = Path.home().resolve()
    try:
        folder = Path(path).expanduser().resolve()
    except (OSError, RuntimeError) as error:
        return None, str(error)
    if folder != home and home not in folder.parents:
        return None, f"{folder} is outside your home folder."
    if not folder.is_dir():
        return None, f"{folder} does not exist."
    if not os.access(folder, os.W_OK):
        return None, f"{folder} cannot be written to."
    return folder, None


def download(message):
    global child

    url = wanted_url(message.get("url", ""))
    if not url:
        return {"type": "error", "reason": "bad-url",
                "detail": "Only http and https addresses can be downloaded."}

    folder, problem = wanted_folder(message.get("directory") or downloads_folder())
    if problem:
        return {"type": "error", "reason": "bad-folder", "detail": problem}

    ytdlp = shutil.which("yt-dlp")
    if not ytdlp:
        return {"type": "error", "reason": "no-ytdlp",
                "detail": "yt-dlp is not installed, or not on the PATH."}

    # The address goes after --, so one that starts with a dash cannot be read
    # as an option. No shell is involved at any point.
    command = [
        ytdlp,
        "--no-config",
        "--newline",
        "--no-colors",
        "--no-playlist",
        # --print implies --quiet, which would silence progress entirely.
        "--no-quiet",
        "--paths", str(folder),
        "--output", "%(title).150B [%(id)s].%(ext)s",
        "--progress-template",
        "download:" + PROGRESS_MARK
        + "%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
        "--print", "after_move:" + FILE_MARK + "%(filepath)s",
    ]

    runtime = js_runtime()
    if runtime["found"] and runtime["name"] != "deno":
        command += ["--js-runtimes", runtime["name"]]

    command += ["--", url]

    try:
        child = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, shell=False,
        )
    except OSError as error:
        child = None
        return {"type": "error", "reason": "ytdlp-failed", "detail": str(error)}

    tail = deque(maxlen=TAIL_LINES)
    produced = None
    try:
        for line in child.stdout:
            line = line.rstrip("\n")
            if line.startswith(PROGRESS_MARK):
                parts = (line[len(PROGRESS_MARK):].split("|") + ["", "", ""])[:3]
                write_message({
                    "type": "progress",
                    "percent": parts[0].strip(),
                    "speed": parts[1].strip(),
                    "eta": parts[2].strip(),
                })
            elif line.startswith(FILE_MARK):
                produced = line[len(FILE_MARK):].strip()
            elif line.strip():
                tail.append(line)
    except BrokenPipeError:
        # The add-on went away mid-download.
        stop_child()

    code = child.wait()
    child = None

    if code == 0 and produced:
        file = Path(produced)
        return {
            "type": "done",
            "file": str(file),
            "name": file.name,
            "bytes": file.stat().st_size if file.is_file() else 0,
        }
    return {
        "type": "error",
        "reason": "ytdlp-failed",
        "code": code,
        "detail": "\n".join(tail),
    }


def handle(message):
    kind = message.get("type") if isinstance(message, dict) else None
    if kind == "ping":
        return report()
    if kind == "check-folder":
        return {"type": "folder", **folder_state(message.get("path", ""))}
    if kind == "download":
        return download(message)
    return {
        "type": "error",
        "reason": "unknown-request",
        "detail": f"This helper does not understand {kind!r}.",
        "host": HOST_VERSION,
    }


def main():
    signal.signal(signal.SIGTERM, stop_child)
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
