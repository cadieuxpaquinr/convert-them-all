/*
 * Where yt-dlp and ffmpeg are, when they are not on the PATH.
 *
 * A program downloaded from its own site lands in Downloads, and the helper
 * looks on the PATH. Rather than tell someone to edit their PATH before the
 * add-on will work, the add-on takes the path to the file and hands it over
 * with every request.
 *
 * Empty means "look on the PATH", which is the right answer on a machine where
 * either was installed properly, and the one the app recommends.
 */
(() => {
  const KEY = "toolPaths";
  const EMPTY = { ytdlp: "", ffmpeg: "" };

  function clean(value) {
    return String(value || "").trim();
  }

  async function read() {
    let stored = {};
    try {
      stored = (await browser.storage.local.get(KEY))[KEY] || {};
    } catch (e) {
      stored = {};
    }
    return { ytdlp: clean(stored.ytdlp), ffmpeg: clean(stored.ffmpeg) };
  }

  // What rides along on a request. Nothing is sent when nothing is set, so a
  // helper that has never heard of this sees exactly what it saw before.
  async function forRequest() {
    const paths = await read().catch(() => EMPTY);
    return paths.ytdlp || paths.ffmpeg ? paths : null;
  }

  function save(paths) {
    return browser.storage.local.set({
      [KEY]: { ytdlp: clean(paths.ytdlp), ffmpeg: clean(paths.ffmpeg) }
    });
  }

  function clear() {
    return browser.storage.local.remove(KEY);
  }

  window.CTATools = { EMPTY, read, forRequest, save, clear };
})();
