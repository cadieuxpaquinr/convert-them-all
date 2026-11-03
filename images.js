/*
 * The Images pane: what the "Convert to…" context menu entry handed over.
 * Mounted by app.js.
 */
(() => {
  const MAX = 120;

  // A data: URL runs to megabytes, so only its head is shown.
  function short(url) {
    return url.length > MAX ? `${url.slice(0, MAX)}…` : url;
  }

  let element = null;
  let placeholder = "";

  function mount() {
    element = document.getElementById("image-selection");
    placeholder = element.textContent;
  }

  function set(url) {
    if (!element) return;
    element.textContent = url ? `Selected: ${short(url)}` : placeholder;
  }

  window.CTAImages = { mount, set };
})();
