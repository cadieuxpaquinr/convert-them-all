/*
 * Position and size of the app window.
 *
 * Read by the background script when it opens the window and written by the
 * Settings pane, so both sides share one validation path. Every value is clamped
 * against the screen here, which is what keeps a window saved off-screen, or
 * saved at 1x1, from being unreachable later.
 *
 * left and top are optional: absent means the caller centres the window.
 */
(() => {
  const KEY = "windowGeometry";
  const DEFAULT = { width: 900, height: 600 };
  const MIN = { width: 400, height: 300 };

  function integer(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  function size(value, fallback, min, available) {
    const n = integer(value);
    if (n === null) return fallback;
    return Math.max(min, Math.min(n, available));
  }

  function position(value, extent, available) {
    const n = integer(value);
    if (n === null) return null;
    return Math.max(0, Math.min(n, Math.max(0, available - extent)));
  }

  function normalize(raw) {
    const g = raw && typeof raw === "object" ? raw : {};
    const out = {
      width: size(g.width, DEFAULT.width, MIN.width, screen.availWidth),
      height: size(g.height, DEFAULT.height, MIN.height, screen.availHeight)
    };
    const left = position(g.left, out.width, screen.availWidth);
    const top = position(g.top, out.height, screen.availHeight);
    if (left !== null) out.left = left;
    if (top !== null) out.top = top;
    return out;
  }

  async function read() {
    const stored = await browser.storage.local.get(KEY);
    return normalize(stored[KEY]);
  }

  // Returns what was really stored, so the form can repaint the clamped values
  // rather than the ones that were typed.
  async function save(raw) {
    const value = normalize(raw);
    await browser.storage.local.set({ [KEY]: value });
    return value;
  }

  async function reset() {
    await browser.storage.local.remove(KEY);
    return normalize(null);
  }

  window.CTAGeometry = { DEFAULT, MIN, normalize, read, save, reset };
})();
