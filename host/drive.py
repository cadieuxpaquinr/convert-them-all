#!/usr/bin/env python3
"""
Talk to the helper the way Firefox does, from a shell.

    ./host/drive.py '{"type": "ping"}'

Every argument is one JSON request, sent in order. Answers are printed as they
come back. This is how the helper is tested without a browser in the way.
"""

import json
import struct
import subprocess
import sys
from pathlib import Path

HELPER = Path(__file__).with_name("cta_host.py")


def frame(message):
    body = json.dumps(message).encode("utf-8")
    return struct.pack("@I", len(body)) + body


def unframe(stream):
    while True:
        head = stream.read(4)
        if len(head) < 4:
            return
        (length,) = struct.unpack("@I", head)
        yield json.loads(stream.read(length).decode("utf-8"))


def main(requests):
    payload = b"".join(frame(json.loads(r)) for r in requests)
    done = subprocess.run(
        [sys.executable, str(HELPER)], input=payload, capture_output=True, timeout=600
    )
    if done.stderr:
        print("stderr:", done.stderr.decode("utf-8", "replace"), file=sys.stderr)
    for answer in unframe(__import__("io").BytesIO(done.stdout)):
        print(json.dumps(answer, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:] or ['{"type": "ping"}'])
