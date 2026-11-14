/*
 * A web page, turned into something saved.
 *
 * Four formats, and what each one is for:
 *
 *   single  everything the page needs inlined as data: URLs, so one file opens
 *           offline and still looks like the page
 *   html    the bytes the server sent, untouched
 *   txt     the words, for reading and searching
 *   md      the structure, for notes and diffs
 *
 * PDF is listed and greyed. The only way a Firefox add-on can make one is
 * tabs.saveAsPDF, which prints the tab that is open and in front; it cannot
 * take an address, so it does not fit this pane.
 *
 * Scripts never survive. They cannot work offline, and a saved page that still
 * runs someone else's code is a worse thing to keep than a page that does not.
 */
(() => {
  const FORMATS = [
    { id: "single", label: "HTML, single file", ext: "html", mime: "text/html",
      encoder: "single" },
    { id: "html", label: "HTML, as served", ext: "html", mime: "text/html",
      encoder: "raw" },
    { id: "txt", label: "Plain text", ext: "txt", mime: "text/plain",
      encoder: "text" },
    { id: "md", label: "Markdown", ext: "md", mime: "text/markdown",
      encoder: "markdown" },
    { id: "pdf-text", label: "PDF, text layout", ext: "pdf",
      mime: "application/pdf", encoder: "pdf" },
    // Firefox's own printer, which is the only faithful one there is. It can
    // only print the tab that is open and in front, so the pane greys it when
    // the address is anything else.
    { id: "pdf-print", label: "PDF, printed by Firefox", ext: "pdf",
      mime: "application/pdf", encoder: "print", needsTab: true }
  ];

  // Anything larger is left as a link rather than inlined: a data: URL is a
  // third bigger than the bytes it carries, and a page is not a disk image.
  const MAX_ASSET = 2 * 1024 * 1024;

  function format(id) {
    return FORMATS.find((f) => f.id === id) || null;
  }

  function available(target) {
    return !!(target && target.encoder);
  }

  function parse(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function absolute(value, base) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^(data|blob|javascript|mailto|tel):/i.test(text)) return "";
    try {
      return new URL(text, base).href;
    } catch (e) {
      return "";
    }
  }

  async function asDataUrl(url) {
    const answer = await fetch(url, { credentials: "omit" });
    if (!answer.ok) throw new Error(String(answer.status));
    const blob = await answer.blob();
    if (blob.size > MAX_ASSET) throw new Error("too big");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("unreadable"));
      reader.readAsDataURL(blob);
    });
  }

  // url(...) inside a stylesheet, resolved against the stylesheet's own address
  // rather than the page's, which is where a relative font or background lives.
  async function inlineCss(css, base) {
    const found = [...new Set(Array.from(css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi))
      .map((match) => match[1].trim())
      .filter((value) => value && !/^data:/i.test(value)))];
    let out = css;
    for (const value of found) {
      const target = absolute(value, base);
      if (!target) continue;
      try {
        const data = await asDataUrl(target);
        out = out.split(value).join(data);
      } catch (e) {
        // Left pointing at the live address, which is better than a page that
        // will not save because one font is missing.
      }
    }
    return out;
  }

  // Everything the page needs, pulled in. Each asset is attempted on its own:
  // one refusal costs that asset and nothing else.
  async function inline(doc, base, onStep) {
    for (const node of Array.from(doc.querySelectorAll("script"))) node.remove();
    // srcset would point at addresses the saved file cannot reach, and the
    // browser prefers it over the src that is about to be inlined.
    for (const node of Array.from(doc.querySelectorAll("[srcset]"))) {
      node.removeAttribute("srcset");
    }

    const sheets = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'));
    for (const node of sheets) {
      const href = absolute(node.getAttribute("href"), base);
      if (!href) continue;
      if (onStep) onStep(`style ${new URL(href).pathname.split("/").pop()}`);
      try {
        const answer = await fetch(href, { credentials: "omit" });
        if (!answer.ok) continue;
        const style = doc.createElement("style");
        style.textContent = await inlineCss(await answer.text(), href);
        node.replaceWith(style);
      } catch (e) {
        // Left as a link to the live stylesheet.
      }
    }

    for (const node of Array.from(doc.querySelectorAll("style"))) {
      node.textContent = await inlineCss(node.textContent, base);
    }

    const images = Array.from(doc.querySelectorAll("img[src]"));
    for (const node of images) {
      const src = absolute(node.getAttribute("src"), base);
      if (!src) continue;
      if (onStep) onStep(`image ${new URL(src).pathname.split("/").pop()}`);
      try {
        node.setAttribute("src", await asDataUrl(src));
      } catch (e) {
        node.setAttribute("src", src);
      }
    }

    for (const node of Array.from(doc.querySelectorAll('link[rel~="icon"][href]'))) {
      const href = absolute(node.getAttribute("href"), base);
      if (href) node.setAttribute("href", href);
    }
    return doc;
  }

  // Links are made absolute first, so a saved page always points somewhere
  // real; the crawl then replaces the ones it also saved with a local path.
  function settleLinks(doc, base, localFor) {
    for (const node of Array.from(doc.querySelectorAll("a[href]"))) {
      const raw = node.getAttribute("href");
      // A link to a place on this same page stays as it is.
      if (raw.startsWith("#")) continue;
      const href = absolute(raw, base);
      if (!href) continue;
      const local = localFor ? localFor(href) : "";
      node.setAttribute("href", local || href);
    }
    return doc;
  }

  function serialise(doc) {
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  }

  function textOf(doc) {
    const copy = doc.cloneNode(true);
    for (const node of Array.from(copy.querySelectorAll("script, style, noscript"))) {
      node.remove();
    }
    const title = (copy.title || "").trim();
    const body = (copy.body ? copy.body.innerText || copy.body.textContent : "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim();
    return title ? `${title}\n\n${body}\n` : `${body}\n`;
  }

  // One page, already fetched. localFor turns an address into the saved file's
  // relative path, or an empty string when the crawl did not save it.
  async function page(options) {
    const target = format(options.format);
    if (!available(target)) throw new Error("that format is not available yet");

    const base = options.url;
    if (target.encoder === "raw") {
      return new Blob([options.html], { type: `${target.mime};charset=utf-8` });
    }

    const doc = parse(options.html);
    if (target.encoder === "pdf") {
      return await CTAPdf.fromText({
        title: (doc.title || "").trim(),
        blocks: blocksOf(doc)
      });
    }
    if (target.encoder === "text") {
      return new Blob([textOf(doc)], { type: `${target.mime};charset=utf-8` });
    }
    if (target.encoder === "markdown") {
      settleLinks(doc, base, null);
      return new Blob([CTAMarkdown.of(doc, base)],
        { type: `${target.mime};charset=utf-8` });
    }

    settleLinks(doc, base, options.localFor);
    await inline(doc, base, options.onStep);
    return new Blob([serialise(doc)], { type: `${target.mime};charset=utf-8` });
  }

  // A page as a list of blocks, which is what the PDF writer lays out. The
  // walk is the same shape as the Markdown one: headings, paragraphs, lists
  // and code, and everything else is its text.
  function blocksOf(doc) {
    const blocks = [];
    const body = doc.body || doc;
    const wanted = "h1, h2, h3, h4, h5, h6, p, li, pre, blockquote";
    for (const node of Array.from(body.querySelectorAll(wanted))) {
      // A paragraph inside a list item would otherwise be written twice.
      if (node.parentElement && node.parentElement.closest("li, pre")) continue;
      const tag = node.tagName.toLowerCase();
      const text = tag === "pre"
        ? node.textContent.replace(/\s+$/, "")
        : node.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (tag === "pre") blocks.push({ type: "pre", text });
      else if (tag === "li") blocks.push({ type: "li", text });
      else if (tag === "blockquote") blocks.push({ type: "p", text });
      else if (tag === "h1" || tag === "h2") blocks.push({ type: "h2", text });
      else if (tag.startsWith("h")) blocks.push({ type: "h3", text });
      else blocks.push({ type: "p", text });
    }
    return blocks;
  }

  // The links worth following, in the order the page lists them.
  function linksIn(html, base) {
    const doc = parse(html);
    const out = [];
    for (const node of Array.from(doc.querySelectorAll("a[href]"))) {
      const href = absolute(node.getAttribute("href"), base);
      if (href) out.push(href.split("#")[0]);
    }
    return [...new Set(out)];
  }

  function titleOf(html) {
    return (parse(html).title || "").trim();
  }

  window.CTAWeb = {
    FORMATS, MAX_ASSET, format, available, page, linksIn, titleOf,
    parse, textOf, blocksOf, settleLinks, serialise
  };
})();
