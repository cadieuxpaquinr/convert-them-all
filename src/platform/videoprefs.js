/*
 * The format and options last chosen for a video, so the panels open where they
 * were left rather than resetting to webm every time the app opens.
 *
 * Only what CTAVideoFormat.defaults() names is kept: a stored value for
 * anything else is dropped, so an older or newer version of the add-on cannot
 * leave a field holding something the panels do not understand.
 */
(() => {
  const KEY = "videoFormat";

  async function read() {
    const base = CTAVideoFormat.defaults();
    let stored = {};
    try {
      stored = (await browser.storage.local.get(KEY))[KEY] || {};
    } catch (e) {
      stored = {};
    }
    const kept = {};
    for (const field of Object.keys(base)) {
      if (field in stored) kept[field] = stored[field];
    }
    return Object.assign(base, kept);
  }

  function save(choice) {
    const base = CTAVideoFormat.defaults();
    const kept = {};
    for (const field of Object.keys(base)) {
      kept[field] = field in choice ? choice[field] : base[field];
    }
    return browser.storage.local.set({ [KEY]: kept });
  }

  window.CTAVideoPrefs = { read, save };
})();
