#!/bin/sh
#
# Registers the helper with Firefox, for this user only. No root needed.
#
# Firefox finds a native messaging host by reading a manifest from a fixed
# folder, so this writes that manifest with the absolute path of the helper.

set -eu

here=$(cd "$(dirname "$0")" && pwd)

# The program if it is here, the source if it is not. A release carries the
# program and nothing else; a checkout carries the source and no build.
if [ -x "$here/cta-helper" ]; then
  helper="$here/cta-helper"
elif [ -f "$here/cta_host.py" ]; then
  helper="$here/cta_host.py"
  chmod +x "$helper"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "This copy needs Python, and python3 was not found."
    echo "Install Python, or download the program instead:"
    echo "  https://github.com/cadieuxpaquinr/convert-them-all/releases/latest"
    exit 1
  fi
else
  echo "Neither cta-helper nor cta_host.py is beside this script."
  exit 1
fi

case "$(uname -s)" in
  Darwin) folder="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts" ;;
  *) folder="$HOME/.mozilla/native-messaging-hosts" ;;
esac

mkdir -p "$folder"
sed "s|__PATH__|$helper|" "$here/cta_host.json" > "$folder/convert_them_all.json"

echo "Installed: $folder/convert_them_all.json"
echo "Helper:    $helper"
echo
echo "Go back to Convert Them All and press \"installation complete, reload\"."

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
