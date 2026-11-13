# Convert Them All

A Firefox add-on that converts images, audio and web pages in the browser, and downloads
videos through yt-dlp on your computer. Nothing is uploaded.

**Not on addons.mozilla.org yet.** When it is published it will live at
[addons.mozilla.org/firefox/addon/convert-them-all](https://addons.mozilla.org/firefox/addon/convert-them-all/).
Until then, [install from source](#install).

## Features

Open the app with the toolbar button, with `Ctrl+1` (`Alt+1` on Windows, `⌃1` on macOS),
or by right-clicking an image or a video and choosing **Download / Convert to…**. Drop a
file anywhere on the window and it goes to the section that handles it.

### Images

Right-click any image, or pick one from your computer.

| To | Works |
|---|---|
| PNG, JPEG, WEBP, BMP | yes, with Firefox's canvas |
| ICO | yes, a PNG in an ICO container, 256 px at most |
| AVIF, GIF | not yet, no offline encoder exists for them |

Firefox's canvas quietly returns PNG for a format it cannot write, so the add-on checks
what it got back rather than save PNG bytes under a foreign extension.

### Videos

Paste a link, detect the one on the page in front, or right-click a video. Downloading is
done by [yt-dlp](https://github.com/yt-dlp/yt-dlp) through a small helper outside the
browser, because an add-on cannot run a program itself.

- **webm** best quality, with a resolution, frame rate and codec to choose
- **mp4** either repackaged without re-encoding, or forced to H.264 for players that need it
- **mp3** audio only, with a bitrate, and the video kept as well if you want
- Skip sponsored segments, through [SponsorBlock](https://sponsor.ajay.app). YouTube only,
  and off by default.

The pane checks what the machine can do and says exactly what to install. yt-dlp one
release behind is a warning; two behind holds video downloads shut, because a copy that
old fails on many sites in ways that look like a fault here.

### Audio

Pick an audio file, or drop one. Firefox decodes mp3, wav, flac, ogg, opus, m4a and webm.

| To | Works |
|---|---|
| WAV | yes, with a sample rate and 16, 24 or 32-bit to choose |
| MP3, OGG, OPUS, FLAC, M4A | not yet |

A browser has no audio encoder but MediaRecorder, which writes Opus alone and in real
time. WAV is written from the decoded samples instead, which is instant and exact.

### Sheets

Open an **xlsx**, an **ods**, a **csv** or a **tsv** and save it as CSV (one file per
sheet, or the first alone), TSV, or JSON keyed by the header row.

What comes out is the data, not the formatting: a formula arrives as the answer it last
gave, and a date as the day it names rather than as the number a spreadsheet stores.
Writing a workbook back out is not offered, because one that a spreadsheet refused to
open would be worse than not offering it.

### Archives

Open a zip, a tar or a tar.gz and it lists what is inside with a tick each, sizes and
all. Nothing is written until you press **Extract ticked**: an archive can hold hundreds
of files, and each one saved is a download of its own. Packer leavings such as
`__MACOSX/` and `.DS_Store` start unticked.

Packing works the same way in reverse: choose files, or tick what is already open, and
write a **zip**, a **tar** or a **tar.gz**. That is also how one format becomes another.

Firefox does the compression itself through `CompressionStream`, so there is nothing
bundled. A name inside an archive comes from whoever made it, so every path is rebuilt
from safe parts: an entry calling itself `../../etc/passwd` lands inside the folder with
everything else.

### Websites

Beta. Paste an address or detect the page in front, and save it as a **single
self-contained HTML file**, **as the server sent it**, as **plain text** or as
**Markdown**. Scripts are always removed.

Reach is bounded twice. A whole site is a section, not a host, so you choose how far up
the path to go:

```
https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/RealTimeKernel.html
                                             ^ or here      ^ or here  ^ default
```

Nothing outside that folder is followed, a page count stops the crawl, and the widest
reach asks before it starts. Pages land under `Downloads/convert-them-all/<site>/`, or
in **one .zip** if you would rather, and links between saved pages are rewritten so the
copy can be read offline either way.

### Files

Anything that is not an image or an audio file lands here, named. Nothing converts it
yet: archives and spreadsheets are what this section is waiting for.

### Everywhere

- **Messages** in the top right, dismissable, gone after fifteen seconds, with a bell that
  keeps the last ten.
- **A home page that sets the app up**: what is installed, what to install, and the
  optional all-sites permission, which can be given there and taken back in Settings.
- **Settings** for the shortcut, the app window's size and position, the download folder
  and the theme.

## Install

The add-on is not published yet, so load it from source:

1. Open `about:debugging` in Firefox.
2. Choose **This Firefox**, then **Load Temporary Add-on**.
3. Select `manifest.json` in this folder.

Firefox removes a temporary add-on when it closes.

**For video downloads only**, install the helper and its dependencies:

```sh
./host/install.sh                                              # Linux and macOS
powershell -ExecutionPolicy Bypass -File host\install.ps1      # Windows
```

The helper needs Python, yt-dlp, and ffmpeg for sites that send picture and sound
separately. The app's home page names the exact command for your system. A Firefox
installed as a snap cannot reach programs outside its confinement, so the helper will not
work there.

## Permissions

At install: `menus`, `downloads`, `storage`, `tabs` for reading the address of the page in
front, and `nativeMessaging` for the video helper.

Asked for later, only when something needs it: access to a site, because reading an
image's bytes or a page's HTML means fetching it. One site at a time, or all sites at
once from the home page or Settings.

## Privacy

Every conversion runs on your computer. Images, audio and page conversion never leave the
browser, and the add-on has no analytics of any kind.

It does make these requests, and no others:

- the image, page or video you asked for, from the site it is on
- the yt-dlp release list from `api.github.com`, to tell you whether yours is current
- when the SponsorBlock tick is on, the first four characters of a hash of the YouTube
  video's id, to `sponsor.ajay.app`. yt-dlp does this, the video id is never sent whole,
  and the tick is off by default.

## Roadmap

The add-on is called Convert Them All, so the list is long on purpose. It is grouped by
what each item is waiting on rather than by subject, because that is what decides how far
off it is.

**The browser can already do these**

- **Sheets, written back**: csv into a real xlsx or ods, which means building the XML
  rather than only reading it.
- **Documents**: Markdown, HTML and docx between each other, and a saved website section
  as one EPUB. docx and EPUB are a zip full of XML as well.
- **Batch, and whole pages**: convert many files in one go, drop a folder, and a
  "Convert every image on this page" entry on the context menu. This is a change to how
  the app works rather than another format, and it is the one that earns the name.

**These need the helper and ffmpeg**

- AVIF and GIF for images, and MP3, OGG, OPUS, FLAC and M4A for audio. No browser has an
  encoder for any of them, and none is coming.
- Media already on your disk: pull the audio out of a video, cut a GIF from a clip,
  re-encode a file without downloading anything.
- Chapters for video downloads: embed them, split on them, or remove them.

**This one needs a library carried along**

- Reading a PDF, to get the text or the images back out. Firefox ships pdf.js and does
  not lend it to add-ons, so it would mean shipping a copy.

**Not planned**

- Firefox only. There is no intention of porting this to Chrome, Edge, Safari or anything
  else.

## Development

No build step, no bundler and no dependencies. Every file ships as written, one module per
job, each exposing a single `CTA*` global.

```
manifest.json          the only file Firefox needs at the root
src/app.html           the app window, and every script tag
src/panes/             one file per section
src/formats/           the converters and the containers they write
src/platform/          permissions, the helper, messages, drops, settings
host/                  the native helper for video downloads
dev/                   tooling, never packaged
```

```sh
./dev/check.sh                      # the node checks, for the pure modules
./dev/sync-harness.py               # rebuild the test pages after any change
./dev/run-harness.sh                # run every test page headless
./dev/firefox.sh                    # run it in a Firefox of its own
npx web-ext lint --source-dir .     # 0 errors expected
```

The pure modules are checked with node. The rest run in harness pages that load the real
modules against a stubbed `browser` object and report with `dump()`: screenshots miss
anything that finishes after the load event, which is every conversion.

## Report a bug

Please [open an issue](https://github.com/cadieuxpaquinr/convert-them-all/issues).
