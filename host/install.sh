#!/bin/sh
#
# Registers the helper with Firefox, for this user only. No root needed.
#
# Firefox finds a native messaging host by reading a manifest from a fixed
# folder, so this writes that manifest with the absolute path of the helper.

set -eu

here=$(cd "$(dirname "$0")" && pwd)
helper="$here/cta_host.py"

case "$(uname -s)" in
  Darwin) folder="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts" ;;
  *) folder="$HOME/.mozilla/native-messaging-hosts" ;;
esac

mkdir -p "$folder"
chmod +x "$helper"
sed "s|__PATH__|$helper|" "$here/cta_host.json" > "$folder/convert_them_all.json"

echo "Installed: $folder/convert_them_all.json"
echo "Helper:    $helper"

# The snap build of Firefox reads a different folder, and a helper started from
# it cannot see /usr/bin, so yt-dlp and ffmpeg are out of its reach. Saying so
# beats a mysterious failure later.
if [ -d "$HOME/snap/firefox" ]; then
  echo
  echo "Note: a snap Firefox was found. It reads"
  echo "  ~/snap/firefox/common/.mozilla/native-messaging-hosts/"
  echo "and runs the helper confined, where yt-dlp and ffmpeg are not reachable."
  echo "Use the Firefox package from Mozilla, or from your distribution, instead."
fi
