/*
 * Host access for conversions.
 *
 * Reading an image's bytes needs permission for the site it came from: a
 * cross-origin image taints the canvas, and nothing can be read back out of it.
 * One site is asked for at a time, so the add-on installs with no host access at
 * all. The Settings toggle swaps that for a single grant over every site.
 */
(() => {
  const ALL = { origins: ["<all_urls>"] };

  // Null when no permission is involved: a data: URL, or anything off the web.
  function originOf(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return `${parsed.protocol}//${parsed.hostname}/*`;
    } catch (e) {
      return null;
    }
  }

  // Call this straight from the click: Firefox only grants a request that is
  // still inside the user gesture that asked for it. Already granted, whether
  // for this site or for all of them, resolves true with no prompt.
  function request(url) {
    const origin = originOf(url);
    if (!origin) return Promise.resolve(true);
    return browser.permissions.request({ origins: [origin] });
  }

  function hasAll() {
    return browser.permissions.contains(ALL);
  }

  function requestAll() {
    return browser.permissions.request(ALL);
  }

  // Only the all-sites grant goes: single sites that were allowed one at a time
  // are separate grants, and are managed from the Add-ons page.
  function revokeAll() {
    return browser.permissions.remove(ALL);
  }

  function onChange(listener) {
    browser.permissions.onAdded.addListener(listener);
    browser.permissions.onRemoved.addListener(listener);
  }

  window.CTAAccess = { originOf, request, hasAll, requestAll, revokeAll, onChange };
})();
