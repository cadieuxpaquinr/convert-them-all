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
import time
import urllib.request
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
HOST_VERSION = 4

TOOL_TIMEOUT = 15

# yt-dlp is told to mark its own lines, so progress and the final path can be
# picked out of everything else it prints.
PROGRESS_MARK = "CTAPROG|"
FILE_MARK = "CTAFILE|"

# Enough of the tail to explain a failure, not enough to flood the add-on.
TAIL_LINES = 40

# Reading what a video offers is quick, but not instant on a slow site.
PROBE_TIMEOUT = 60

# What the add-on is allowed to ask for. It sends intent, never arguments: a
# page's content reaches this through the context menu, so the same boundary
# that stops a URL becoming an option has to hold for the options themselves.
CONTAINERS = ("webm", "mp4", "mp3")
HEIGHTS = (2160, 1440, 1080, 720, 480, 360)
RATES = (30, 60)
VCODECS = ("av01", "vp9", "avc1")
METHODS = ("repackage", "compatible")
BITRATES = ("320", "256", "192", "128", "96")

# SponsorBlock is a YouTube-only postprocessor fed by a volunteer database, so
# only the plainly sponsored segments are cut: intros and filler are somebody
# else's judgement and are left alone.
SPONSOR_CATEGORIES = "sponsor"

# Picks streams mp4 can always hold, which is what costs resolution on sites
# that keep their best picture in AV1 or VP9.
COMPATIBLE = "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/b"

# yt-dlp writes VP9 as both vp9 and vp09 depending on the source, and they are
# the same thing to anyone reading the panel.
CODEC_FAMILIES = {"vp09": "vp9", "h264": "avc1", "avc3": "avc1"}

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

# Which releases exist, asked once a day. yt-dlp ships every few weeks, so
# counting days since a release says nothing useful: being on the newest one
# must look the same whether it came out yesterday or last month.
RELEASES_URL = "https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=8"
RELEASES_TTL = 24 * 60 * 60
RELEASES_TIMEOUT = 5


def js_runtime():
    for name in JS_RUNTIMES:
        found = shutil.which(name)
        if found:
            return {"found": True, "name": name, "path": found}
    return {"found": False}


def cache_file():
    root = os.environ.get("XDG_CACHE_HOME") or (Path.home() / ".cache")
    folder = Path(root) / "convert-them-all"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "releases.json"


