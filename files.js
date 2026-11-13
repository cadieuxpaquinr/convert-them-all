/*
 * The Files pane. There is nothing to convert a file to here yet, so all it
 * does is take one in and say what it is holding.
 *
 * It is also the catch-all: a file that is neither an image nor audio lands
 * here, named, which is better than a drop that appears to do nothing. The
 * picker accepts anything, and what the user picks is routed by kind like
 * everything else, so an image chosen here still reaches the Images pane.
 */
(() => {
  const el = {};
  let picked = null;

  function size(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} kB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  function mount() {
    el.dropped = document.getElementById("file-dropped");
    el.pick = document.getElementById("pick-any");
    el.file = document.getElementById("any-file");

    el.pick.addEventListener("click", () => el.file.click());
    el.file.addEventListener("change", () => {
      const file = el.file.files[0];
      // Cleared so that picking the same file twice still fires a change.
      el.file.value = "";
      if (file && picked) picked(file, "files");
    });

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
      `You have ${parts.join(", ")}. There is nothing to convert it to yet.`;
    el.dropped.hidden = false;
  }

  // The shell routes what is picked, because only it knows the other panes.
  function onPick(handler) {
    picked = handler;
  }

  window.CTAFiles = { mount, set, onPick };
})();
