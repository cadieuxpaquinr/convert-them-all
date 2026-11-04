/*
 * The Images pane: the image the "Convert to…" entry handed over, the format
 * and name to give it, the conversion, and the download.
 *
 * The encoding itself lives in convert.js. Formats with no offline encoder are
 * listed but cannot be picked.
 */
(() => {
  const MAX_URL = 120;

  const el = {};
  let placeholder = "";
  let source = "";
  // What the last Convert produced. Dropped whenever a new image arrives.
  let result = null;

  // A data: URL runs to megabytes, so only its head is shown.
  function short(url) {
    return url.length > MAX_URL ? `${url.slice(0, MAX_URL)}…` : url;
  }

  function size(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle("error", !!isError);
  }

  function enable(on) {
    for (const node of [el.format, el.name, el.convert, el.download]) {
      node.disabled = !on;
    }
  }

  function showPreview(url) {
    el.missing.hidden = true;
    el.preview.hidden = false;
    el.preview.src = url;
  }

  function clearPreview() {
    el.preview.hidden = true;
    el.preview.removeAttribute("src");
    el.missing.hidden = true;
  }

  // The converted image is a blob held by this page until it is let go.
  function replaceResult(next) {
    if (result && result.converted) URL.revokeObjectURL(result.url);
    result = next;
  }

  async function convert() {
    const format = CTAConvert.format(el.format.value);
    if (!CTAConvert.available(format)) {
      setStatus(`${format ? format.label : "That format"} is not available yet.`, true);
      return;
    }
    // Checked before anything is asked for or fetched: the image is already
    // what was asked for, so there is nothing to do.
    if (CTAConvert.sameFormat(source, format.id)) {
      replaceResult(null);
      showPreview(source);
      hideForget();
      el.state.textContent = `Already ${format.label}, ready for download`;
      setStatus("");
      return;
    }

    // Nothing may be awaited before this: Firefox only grants a permission
    // request that is still inside the click that asked for it.
    let granted = false;
    try {
      granted = await CTAAccess.request(source);
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      setStatus("Firefox needs permission to read that image.", true);
      return;
    }

    setStatus("Converting…");
    hideForget();
    el.convert.disabled = true;
    try {
      const next = await CTAConvert.run({ url: source, format: format.id });
      replaceResult(next);
      showPreview(next.url);
      el.state.textContent =
        `Converted to ${format.label} · ${next.width}×${next.height} · ${size(next.size)}`;
      setStatus("");
    } catch (e) {
      setStatus(`Could not convert: ${e.message}`, true);
    } finally {
      el.convert.disabled = !source;
    }
  }

  function hideForget() {
    el.forget.hidden = true;
  }

  // Offered only when there is really something to drop: a site allowed on its
  // own. A data: image granted nothing, and the all-sites grant was deliberate
  // and belongs to Settings.
  async function offerForget() {
    let granted = false;
    try {
      granted = await CTAAccess.hasSite(source);
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      hideForget();
      return;
    }
    el.forgetText.textContent =
      `The add-on no longer needs access to ${CTAAccess.hostOf(source)}. You can remove `
      + "it; converting another image from that site will ask for it again. "
      + "This is optional.";
    el.forget.hidden = false;
  }

  // Before a conversion this saves the original, which is why it carries the
  // source extension rather than the one picked in the list.
  async function download() {
    const target = result || {
      url: source,
      ext: CTAConvert.extensionFrom(source) || "img"
    };
    const filename = CTAConvert.fileName(el.name.value, target.ext);
    try {
      await browser.downloads.download({ url: target.url, filename, saveAs: false });
      setStatus(`Saved as ${filename}.`);
      await offerForget();
    } catch (e) {
      setStatus("Could not save that image.", true);
    }
  }

  function fillFormats() {
    for (const format of CTAConvert.FORMATS) {
      const option = document.createElement("option");
      option.value = format.id;
      option.textContent = CTAConvert.available(format)
        ? format.label
        : `${format.label} - COMING SOON`;
      option.disabled = !CTAConvert.available(format);
      el.format.appendChild(option);
    }
  }

  function mount() {
    el.selection = document.getElementById("image-selection");
    el.preview = document.getElementById("image-preview");
    el.missing = document.getElementById("preview-missing");
    el.state = document.getElementById("preview-state");
    el.format = document.getElementById("format");
    el.name = document.getElementById("image-name");
    el.convert = document.getElementById("convert");
    el.download = document.getElementById("download");
    el.status = document.getElementById("image-status");
    el.forget = document.getElementById("forget-site");
    el.forgetText = document.getElementById("forget-text");
    el.forgetButton = document.getElementById("forget-button");

    placeholder = el.selection.textContent;

    fillFormats();
    el.format.value = CTAConvert.FORMATS[0].id;

    el.convert.addEventListener("click", convert);
    el.download.addEventListener("click", download);
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
    });

    el.forgetButton.addEventListener("click", async () => {
      const host = CTAAccess.hostOf(source);
      try {
        await CTAAccess.revokeSite(source);
        setStatus(`Access to ${host} removed.`);
      } catch (e) {
        setStatus("Could not remove that permission.", true);
      }
      hideForget();
    });

    enable(false);
    clearPreview();
    hideForget();
  }

  function set(url) {
    if (!el.selection) return;
    source = url || "";
    replaceResult(null);
    el.selection.textContent = source ? `Selected: ${short(source)}` : placeholder;
    el.state.textContent = "Original";
    setStatus("");
    hideForget();
    enable(!!source);

    if (!source) {
      clearPreview();
      return;
    }
    el.name.value = CTAConvert.nameFrom(source);
    // A source in a format that cannot be written yet falls back to the first.
    const guess = CTAConvert.formatFrom(source);
    el.format.value = CTAConvert.available(guess) ? guess.id : CTAConvert.FORMATS[0].id;
    showPreview(source);
  }

  window.CTAImages = { mount, set };
})();
