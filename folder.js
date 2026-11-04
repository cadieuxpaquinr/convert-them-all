/*
 * Where downloads go.
 *
 * An empty value means "wherever the helper puts things", which is the usual
 * Downloads folder and the only answer that works on a machine this add-on has
 * never seen. The helper checks the path again before using it, since a folder
 * can disappear between the saving and the download.
 */
(() => {
  const KEY = "downloadFolder";

  async function read() {
    const stored = await browser.storage.local.get(KEY);
    return typeof stored[KEY] === "string" ? stored[KEY].trim() : "";
  }

  function save(path) {
    return browser.storage.local.set({ [KEY]: String(path || "").trim() });
  }

  function clear() {
    return browser.storage.local.remove(KEY);
  }

  window.CTAFolder = { read, save, clear };
})();
