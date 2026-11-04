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

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return "";
    }
  }

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

  // The sites allowed one at a time. contains() cannot answer this: it says yes
  // to every origin once <all_urls> is granted, so the real list is read instead.
  async function grantedSites() {
    const all = await browser.permissions.getAll();
    return (all.origins || []).filter((origin) => origin !== "<all_urls>");
  }

  // True only when dropping this one site would really take access away. While
  // the all-sites grant is on it would change nothing, so the answer is no even
  // if the site also appears in the list.
  async function hasSite(url) {
    const origin = originOf(url);
    if (!origin) return false;
    if (await hasAll()) return false;
    return (await grantedSites()).includes(origin);
  }

  function revokeSite(url) {
    const origin = originOf(url);
    if (!origin) return Promise.resolve(false);
    return browser.permissions.remove({ origins: [origin] });
  }

  async function revokeSites() {
    const sites = await grantedSites();
    if (!sites.length) return true;
    return browser.permissions.remove({ origins: sites });
  }

  function onChange(listener) {
    browser.permissions.onAdded.addListener(listener);
    browser.permissions.onRemoved.addListener(listener);
  }

  window.CTAAccess = {
    hostOf, originOf, request, hasAll, requestAll, revokeAll,
    grantedSites, hasSite, revokeSite, revokeSites, onChange
  };
})();
