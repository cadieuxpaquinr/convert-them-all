(() => {
  const KEY = "theme";
  const VALUES = ["system", "light", "dark"];

  function paint(value) {
    if (value === "light" || value === "dark") {
      document.documentElement.dataset.theme = value;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  async function current() {
    const stored = await browser.storage.local.get(KEY);
    return VALUES.includes(stored[KEY]) ? stored[KEY] : "system";
  }

  async function apply() {
    const value = await current();
    paint(value);
    return value;
  }

  async function set(value) {
    await browser.storage.local.set({ [KEY]: value });
    paint(value);
  }

  // Keeps an open settings window and the menu in step with a change made elsewhere.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) paint(changes[KEY].newValue);
  });

  window.CTATheme = { current, apply, set };
  // A failed read just means following the system, which is the CSS default.
  apply().catch(() => {});
})();
