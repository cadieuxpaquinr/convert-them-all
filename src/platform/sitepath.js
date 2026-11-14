/*
 * Where a saved page goes on disk, and how one saved page points at another.
 *
 * An address is not a path. It can end in a directory, carry a query, repeat a
 * name under a different case, or hold characters no file system wants. All of
 * that is decided here, in one place, because a crawl has to agree with itself:
 * the path a page is saved at and the path a link is rewritten to must come out
 * the same from the same address.
 *
 * Nothing here touches the DOM or the network, so every rule can be checked
 * without a browser.
 */
(() => {
  const ROOT = "convert-them-all";
  // Long enough for a real title in a path segment, short enough that a deep
  // tree stays under the limits every file system has.
  const MAX_SEGMENT = 80;

  // Allowed through: letters, numbers, and the three marks a file name can
  // carry safely. Everything else becomes a dash, which keeps a separator, a
  // control character and a colon from ever reaching the path.
  function safe(segment) {
    const clean = String(segment)
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^[.\s-]+|[\s-]+$/g, "")
      .slice(0, MAX_SEGMENT);
    return clean || "page";
  }

  function unescape(text) {
    try {
      return decodeURIComponent(text);
    } catch (e) {
      return text;
    }
  }

  // A query makes two different pages share one address but not one file, so it
  // is kept, flattened into the name.
  function withQuery(name, search) {
    if (!search || search === "?") return name;
    const tail = safe(search.slice(1)).slice(0, 40);
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)}-${tail}${name.slice(dot)}`
      : `${name}-${tail}`;
  }

  // The parts of the path, with the file name last. A directory address, or one
  // with no extension, becomes index.html: that is what a browser asks for and
  // what opening the folder should give back.
  function parts(url) {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch (e) {
      return null;
    }
    // javascript:void(0) parses perfectly well and has a pathname. Nothing but
    // the web is ever saved or linked to.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const steps = parsed.pathname.split("/").filter(Boolean).map(unescape);
    const last = steps.length ? steps[steps.length - 1] : "";
    const isFile = last.includes(".") && !parsed.pathname.endsWith("/");

    const folders = (isFile ? steps.slice(0, -1) : steps).map(safe);
    let name = isFile ? safe(last) : "index.html";
    // A page saved as "guide" and a folder also called "guide" would collide,
    // so anything without an extension is written as a page inside itself.
    if (isFile && !/\.[a-z0-9]{1,8}$/i.test(name)) name = `${name}.html`;

    return {
      host: safe(parsed.hostname),
      folders,
      name: withQuery(name, parsed.search)
    };
  }

  // Where the file lands, under Firefox's own download folder.
  function of(url) {
    const found = parts(url);
    if (!found) return "";
    return [ROOT, found.host, ...found.folders, found.name].join("/");
  }

  // The hop from one saved file to another, as a relative path, so the whole
  // tree can be moved or opened from anywhere. Both sides are paths, not
  // addresses, because the name on disk follows the format chosen and not the
  // extension the address happened to carry.
  function relative(fromPath, toPath) {
    if (!fromPath || !toPath) return "";
    const here = String(fromPath).split("/").slice(0, -1);
    const there = String(toPath).split("/");
    const name = there.pop();
    let same = 0;
    while (same < here.length && same < there.length && here[same] === there[same]) {
      same += 1;
    }
    const steps = [];
    for (let i = same; i < here.length; i += 1) steps.push("..");
    for (let i = same; i < there.length; i += 1) steps.push(there[i]);
    steps.push(name);
    return steps.join("/");
  }

  // The same, for two addresses that have not been through a format yet.
  function between(fromUrl, toUrl) {
    return relative(of(fromUrl), of(toUrl));
  }

  window.CTASitePath = { ROOT, of, between, relative, parts, safe };
})();
