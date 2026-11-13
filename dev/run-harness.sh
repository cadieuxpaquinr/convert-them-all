#!/bin/sh
# Every harness page, each in its own profile, served over http so that fetch
# works. The cache prefs matter: without them Firefox serves a stale copy of a
# module that was just edited, and the failure looks like a fault in the code.
dir=$HOME/snap/firefox/common/cta-preview
(cd "$dir" && python3 -m http.server 8099 >/dev/null 2>&1 &)
sleep 1
for page in "$dir"/*-drive.html; do
  name=$(basename "$page" .html)
  case "$name" in bg-drive|bridge-drive|home-drive|video-bg-drive) continue;; esac
  log=/tmp/h-$name.log
  prof=$HOME/snap/firefox/common/hprof-$name
  mkdir -p "$prof"
  cat > "$prof/user.js" <<'PREFS'
user_pref("browser.dom.window.dump.enabled", true);
user_pref("devtools.console.stdout.content", true);
user_pref("privacy.file_unique_origin", false);
user_pref("browser.cache.disk.enable", false);
user_pref("browser.cache.memory.enable", false);
user_pref("browser.sessionstore.resume_from_crash", false);
PREFS
  timeout 40 firefox --headless --no-remote --profile "$prof" "http://localhost:8099/$name.html" > "$log" 2>&1
  echo "$name: $(grep -c '^PASS' "$log") pass, $(grep -c '^FAIL' "$log") fail, done=$(grep -c 'HARNESS-DONE' "$log")"
done
pkill -f "http.server 8099"
