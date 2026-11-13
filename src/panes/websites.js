/*
 * The Websites pane: an address, how far to reach, and what to save.
 *
 * The reach is the whole point. A page is instant and safe; a section can be
 * hundreds of requests to someone else's server, so it is bounded twice, by a
 * prefix the user chooses and by a count, and it asks before it starts.
 *
 * Fetching needs permission for the host, asked for from the Save click
 * because Firefox only grants a request still inside the gesture. The crawl
 * stays on one host, so one grant covers all of it; an asset on another host
 * is attempted and left as a live link when it is refused.
 */
(() => {
  const el = {};
  let placeholder = "";
  let scope = "page";
  let stop = null;
  // Every page this run intends to save, address to local path. A link is
  // rewritten against this rather than against what is already written: a page
  // saved early links to one saved later, and both end up in the same folder.
  // A page the cap keeps out never enters it, so its links stay live rather
  // than pointing at a file that was never fetched.
  let planned = new Map();
  // What really landed, for the list the pane shows.
  let saved = [];
  // The address Firefox has in front of the user, which is the only thing its
  // own printer can turn into a PDF.
  let inFront = "";

  function setProgress(text) {
    el.progress.textContent = text || "";
    el.progress.hidden = !text;
  }

  function busy(on) {
    el.save.disabled = on;
    el.detect.disabled = on;
    el.url.disabled = on;
    el.cancel.hidden = !on;
  }

  function fillFormats() {
    for (const target of CTAWeb.FORMATS) {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = CTAWeb.available(target)
        ? target.label
        : `${target.label} - COMING SOON`;
      option.disabled = !CTAWeb.available(target);
      el.format.appendChild(option);
    }
    el.format.value = CTAWeb.FORMATS[0].id;
  }

  // Firefox can only print the page it is showing. The entry stays visible so
  // it can be found, and says why it is shut when the address is elsewhere.
  function paintPrintable() {
    const target = CTAWeb.FORMATS.find((f) => f.needsTab);
    const option = [...el.format.options].find((o) => o.value === target.id);
    const ready = inFront && el.url.value.trim() === inFront;
    option.disabled = !ready;
    option.textContent = ready
      ? target.label
      : `${target.label} - only the tab in front`;
    if (!ready && el.format.value === target.id) el.format.value = "single";
  }

  // The address of the tab in front, asked for once and whenever it might
  // have changed, so the printed entry knows whether it can be offered.
  async function lookAtTab() {
    try {
      const answer = await browser.runtime.sendMessage({ type: "active-url" });
      inFront = (answer && answer.url) || "";
    } catch (e) {
      inFront = "";
    }
    paintPrintable();
  }

  function fillScopes() {
    for (const entry of CTACrawl.SCOPES) {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "site-scope";
      input.value = entry.id;
      input.checked = entry.id === scope;
      input.addEventListener("change", () => {
        scope = entry.id;
        paintReach();
      });
      const text = document.createElement("span");
      text.textContent = entry.label;
      row.append(input, text);
      if (entry.id === "page") {
        const why = document.createElement("span");
        why.className = "why";
        why.textContent = "recommended";
        row.appendChild(why);
      }
      el.scopes.appendChild(row);
    }
  }

  // The ladder of folders, narrowest first in the user's mind but listed from
  // the host down, which is how an address reads.
  function paintPrefixes() {
    const list = CTACrawl.prefixes(el.url.value.trim());
    el.prefix.textContent = "";
    for (const prefix of list) {
      const option = document.createElement("option");
      option.value = prefix;
      option.textContent = prefix;
      el.prefix.appendChild(option);
    }
    if (list.length) el.prefix.value = list[list.length - 1];
  }

  function paintReach() {
    el.reach.hidden = scope === "page";
    if (!el.reach.hidden && !el.prefix.options.length) paintPrefixes();
  }

  function showSaved() {
    el.saved.textContent = saved.join("\n");
    el.details.hidden = !saved.length;
  }

  // Asked once, before a long run, and only for the widest reach.
  function agree(prefix, cap) {
    return new Promise((resolve) => {
      el.warnWhat.textContent =
        `Everything under ${prefix}, up to ${cap} pages.`;
      const no = () => { el.warning.close(); resolve(false); };
      const yes = () => { el.warning.close(); resolve(true); };
      el.warningNo.addEventListener("click", no, { once: true });
      el.warningYes.addEventListener("click", yes, { once: true });
      el.warning.addEventListener("cancel", no, { once: true });
      el.warning.showModal();
    });
  }

  async function fetchPage(url) {
    const answer = await fetch(url, { credentials: "omit" });
    if (!answer.ok) throw new Error(`the server answered ${answer.status}`);
    const type = answer.headers.get("content-type") || "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) {
      throw new Error(`that address is ${type.split(";")[0]}, not a page`);
    }
    return await answer.text();
  }

  // The name a page ends up with: the extension follows the format, not the
  // address, so an .html page saved as Markdown is a .md file.
  function pathFor(url, target) {
    return CTASitePath.of(url).replace(/\.[a-z0-9]+$/i, `.${target.ext}`);
  }

  async function save(url, html, target, order) {
    const blob = await CTAWeb.page({
      url,
      html,
      format: target.id,
      localFor: (href) => CTASitePath.relative(
        pathFor(url, target), planned.get(CTACrawl.key(href)) || ""),
      onStep: (what) => setProgress(`${order}, ${what}…`)
    });
    const path = pathFor(url, target);
    const objectUrl = URL.createObjectURL(blob);
    try {
      await browser.downloads.download({
        url: objectUrl, filename: path, saveAs: false, conflictAction: "overwrite"
      });
    } finally {
      // Firefox reads the blob after download() resolves, so it is let go a
      // little later rather than at once.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    return path;
  }

  async function run(start, target) {
    const prefix = scope === "page" ? "" : el.prefix.value;
    const plan = CTACrawl.plan(scope, start, prefix, el.limit.value);
    const queue = [{ url: start, depth: 0 }];
    let done = 0;
    let stopped = "";
    // Pages the cap kept out, counted once each however many pages link to
    // them.
    const dropped = new Set();

    planned.set(CTACrawl.key(start), pathFor(start, target));

    while (queue.length) {
      if (stop) { stopped = "Stopped."; break; }
      const item = queue.shift();
      const name = item.url.split("/").pop() || item.url;
      const order = plan.depth === 0
        ? "Saving"
        : `${done + 1} of ${planned.size}, ${name}`;
      setProgress(`${order}…`);

      let html = "";
      try {
        html = await fetchPage(item.url);
      } catch (e) {
        // One page that will not come is not the end of a crawl, but it is the
        // end of a single-page save.
        if (plan.depth === 0) throw e;
        CTAMessages.say(`Skipped ${name}: ${e.message}`, true);
        continue;
      }

      // The links are read and planned before the page is written, so a page
      // can point at a sibling that has not been fetched yet.
      if (item.depth < plan.depth) {
        for (const href of CTAWeb.linksIn(html, item.url)) {
          const key = CTACrawl.key(href);
          if (!key || planned.has(key)) continue;
          if (!CTACrawl.followable(href, plan.prefix)) continue;
          if (planned.size >= plan.cap) { dropped.add(key); continue; }
          planned.set(key, pathFor(href, target));
          queue.push({ url: href, depth: item.depth + 1 });
        }
      }

      saved.push(await save(item.url, html, target, order));
      done += 1;
      showSaved();
      if (queue.length && !stop) {
        await new Promise((r) => setTimeout(r, CTACrawl.PAUSE));
      }
    }

    if (!stopped && dropped.size) {
      stopped = `Stopped at ${plan.cap} pages, which is the limit set. `
        + `${dropped.size} more ${dropped.size === 1 ? "was" : "were"} left out.`;
    }
    return { done, stopped };
  }

  async function start() {
    const url = el.url.value.trim();
    if (!CTACrawl.prefixes(url).length) {
      CTAMessages.say("Paste a web address first, or detect the page you are "
        + "reading.", true);
      return;
    }
    const target = CTAWeb.format(el.format.value);
    if (!CTAWeb.available(target)) {
      CTAMessages.say(`${target ? target.label : "That format"} is not available `
        + "yet.", true);
      return;
    }

    // Handed straight to Firefox, which opens its own save dialog. Nothing is
    // fetched, nothing is parsed, and no permission is needed: it is printing
    // a page it is already showing.
    if (target.encoder === "print") {
      const answer = await browser.runtime.sendMessage({ type: "print-pdf", url })
        .catch(() => null);
      if (!answer || !answer.ok) {
        CTAMessages.say(answer && answer.reason === "not-in-front"
          ? "Firefox can only print the page it is showing. Open that page in "
            + "front, or use the text layout."
          : "Firefox would not print that page.", true);
        return;
      }
      CTAMessages.say("Firefox is saving the page it is showing.");
      return;
    }

    // Nothing may be awaited before this: the grant has to happen inside the
    // click that asked for it.
    let granted = false;
    try {
      granted = await CTAAccess.request(url);
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      CTAMessages.say("Firefox needs permission to read that site.", true);
      return;
    }

    if (scope === "section") {
      const cap = CTACrawl.plan(scope, url, el.prefix.value, el.limit.value).cap;
      if (!await agree(el.prefix.value, cap)) {
        scope = "page";
        for (const input of el.scopes.querySelectorAll("input")) {
          input.checked = input.value === "page";
        }
        paintReach();
      }
    }

    stop = null;
    planned = new Map();
    saved = [];
    showSaved();
    busy(true);
    try {
      const result = await run(url, target);
      if (result.stopped) CTAMessages.say(result.stopped, result.stopped !== "Stopped.");
      CTAMessages.say(result.done === 1
        ? `Saved 1 page under Downloads/${CTASitePath.ROOT}.`
        : `Saved ${result.done} pages under Downloads/${CTASitePath.ROOT}.`);
    } catch (e) {
      CTAMessages.say(`Could not save that page: ${e.message}`, true);
    } finally {
      busy(false);
      setProgress("");
    }
  }

  // The app window is a popup and never the active tab, so the background
  // reads the address from the last normal window.
  async function detect() {
    let answer = null;
    try {
      answer = await browser.runtime.sendMessage({ type: "active-url" });
    } catch (e) {
      answer = null;
    }
    if (!answer || !answer.url) {
      CTAMessages.say("No page to read. Open one in a normal window first.", true);
      return;
    }
    el.url.value = answer.url;
    inFront = answer.url;
    paintPrefixes();
    paintPrintable();
    el.selection.textContent = answer.title
      ? `From: ${answer.title}`
      : `From: ${answer.url}`;
  }

  function mount() {
    el.selection = document.getElementById("site-selection");
    el.url = document.getElementById("site-url");
    el.detect = document.getElementById("site-detect");
    el.save = document.getElementById("site-save");
    el.cancel = document.getElementById("site-cancel");
    el.format = document.getElementById("site-format");
    el.scopes = document.getElementById("site-scopes");
    el.reach = document.getElementById("site-reach");
    el.prefix = document.getElementById("site-prefix");
    el.limit = document.getElementById("site-limit");
    el.progress = document.getElementById("site-progress");
    el.details = document.getElementById("site-details");
    el.saved = document.getElementById("site-saved");
    el.warning = document.getElementById("site-warning");
    el.warnWhat = document.getElementById("site-warning-what");
    el.warningNo = document.getElementById("site-warning-no");
    el.warningYes = document.getElementById("site-warning-yes");

    placeholder = el.selection.textContent;

    fillFormats();
    fillScopes();
    paintReach();

    el.url.addEventListener("change", () => {
      paintPrefixes();
      paintPrintable();
      el.selection.textContent = placeholder;
    });
    el.url.addEventListener("input", paintPrintable);
    el.detect.addEventListener("click", () => detect().catch(() => {}));
    el.save.addEventListener("click", () => start().catch(() => {}));
    el.cancel.addEventListener("click", () => { stop = true; });
    el.url.addEventListener("keydown", (e) => {
      if (e.key === "Enter") start().catch(() => {});
    });

    busy(false);
    setProgress("");
    lookAtTab().catch(() => {});
  }

  // The address of a page, from wherever the app was told to look.
  function set(url) {
    if (!el.url || !url) return;
    el.url.value = url;
    paintPrefixes();
  }

  window.CTAWebsites = { mount, set };
})();
