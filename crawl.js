/*
 * How far a save reaches, and what it is allowed to follow.
 *
 * A whole site is almost never a whole host. The useful unit is a section:
 *
 *   https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/RealTimeKernel.html
 *   is read out of
 *   https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/
 *
 * so prefixes() offers every folder from the host down to the one holding the
 * page, and the user says how far up to go. under() then decides each link
 * against that choice.
 *
 * The policy is here and the fetching is not, so every rule about what is in
 * and what is out can be checked without a network.
 */
(() => {
  const SCOPES = [
    { id: "page", label: "This page only" },
    { id: "links", label: "This page and the links on it" },
    { id: "section", label: "The whole section" }
  ];

  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 2000;
  // A pause between pages. Enough that a crawl is a visitor rather than a
  // flood, short enough that fifty pages is under a minute.
  const PAUSE = 400;

  function parse(url) {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  // Every folder from the origin down to the one holding the page. The last one
  // is the narrowest, and is what the pane selects by default.
  function prefixes(url) {
    const parsed = parse(url);
    if (!parsed) return [];
    const steps = parsed.pathname.split("/").filter(Boolean);
    // A path ending in a file name is not itself a folder.
    const folders = /\/$/.test(parsed.pathname) ? steps : steps.slice(0, -1);

    const list = [`${parsed.origin}/`];
    let path = "";
    for (const step of folders) {
      path += `${step}/`;
      list.push(`${parsed.origin}/${path}`);
    }
    return list;
  }

  function deepest(url) {
    const list = prefixes(url);
    return list.length ? list[list.length - 1] : "";
  }

  // Same scheme, same host, and inside the folder. Compared as text after both
  // sides are parsed, so an escaped or odd-looking address cannot slip past by
  // spelling the prefix differently.
  function under(url, prefix) {
    const page = parse(url);
    const root = parse(prefix);
    if (!page || !root) return false;
    if (page.origin !== root.origin) return false;
    const base = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
    return page.pathname.startsWith(base);
  }

  // What a crawl treats as the same page: the fragment is part of the address
  // but never part of the document, so #install and #build are one page.
  function key(url) {
    const parsed = parse(url);
    if (!parsed) return "";
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  }

  // Links worth following: pages, not downloads. An address that plainly names
  // a file of another kind is left alone rather than fetched and parsed as if
  // it were markup.
  const NOT_A_PAGE =
    /\.(zip|gz|tar|7z|rar|pdf|png|jpe?g|gif|webp|svg|ico|avif|mp[34]|m4[av]|ogg|opus|flac|wav|webm|mov|mkv|css|js|json|xml|rss|atom|woff2?|ttf|eot|exe|dmg|deb|rpm|iso|img)$/i;

  function followable(url, prefix) {
    const parsed = parse(url);
    if (!parsed) return false;
    if (!under(url, prefix)) return false;
    return !NOT_A_PAGE.test(parsed.pathname);
  }

  // The list to save, from the page and whatever it links to. The caller does
  // the fetching; this decides the order, the bounds and the cap.
  //
  // page:    the one address
  // links:   the page, then the links on it that are inside the prefix
  // section: the same, and then the links on those, until nothing new is left
  function plan(scope, start, prefix, limit) {
    const cap = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return {
      scope,
      start,
      prefix,
      cap,
      // How deep links are followed. One for the page's own links, and no limit
      // for a whole section.
      depth: scope === "page" ? 0 : (scope === "links" ? 1 : Infinity)
    };
  }

  window.CTACrawl = {
    SCOPES, DEFAULT_LIMIT, MAX_LIMIT, PAUSE,
    prefixes, deepest, under, key, followable, plan
  };
})();
