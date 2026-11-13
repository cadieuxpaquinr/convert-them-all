/*
 * The Images pane: the image to work on, the format and name to give it, the
 * conversion, and the download.
 *
 * An image arrives from the "Convert to…" context menu or from the file picker.
 * The two are kept apart in one place: src.url is what gets read, src.name is
 * what the name and the format are taken from. For a file those differ, since
 * the URL is a blob with no name in it.
 *
 * The encoding itself lives in convert.js.
 */
(() => {
  const MAX_URL = 120;

  const el = {};
  let placeholder = "";
  let src = null;
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

  function hideForget() {
    el.forget.hidden = true;
  }

  // The converted image is a blob held by this page until it is let go.
  function replaceResult(next) {
    if (result && result.converted) URL.revokeObjectURL(result.url);
    result = next;
  }

  // So is a picked file, which is why owned says who made the URL.
  function replaceSource(next) {
    if (src && src.owned) URL.revokeObjectURL(src.url);
    src = next;
  }

  // Offered only when there is really something to drop: a site allowed on its
  // own. A file or a data: image granted nothing, and the all-sites grant was
  // deliberate and belongs to Settings.
  async function offerForget() {
    let granted = false;
    try {
      granted = await CTAAccess.hasSite(src.url);
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      hideForget();
      return;
    }
    el.forgetText.textContent =
      `The add-on no longer needs access to ${CTAAccess.hostOf(src.url)}. You can remove `
      + "it; converting another image from that site will ask for it again. "
      + "This is optional.";
    el.forget.hidden = false;
  }

  async function convert() {
    const format = CTAConvert.format(el.format.value);
    if (!CTAConvert.available(format)) {
      setStatus(`${format ? format.label : "That format"} is not available yet.`, true);
      return;
    }
    // Checked before anything is asked for or fetched: the image is already
    // what was asked for, so there is nothing to do.
    if (CTAConvert.sameFormat(src.name, format.id)) {
      replaceResult(null);
      showPreview(src.url);
      hideForget();
      el.state.textContent = `Already ${format.label}, ready for download`;
      setStatus("");
      return;
    }

    // Nothing may be awaited before this: Firefox only grants a permission
    // request that is still inside the click that asked for it. A file needs no
    // permission, and request() says so without a prompt.
    let granted = false;
    try {
      granted = await CTAAccess.request(src.url);
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
      const next = await CTAConvert.run({ url: src.url, format: format.id });
      replaceResult(next);
      showPreview(next.url);
      el.state.textContent =
        `Converted to ${format.label} · ${next.width}×${next.height} · ${size(next.size)}`;
      setStatus("");
    } catch (e) {
      setStatus(`Could not convert: ${e.message}`, true);
    } finally {
      el.convert.disabled = !src;
    }
  }

  // Before a conversion this saves the original, which is why it carries the
  // source extension rather than the one picked in the list.
  async function download() {
    const target = result || {
      url: src.url,
      ext: CTAConvert.extensionFrom(src.name) || "img"
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

  // The one way in. next is null, or { url, name, label, owned }.
  function load(next) {
    if (!el.selection) return;
    replaceSource(next);
    replaceResult(null);
    el.selection.textContent = src ? `Selected: ${src.label}` : placeholder;
    el.state.textContent = "Original";
    setStatus("");
    hideForget();
    enable(!!src);

    if (!src) {
      clearPreview();
      return;
    }
    el.name.value = CTAConvert.nameFrom(src.name);
    // A source in a format that cannot be written yet falls back to the first.
    const guess = CTAConvert.formatFrom(src.name);
    el.format.value = CTAConvert.available(guess) ? guess.id : CTAConvert.FORMATS[0].id;
    showPreview(src.url);
  }

  // A file the user picks or drops needs no permission at all: the gesture is
  // the consent, and the bytes are handed over with it.
  function loadFile(file) {
    if (file.type && !file.type.startsWith("image/")) {
      setStatus(`${file.name} is not an image.`, true);
      return;
    }
    load({
      url: URL.createObjectURL(file),
      name: file.name,
      label: file.name,
      owned: true
    });
  }

  function mount() {
    el.selection = document.getElementById("image-selection");
    el.pick = document.getElementById("pick-file");
    el.file = document.getElementById("image-file");
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

    el.pick.addEventListener("click", () => el.file.click());

    el.file.addEventListener("change", () => {
      const file = el.file.files[0];
      // Cleared so that picking the same file twice still fires a change.
      el.file.value = "";
      if (file) loadFile(file);
    });

    el.convert.addEventListener("click", convert);
    el.download.addEventListener("click", download);
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
    });

    el.forgetButton.addEventListener("click", async () => {
      const host = CTAAccess.hostOf(src.url);
      try {
        await CTAAccess.revokeSite(src.url);
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

  // What the background hands over: a page image, named after its own URL.
  function set(url) {
    load(url ? { url, name: url, label: short(url) } : null);
  }

  // Said after the image is in, so it is not mistaken for a failure.
  function note(message) {
    setStatus(message);
  }

  window.CTAImages = { mount, set, file: loadFile, note };
})();
