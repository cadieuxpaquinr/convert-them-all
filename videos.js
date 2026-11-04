/*
 * The Videos pane: the video the "Convert to…" entry handed over, and nothing
 * more. There is no video converter yet, so this only shows what arrived.
 *
 * Same shape as images.js, so the conversion work has somewhere to land.
 */
(() => {
  const MAX_URL = 120;

  const el = {};
  let placeholder = "";

  function short(url) {
    return url.length > MAX_URL ? `${url.slice(0, MAX_URL)}…` : url;
  }

  function mount() {
    el.selection = document.getElementById("video-selection");
    el.preview = document.getElementById("video-preview");
    el.missing = document.getElementById("video-missing");

    placeholder = el.selection.textContent;

    // A video streamed in pieces has a blob: address that only its own page can
    // read, so failing to load is expected rather than exceptional.
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
    });

    // A thumbnail, never a player: seek a little way in so a frame is painted,
    // rather than the black one many files start with. Seeking rather than a
    // #t= fragment on the URL, which a blob: address will not take.
    el.preview.addEventListener("loadedmetadata", () => {
      const duration = el.preview.duration;
      const at = Number.isFinite(duration) ? Math.min(0.1, duration / 2) : 0.1;
      try {
        el.preview.currentTime = at;
      } catch (e) {
        // Some sources refuse to seek; the first frame will have to do.
      }
    });

    reset();
  }

  function clearPreview() {
    el.preview.hidden = true;
    el.preview.removeAttribute("src");
  }

  // Nothing handed over yet.
  function reset() {
    el.selection.textContent = placeholder;
    el.missing.hidden = true;
    clearPreview();
  }

  // No address at all is the certain case: a site that plays video in pieces
  // feeds the element directly and leaves nothing to point at. Saying so beats
  // leaving the pane looking as though the click did nothing.
  //
  // Anything else is judged by whether it loads, not by how it looks. A blob:
  // address can be perfectly good, from a picked file, or useless, from another
  // page, and only trying tells the two apart.
  function set(url) {
    if (!el.selection) return;
    if (!url) {
      el.selection.textContent =
        "That video has no address of its own. The site streams it in pieces, so there "
        + "is nothing here to show or to save.";
      el.missing.hidden = true;
      clearPreview();
      return;
    }
    el.selection.textContent = `Selected: ${short(url)}`;
    el.missing.hidden = true;
    el.preview.hidden = false;
    el.preview.src = url;
  }

  window.CTAVideos = { mount, set };
})();
