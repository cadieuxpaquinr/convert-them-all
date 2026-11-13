/*
 * The Files pane. There is no feature here yet, so all it does is own what a
 * drop leaves with it.
 *
 * A file that is not an image has to land somewhere. Sending it here, named,
 * says the app saw it and has nothing to offer, which is better than a drop
 * that appears to do nothing at all.
 */
(() => {
  const el = {};

  function size(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} kB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  function mount() {
    el.dropped = document.getElementById("file-dropped");
    el.dropped.hidden = true;
  }

  function set(file) {
    if (!el.dropped) return;
    if (!file) {
      el.dropped.hidden = true;
      return;
    }
    const parts = [file.name, size(file.size), file.type].filter(Boolean);
    el.dropped.textContent =
      `You dropped ${parts.join(", ")}. There is nothing to convert it to yet.`;
    el.dropped.hidden = false;
  }

  window.CTAFiles = { mount, set };
})();
