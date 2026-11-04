# Convert Them All

A Firefox extension that converts images, in the browser and on your computer only.

Right-click an image on any page, choose **Convert to…**, pick a format, and download the
result. Nothing is uploaded and no server is involved.

> **Early version.** Only the Images section works. Videos, Audio, Websites and Files are
> placeholders, and AVIF and GIF are listed as COMING SOON because they have no offline
> encoder yet. See [Limitations](#limitations).

## Formats

| To | Works | How |
|---|---|---|
| PNG | yes | Firefox's canvas |
| JPEG | yes | Firefox's canvas, transparency filled white |
| WEBP | yes | Firefox's canvas |
| BMP | yes | Firefox's canvas, transparency filled white |
| ICO | yes | a PNG in an ICO container, scaled to 256 px at most |
| AVIF | not yet | needs an AV1 encoder that Firefox does not have |
| GIF | not yet | needs a colour quantiser and an LZW encoder |

Firefox's canvas quietly returns PNG for a format it cannot write. The add-on checks what
it got back and refuses rather than save PNG bytes under a foreign extension, so a file
never lies about what it holds.

## Usage

1. Right-click an image on a page and choose **Convert to…** at the end of the menu. The
   app opens on its Images section with that image loaded. You can also open the app with
   the toolbar button or the keyboard shortcut, then work from there.

   | Platform | Default shortcut |
   |---|---|
   | Linux | `Ctrl+1` |
   | Windows | `Alt+1` |
   | macOS | `Control+1`, shown as `⌃1` |

2. Pick a format. The list starts on the format the image already is.
3. Change the name if you want. It starts from the image's own file name.
4. Press **Convert**. The preview switches to the result. Picking the format the image
   already is costs nothing: no permission, no download and no re-encoding.
5. Press **Download**. Before a conversion this saves the original file with its own
   extension; after one it saves the converted file.

## Settings

The app's own `⚙ Settings` section, also reachable from the Add-ons page.

- **Shortcut**: change the key combination, or turn it off.
- **Window**: the size and position the app opens at. **Use current** stores the window as
  it sits now. Leave X and Y empty to centre it.
- **Conversions**: give permission one time instead of once for each new site.
- **Theme**: follow the system light or dark theme, or force one of them.

## Install

The add-on is not on addons.mozilla.org yet.

### From source

1. Open `about:debugging` in Firefox.
2. Choose "This Firefox", then "Load Temporary Add-on".
3. Select the `manifest.json` file in this folder.

Firefox removes a temporary add-on when it closes.

## Permissions

At install:

- `menus`: put **Convert to…** on the image context menu.
- `downloads`: save the converted file.
- `storage`: remember the theme, the window size, and the width of the section list.

Asked for later, only when a conversion needs it:

- host access to one site, for example `https://cdn.example.com/*`. Converting an image
  means reading its bytes, and an image from another site taints the canvas, so the add-on
  has to fetch it instead. One site is asked for at a time, and Firefox remembers it.

You can give access to every site at once in Settings, and take it back there. The dialog
that appears also offers to drop the single sites you allowed before. After a download,
the Images section offers to drop the access that download used.

## Privacy

No data collection. Every conversion runs in your browser with Firefox's own encoders.
The add-on makes no network request of its own except fetching the image you picked, from
the site it is already on.

## Limitations

- AVIF and GIF cannot be written yet. They stay in the list, greyed out, rather than
  silently producing a PNG under the wrong name.
- ICO is limited to 256 px a side by the format itself. Larger images are scaled down and
  keep their aspect ratio.
- JPEG and BMP have no alpha channel, so transparency is filled with white rather than
  left black.
- JPEG and WEBP quality is fixed at 0.92.
- On Wayland a window is never told where it is, and cannot place itself. X and Y have no
  effect there, and **Use current** says so and keeps the size alone. X11, Windows and
  macOS are not affected.
- Firefox will not let an extension open `about:addons`, so permissions are managed inside
  the app rather than by linking to Firefox's own page.

## Development

There is no build step, no bundler and no dependencies. Every file is shipped as written.

Each piece of work lives in its own module, so a backend can be swapped without touching
the callers:

| File | Holds |
|---|---|
| `app.js`, `app.html` | the app shell and which section is visible |
| `convert.js` | the format table, file naming, and the conversion |
| `ico.js` | the ICO container |
| `access.js` | every host permission question |
| `images.js` | the Images section |
| `settings.js`, `geometry.js`, `shortcut.js`, `platform.js`, `theme.js` | Settings and what it stores |
| `background.js` | the context menu, the app window, and opening links |

Checks:

```sh
npx web-ext lint --source-dir .     # 0 errors expected
node --check <file>.js              # syntax
```

The behaviour is covered by harness pages that load the real modules against a stubbed
`browser` object and print their results with `dump()`. Screenshots cannot be used for
this: anything that finishes after the page's load event, which includes every
`canvas.toBlob`, is missed by a headless screenshot.

## Report a bug

Please [open an issue on GitHub](https://github.com/cadieuxpaquinr/convert-them-all/issues).

## Roadmap

- An offline encoder for AVIF and GIF.
- The Videos, Audio, Websites and Files sections.
- This add-on targets Firefox only. There is no intention of porting it to Chrome, Edge,
  Safari, or any other browser.
