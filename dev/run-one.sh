#!/bin/sh
#
# One harness page, headless, with the server it needs.
#
#   ./dev/run-one.sh pdf-drive
#
# The kill lives in here rather than on the command line: pkill matches its own
# caller's arguments, so stopping the server from an interactive shell kills the
# shell that asked.

set -eu

name=${1:?usage: run-one.sh <harness-name>}
dir=$HOME/snap/firefox/common/cta-preview
prof=$HOME/snap/firefox/common/hprof-one
log=/tmp/h-$name.log

mkdir -p "$prof"
cat > "$prof/user.js" <<'PREFS'
user_pref("browser.dom.window.dump.enabled", true);
user_pref("devtools.console.stdout.content", true);
user_pref("privacy.file_unique_origin", false);
user_pref("browser.cache.disk.enable", false);
user_pref("browser.cache.memory.enable", false);
user_pref("browser.sessionstore.resume_from_crash", false);
PREFS

(cd "$dir" && python3 -m http.server 8099 >/dev/null 2>&1 &)
sleep 1
timeout 90 firefox --headless --no-remote --profile "$prof" \
  "http://localhost:8099/$name.html" > "$log" 2>&1 || true
pkill -f "http.server 8099" || true

grep -E '^FAIL|JavaScript error' "$log" || true
echo "$name: $(grep -c '^PASS' "$log") pass, $(grep -c '^FAIL' "$log") fail, done=$(grep -c 'HARNESS-DONE' "$log")"
