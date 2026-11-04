/*
 * The Images pane: the image the "Convert to…" entry handed over, the format
 * and name to give it, and the download. Mounted by app.js.
 *
 * The conversion itself lives in convert.js and is a pass-through for now, so
 * Convert leaves the preview on the original and Download saves the source file.
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

  async function convert() {
    const format = CTAConvert.format(el.format.value);
    try {
      result = await CTAConvert.run({ url: source, format: el.format.value });
    } catch (e) {
      setStatus("Could not convert that image.", true);
      return;
    }
    showPreview(result.url);
    el.state.textContent = result.converted
      ? `Converted to ${format.label}`
      : `Converted to ${format.label} (placeholder: the image is unchanged)`;
    setStatus("");
  }

  // Downloading before converting saves the source, which is also what a
  // conversion gives back today.
  async function download() {
    let target = result;
    try {
      if (!target) target = await CTAConvert.run({ url: source, format: el.format.value });
    } catch (e) {
      setStatus("Could not convert that image.", true);
      return;
    }
    const filename = CTAConvert.fileName(el.name.value, target.ext);
    try {
      await browser.downloads.download({ url: target.url, filename, saveAs: false });
      setStatus(`Saved as ${filename}.`);
    } catch (e) {
      setStatus("Could not save that image.", true);
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

    placeholder = el.selection.textContent;

    for (const format of CTAConvert.FORMATS) {
      const option = document.createElement("option");
      option.value = format.id;
      option.textContent = format.label;
      el.format.appendChild(option);
    }
    el.format.value = CTAConvert.FORMATS[0].id;

    el.convert.addEventListener("click", convert);
    el.download.addEventListener("click", download);
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
    });

    enable(false);
    clearPreview();
  }

  function set(url) {
    if (!el.selection) return;
    source = url || "";
    result = null;
    el.selection.textContent = source ? `Selected: ${short(source)}` : placeholder;
    el.state.textContent = "Original";
    setStatus("");
    enable(!!source);

    if (!source) {
      clearPreview();
      return;
    }
    el.name.value = CTAConvert.nameFrom(source);
    const guess = CTAConvert.formatFrom(source);
    el.format.value = guess ? guess.id : CTAConvert.FORMATS[0].id;
    showPreview(source);
  }

  window.CTAImages = { mount, set };
})();