def read_cache():
    try:
        cached = json.loads(cache_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if time.time() - cached.get("checked", 0) > RELEASES_TTL:
        return None
    return cached


def fetch_releases():
    request = urllib.request.Request(
        RELEASES_URL,
        headers={"Accept": "application/vnd.github+json",
                 "User-Agent": "convert-them-all"},
    )
    with urllib.request.urlopen(request, timeout=RELEASES_TIMEOUT) as answer:
        body = json.loads(answer.read().decode("utf-8"))
    tags = [entry.get("tag_name", "") for entry in body
            if not entry.get("prerelease") and entry.get("tag_name")]
    return [tag for tag in tags if tag]


def releases():
    """The known release tags, newest first. Cached, and never fatal."""
    cached = read_cache()
    if cached:
        return {"tags": cached.get("tags", []), "checked": cached["checked"],
                "fresh": False}
    try:
        tags = fetch_releases()
    except Exception as error:  # noqa: BLE001 - offline is normal, not fatal
        stale = None
        try:
            stale = json.loads(cache_file().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            stale = None
        return {"tags": (stale or {}).get("tags", []), "error": str(error),
                "checked": (stale or {}).get("checked", 0), "fresh": False}
    checked = time.time()
    try:
        cache_file().write_text(
            json.dumps({"tags": tags, "checked": checked}), encoding="utf-8")
    except OSError:
        pass
    return {"tags": tags, "checked": checked, "fresh": True}


def install_kind(path):
    """How yt-dlp got here, which decides how it is updated.

    Guessed from where it sits and what it is, because the only certain test,
    running the updater, would do the updating.
    """
    if not path:
        return "unknown"
    place = Path(path)
    text = str(place)
    home = str(Path.home())

    if "homebrew" in text or text.startswith("/opt/homebrew"):
        return "brew"
    if (Path.home() / ".local/share/pipx/venvs/yt-dlp").is_dir():
        return "pipx"
    if "WinGet" in text or "winget" in text:
        return "winget"
    if any(Path(p).is_dir() for p in
           Path.home().glob(".local/lib/python3*/site-packages/yt_dlp*.dist-info")):
        return "pip"
    if text.startswith(("/usr/bin", "/bin", "/usr/sbin")):
        return "system"
    if text.startswith(home):
        # A zipapp or a standalone build, both of which update themselves.
        return "self"
    return "unknown"


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


def ytdlp_report():
    found = tool("yt-dlp", ["--version"], lambda text: text.splitlines()[0].strip())
    if found.get("found"):
        found["install"] = install_kind(found.get("path"))
    return found


def report():
    return {
        "type": "report",
        "host": HOST_VERSION,
        "platform": sys.platform,
        "machine": platform.machine(),
        "python": platform.python_version(),
        "home": str(Path.home()),
        "ytdlp": ytdlp_report(),
        "ffmpeg": tool("ffmpeg", ["-version"], lambda text: first_word_after(text, "version")),
        "jsruntime": js_runtime(),
        "releases": releases(),
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


def one_of(value, allowed, name):
    if value is None or value == "":
        return None
    for candidate in allowed:
        if str(value) == str(candidate):
            return candidate
    raise ValueError(f"{name} cannot be {value!r}")


def format_args(choice):
    """Turn what was chosen into yt-dlp arguments, refusing anything else."""
    choice = choice if isinstance(choice, dict) else {}
    container = one_of(choice.get("container"), CONTAINERS, "container") or "webm"

    if container == "mp3":
        args = ["--extract-audio", "--audio-format", "mp3"]
        bitrate = one_of(choice.get("bitrate"), BITRATES, "bitrate")
        if bitrate:
            args += ["--audio-quality", f"{bitrate}K"]
        if choice.get("keepVideo"):
            args.append("--keep-video")
        return args

    # A preference, not a filter: the nearest below is taken when the exact one
    # does not exist, so asking for 2160p on a small video still downloads it.
    sort = []
    height = one_of(choice.get("height"), HEIGHTS, "height")
    if height:
        sort.append(f"res:{height}")
    rate = one_of(choice.get("fps"), RATES, "fps")
    if rate:
        sort.append(f"fps:{rate}")
    vcodec = one_of(choice.get("vcodec"), VCODECS, "vcodec")
    if vcodec:
        sort.append(f"vcodec:{vcodec}")

    args = ["--format-sort", ",".join(sort)] if sort else []

    if choice.get("sponsorblock"):
        args += ["--sponsorblock-remove", SPONSOR_CATEGORIES]

    if container == "webm":
        # Not every pair fits webm; mkv takes whatever is left over.
        return args + ["--merge-output-format", "webm/mkv"]

    method = one_of(choice.get("method"), METHODS, "method") or "repackage"
    if method == "compatible":
        return args + ["--format", COMPATIBLE, "--merge-output-format", "mp4"]
    # Lossless container change, which fails when mp4 cannot hold the codecs.
    return args + ["--remux-video", "mp4"]


def probe(message):
    """What this video actually offers, so the panels can grey what it lacks."""
    url = wanted_url(message.get("url", ""))
    if not url:
        return {"type": "error", "reason": "bad-url",
                "detail": "Only http and https addresses can be read."}

    ytdlp = shutil.which("yt-dlp")
    if not ytdlp:
        return {"type": "error", "reason": "no-ytdlp",
                "detail": "yt-dlp is not installed, or not on the PATH."}

    try:
        done = subprocess.run(
            [ytdlp, "--no-config", "--no-warnings", "--no-playlist", "-J", "--", url],
            capture_output=True, text=True, timeout=PROBE_TIMEOUT, shell=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return {"type": "error", "reason": "probe-failed", "detail": str(error)}

    if done.returncode != 0:
        tail = (done.stderr or "").strip().splitlines()[-TAIL_LINES:]
        return {"type": "error", "reason": "probe-failed", "detail": "\n".join(tail)}

    try:
        info = json.loads(done.stdout)
    except ValueError as error:
        return {"type": "error", "reason": "probe-failed", "detail": str(error)}

    heights, rates, codecs, mp4_heights = set(), set(), set(), set()
    for form in info.get("formats") or []:
        vcodec = (form.get("vcodec") or "none").split(".")[0]
        if vcodec == "none":
            continue
        vcodec = CODEC_FAMILIES.get(vcodec, vcodec)
        height = form.get("height")
        if height:
            heights.add(int(height))
            if vcodec == "avc1":
                mp4_heights.add(int(height))
        if form.get("fps"):
            rates.add(int(round(form["fps"])))
        codecs.add(vcodec)

    return {
        "type": "formats",
        "title": info.get("title") or "",
        "duration": info.get("duration") or 0,
        "heights": sorted(heights, reverse=True),
        "fps": sorted(rates),
        "vcodecs": sorted(codecs),
        "mp4Heights": sorted(mp4_heights, reverse=True),
    }


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

    try:
        chosen = format_args(message.get("format"))
    except ValueError as error:
        return {"type": "error", "reason": "bad-format", "detail": str(error)}

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

    command += chosen + ["--", url]

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
    if kind == "probe":
        return probe(message)
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
