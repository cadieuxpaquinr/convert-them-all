#!/bin/sh
#
# Runs the add-on in this project's own Firefox, with its own profile.
#
# Nothing here touches the Firefox you browse with. The build lives under
# ~/.local/share/convert-them-all, it is never registered as a default browser,
# and the profile beside it belongs to this project alone.
#
# Why a separate build at all: the snap Firefox runs confined, and a native
# messaging helper started from it cannot see yt-dlp or ffmpeg. This one can.
#
# Install it once:
#   mkdir -p ~/.local/share/convert-them-all && cd ~/.local/share/convert-them-all
#   curl -L -o firefox.tar.xz \
#     "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
#   tar -xf firefox.tar.xz && rm firefox.tar.xz && mkdir -p profile
#
# Then, from the repository:
#   ./dev/firefox.sh                 open it and load the add-on
#   ./dev/firefox.sh --args=-headless   same, with no window
#
# The add-on reloads itself when a file changes, which is what stops a stale
# copy from being tested by mistake.

set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
home=${CTA_FIREFOX_HOME:-$HOME/.local/share/convert-them-all}

if [ ! -x "$home/firefox/firefox" ]; then
  echo "No Firefox at $home/firefox/firefox. See the comment at the top of this file."
  exit 1
fi

exec npx --yes web-ext@latest run \
  --source-dir "$here" \
  --firefox "$home/firefox/firefox" \
  --firefox-profile "$home/profile" \
  --profile-create-if-missing \
  --keep-profile-changes \
  "$@"
