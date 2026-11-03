/*
 * Width of the app's section list: the drag handle, the clamp, and the stored
 * value. The width lives in a CSS custom property on <html>, the same place
 * theme.js pins the theme.
 */
(() => {
  const KEY = "sidebarWidth";
  const DEFAULT = 170;
  const MIN = 120;
  const MAX = 400;

  // Clamped against the window too, so a wide sidebar saved on a large screen
  // cannot swallow the content pane in a small window.
  function limit(px) {
    const max = Math.max(MIN, Math.min(MAX, Math.round(window.innerWidth * 0.6)));
    return Math.max(MIN, Math.min(Math.round(px), max));
  }

  let width = DEFAULT;

  function paint(px) {
    width = limit(px);
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }

  async function load() {
    const stored = await browser.storage.local.get(KEY);
    paint(Number(stored[KEY]) || DEFAULT);
  }

  function save() {
    return browser.storage.local.set({ [KEY]: width });
  }

  // Pointer capture keeps the drag alive when the pointer outruns the 5px strip.
  function mount(handle) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {
        // The pointer is already gone; the drag still works, it just stops
        // tracking once it leaves the strip.
      }
      handle.dataset.dragging = "";
    });

    handle.addEventListener("pointermove", (e) => {
      if (!("dragging" in handle.dataset)) return;
      paint(e.clientX);
    });

    const end = () => {
      if (!("dragging" in handle.dataset)) return;
      delete handle.dataset.dragging;
      save().catch(() => {});
    };

    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    window.addEventListener("resize", () => paint(width));
  }

  window.CTASidebar = { DEFAULT, MIN, MAX, mount, load };
})();
