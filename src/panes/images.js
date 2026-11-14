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
  // Smaller than this and a crop box is a smudge, not a selection.
  const MIN_CROP = 8;

  const el = {};
  let placeholder = "";
  let src = null;
  // What the last Convert produced. Dropped whenever a new image arrives.
  let result = null;
  // The source's own pixels, read from the preview rather than fetched: an
  // <img> knows its size without any permission, and a cross-origin image
  // would otherwise have to be downloaded just to be measured.
  let shape = null;
  // The crop, in source pixels, or null for the whole picture.
  let crop = null;
  let dragging = null;
  // More than one image at a time. The pane still shows one of them, which is
  // the one the settings are judged against; the rest ride on those settings.
  let queue = [];
  let stop = false;
  // Cropping is a mode, and has to be: a pointer press on a picture is a
  // native image drag, which takes the pointer away mid-crop. Turning the mode
  // on is what stops the browser doing that.
  let cropping = false;

  // A data: URL runs to megabytes, so only its head is shown.
  function short(url) {
    return url.length > MAX_URL ? `${url.slice(0, MAX_URL)}…` : url;
  }

  function size(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
  }

  function setStatus(message, isError) {
    CTAMessages.say(message, isError ? "error" : "ok");
  }

  function enable(on) {
    for (const node of [el.format, el.name, el.convert, el.download,
      el.width, el.height, el.lock, el.strip, el.cropX, el.cropY, el.cropW,
      el.cropH, el.cropClear, el.cropToggle]) {
      node.disabled = !on;
    }
  }

  // Where the picture really sits inside its box: an image smaller than the
  // box is centred, and one larger is scaled down, so neither the box nor the
  // natural size is the thing to measure against.
  function shown() {
    const box = el.box.getBoundingClientRect();
    const picture = el.preview.getBoundingClientRect();
    return {
      left: picture.left - box.left,
      top: picture.top - box.top,
      width: picture.width,
      height: picture.height
    };
  }

  function paintCrop() {
    const can = cropping && !!shape && !el.preview.hidden;
    el.box.classList.toggle("croppable", can);
    if (!can || !crop) {
      el.cropBox.hidden = true;
      return;
    }
    const at = shown();
    const scale = at.width / shape.width;
    el.cropBox.hidden = false;
    el.cropBox.style.left = `${at.left + crop.x * scale}px`;
    el.cropBox.style.top = `${at.top + crop.y * scale}px`;
    el.cropBox.style.width = `${Math.max(1, crop.width * scale)}px`;
    el.cropBox.style.height = `${Math.max(1, crop.height * scale)}px`;
  }

  function showCropFields() {
    el.cropX.value = crop ? Math.round(crop.x) : "";
    el.cropY.value = crop ? Math.round(crop.y) : "";
    el.cropW.value = crop ? Math.round(crop.width) : "";
    el.cropH.value = crop ? Math.round(crop.height) : "";
    el.cropHint.textContent = crop
      ? `Cropping ${Math.round(crop.width)} by ${Math.round(crop.height)} pixels `
        + `out of ${shape ? shape.width : "?"} by ${shape ? shape.height : "?"}.`
      : (cropping
        ? "Drag a box on the picture."
        : "Press Start cropping, then drag a box on the picture.");
  }

  function setCrop(next) {
    crop = next;
    showCropFields();
    paintCrop();
    showStripLabel();
  }

  function readCropFields() {
    const numbers = [el.cropX, el.cropY, el.cropW, el.cropH]
      .map((field) => Number(field.value));
    if (!numbers[2] || !numbers[3]) {
      setCrop(null);
      return;
    }
    setCrop({ x: numbers[0] || 0, y: numbers[1] || 0,
      width: numbers[2], height: numbers[3] });
  }

  // A point on the screen, in the source's own pixels.
  function toSource(event) {
    const at = shown();
    const box = el.box.getBoundingClientRect();
    const scale = shape.width / at.width;
    return {
      x: (event.clientX - box.left - at.left) * scale,
      y: (event.clientY - box.top - at.top) * scale
    };
  }

  function clamp(value, high) {
    return Math.max(0, Math.min(value, high));
  }

  function fromCorners(a, b) {
    const x = clamp(Math.min(a.x, b.x), shape.width);
    const y = clamp(Math.min(a.y, b.y), shape.height);
    const right = clamp(Math.max(a.x, b.x), shape.width);
    const bottom = clamp(Math.max(a.y, b.y), shape.height);
    return { x, y, width: right - x, height: bottom - y };
  }

  function onDown(event) {
    if (!cropping || !shape || el.preview.hidden) return;
    const grip = event.target.closest(".grip");
    const point = toSource(event);
    if (grip && crop) {
      // The corner opposite the one being dragged stays put.
      const side = grip.dataset.grip;
      dragging = {
        anchor: {
          x: side.includes("w") ? crop.x + crop.width : crop.x,
          y: side.includes("n") ? crop.y + crop.height : crop.y
        }
      };
    } else {
      dragging = { anchor: point };
    }
    // Capture keeps the drag alive past the edge of the box. A pointer that
    // has already gone cannot be captured, and that is not a reason to drop
    // the drag.
    try {
      el.box.setPointerCapture(event.pointerId);
    } catch (e) {
      // Carry on uncaptured.
    }
    event.preventDefault();
    setCrop(fromCorners(dragging.anchor, point));
  }

  function onMove(event) {
    if (!dragging) return;
    setCrop(fromCorners(dragging.anchor, toSource(event)));
  }

  // A drag too small to mean anything is a click, and a click clears the crop.
  function onUp(event) {
    if (!dragging) return;
    dragging = null;
    try {
      el.box.releasePointerCapture(event.pointerId);
    } catch (e) {
      // The pointer is already gone, which is the case this guards.
    }
    if (crop && (crop.width < MIN_CROP || crop.height < MIN_CROP)) setCrop(null);
  }

  function setCropping(on) {
    cropping = on;
    el.cropToggle.setAttribute("aria-pressed", String(on));
    el.cropToggle.textContent = on ? "Stop cropping" : "Start cropping";
    showCropFields();
    paintCrop();
  }

  // Which side the user typed last. With the shape locked the other side is
  // filled in for them, and that filled-in number belongs to the picture on
  // screen alone: handing both to a queue would force every image into the
  // shape of the first one.
  let typed = "width";

  // The size asked for, or null when the fields are empty.
  function wantedSize() {
    const width = Number(el.width.value) || 0;
    const height = Number(el.height.value) || 0;
    if (!width && !height) return null;
    if (el.lock.checked) {
      return typed === "height" && height ? { height } : { width: width || 0,
        height: width ? 0 : height };
    }
    return { width, height };
  }

  // With the shape locked, filling in one side fills in the other, so what the
  // fields say is what comes out.
  function echoSize(changed) {
    if (!el.lock.checked || !shape) return;
    const source = crop || { width: shape.width, height: shape.height };
    const value = Number(changed.value);
    if (!value) return;
    if (changed === el.width) {
      el.height.value = Math.max(1, Math.round((source.height * value) / source.width));
    } else {
      el.width.value = Math.max(1, Math.round((source.width * value) / source.height));
    }
  }

  // Says plainly whether pressing Convert will re-encode the picture.
  function showStripLabel() {
    if (!el.strip) return;
    const untouched = src && CTAConvert.lossless({
      url: src.url, name: src.name, format: el.format.value,
      strip: el.strip.checked, crop, resize: wantedSize()
    });
    el.stripLabel.textContent = untouched
      ? "Remove metadata, and nothing else: the picture is not re-encoded"
      : "Remove metadata";
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
    const resize = wantedSize();
    // Checked before anything is asked for or fetched: the image is already
    // what was asked for, and nothing else was asked for either, so there is
    // nothing to do. A crop, a size or a metadata strip all count as work.
    if (!crop && !resize && !el.strip.checked
      && CTAConvert.sameFormat(src.name, format.id)) {
      replaceResult(null);
      showPreview(src.url);
      hideForget();
      el.state.textContent = `Already ${format.label}, ready for download`;
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

    el.state.textContent = "Converting…";
    hideForget();
    el.convert.disabled = true;
    try {
      const next = await CTAConvert.run({
        url: src.url, name: src.name, format: format.id,
        crop, resize, strip: el.strip.checked
      });
      replaceResult(next);
      showPreview(next.url);
      if (next.lossless) {
        const what = next.removed.length
          ? next.removed.map((r) => r.name).join(", ")
          : "nothing";
        el.state.textContent =
          `Metadata removed (${what}) · ${size(next.size)} · not re-encoded`;
        setStatus(next.removed.length
          ? `Removed ${what}, and left the picture alone.`
          : "There was no metadata to remove.");
      } else {
        el.state.textContent =
          `Converted to ${format.label} · ${next.width}×${next.height} · ${size(next.size)}`;
        setStatus(`Converted to ${format.label}, ${size(next.size)}.`);
      }
      // The preview now shows the result, which the crop numbers do not
      // describe. They stay in the fields, so pressing Convert again does the
      // same thing, but the box comes off the picture.
      paintCrop();
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

  function paintQueue() {
    el.queue.hidden = queue.length < 2;
    el.queueList.textContent = "";
    for (const job of queue) {
      const row = document.createElement("div");
      const state = document.createElement("span");
      state.className = "state";
      state.dataset.state = job.state;
      state.textContent = job.state;
      const name = document.createElement("span");
      name.className = "path";
      name.textContent = job.name;
      const note = document.createElement("span");
      note.className = "size";
      note.textContent = job.note || "";
      row.append(state, name, note);
      el.queueList.appendChild(row);
    }
  }

  function clearQueue() {
    queue = [];
    paintQueue();
  }

  // Many files at once: the first is shown, and all of them are queued.
  function take(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    queue = list.map((file) => ({
      file, name: file.name, state: CTABatch.WAITING, note: ""
    }));
    loadFile(list[0]);
    paintQueue();
  }

  // The same, for images named by address rather than handed over as files.
  function takeUrls(urls) {
    const list = (urls || []).filter(Boolean);
    if (!list.length) return;
    queue = list.map((url) => ({
      url, name: CTAConvert.nameFrom(url) || "image", state: CTABatch.WAITING,
      note: ""
    }));
    set(list[0]);
    paintQueue();
  }

  async function convertOne(job) {
    const format = CTAConvert.format(el.format.value);
    const url = job.url || URL.createObjectURL(job.file);
    try {
      const granted = await CTAAccess.request(url).catch(() => false);
      if (!granted) throw new Error("permission refused");
      const made = await CTAConvert.run({
        url, name: job.file ? job.file.name : url, format: format.id,
        crop, resize: wantedSize(), strip: el.strip.checked
      });
      const filename = CTAConvert.fileName(
        CTAConvert.nameFrom(job.name), made.ext);
      return { made, filename };
    } finally {
      if (!job.url) setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  // Every image in the queue, one at a time, with the settings on screen.
  async function runQueue() {
    const format = CTAConvert.format(el.format.value);
    if (!CTAConvert.available(format)) {
      setStatus(`${format ? format.label : "That format"} is not available yet.`, true);
      return;
    }
    const zipping = el.output.value === "zip";
    const packed = [];
    stop = false;
    el.cancel.hidden = false;
    el.run.disabled = true;

    const result = await CTABatch.run({
      items: queue,
      stopped: () => stop,
      onStep: (line, jobs, job) => {
        job.note = job.state === CTABatch.WORKING ? "…" : job.note;
        queue[job.at].state = job.state;
        el.state.textContent = line;
        paintQueue();
      },
      worker: async (job) => {
        const out = await convertOne(job);
        if (zipping) {
          packed.push({ name: out.filename,
            bytes: new Uint8Array(await (await fetch(out.made.url)).arrayBuffer()) });
        } else {
          await browser.downloads.download({ url: out.made.url,
            filename: out.filename, saveAs: false });
        }
        setTimeout(() => URL.revokeObjectURL(out.made.url), 60000);
        return out.filename;
      }
    });

    for (const job of result.jobs) {
      queue[job.at].state = job.state;
      queue[job.at].note = job.error || (job.result ? "saved" : "");
    }
    paintQueue();

    if (zipping && packed.length) {
      const blob = await CTAZip.write(packed);
      const name = CTAConvert.fileName(el.name.value || "images", "zip");
      const url = URL.createObjectURL(blob);
      try {
        await browser.downloads.download({ url, filename: name, saveAs: false });
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      setStatus(`${CTABatch.summary(result, "image")} Packed into ${name}.`);
    } else {
      setStatus(CTABatch.summary(result, "image"), !!result.counts.failed);
    }
    el.cancel.hidden = true;
    el.run.disabled = false;
    el.state.textContent = "Original";
  }

  // The one way in. next is null, or { url, name, label, owned }.
  function load(next) {
    if (!el.selection) return;
    replaceSource(next);
    replaceResult(null);
    el.selection.textContent = src ? `Selected: ${src.label}` : placeholder;
    el.state.textContent = "Original";
    hideForget();
    enable(!!src);
    // A new picture is a new set of pixels: the old crop and the old size
    // would mean something else on it.
    shape = null;
    el.width.value = "";
    el.height.value = "";
    setCrop(null);
    setCropping(false);

    if (!src) {
      clearPreview();
      return;
    }
    el.name.value = CTAConvert.nameFrom(src.name);
    // A source in a format that cannot be written yet falls back to the first.
    const guess = CTAConvert.formatFrom(src.name);
    el.format.value = CTAConvert.available(guess) ? guess.id : CTAConvert.FORMATS[0].id;
    showPreview(src.url);
    showStripLabel();
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
    el.forget = document.getElementById("forget-site");
    el.forgetText = document.getElementById("forget-text");
    el.forgetButton = document.getElementById("forget-button");
    el.box = document.getElementById("preview-box");
    el.cropBox = document.getElementById("crop-box");
    el.cropHint = document.getElementById("crop-hint");
    el.width = document.getElementById("size-width");
    el.height = document.getElementById("size-height");
    el.lock = document.getElementById("size-lock");
    el.strip = document.getElementById("strip-meta");
    el.stripLabel = document.getElementById("strip-label");
    el.cropX = document.getElementById("crop-x");
    el.cropY = document.getElementById("crop-y");
    el.cropW = document.getElementById("crop-w");
    el.cropH = document.getElementById("crop-h");
    el.cropClear = document.getElementById("crop-clear");
    el.cropToggle = document.getElementById("crop-toggle");
    el.queue = document.getElementById("image-queue");
    el.queueList = document.getElementById("queue-list");
    el.output = document.getElementById("queue-output");
    el.run = document.getElementById("queue-run");
    el.cancel = document.getElementById("queue-cancel");
    el.clear = document.getElementById("queue-clear");

    placeholder = el.selection.textContent;

    fillFormats();
    el.format.value = CTAConvert.FORMATS[0].id;

    el.pick.addEventListener("click", () => el.file.click());

    el.file.addEventListener("change", () => {
      const files = Array.from(el.file.files);
      // Cleared so that picking the same file twice still fires a change.
      el.file.value = "";
      if (files.length) take(files);
    });

    el.convert.addEventListener("click", convert);
    el.download.addEventListener("click", download);
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
      shape = null;
      paintCrop();
    });
    // The size is read from the picture itself once it is on screen, which
    // needs no permission: an <img> knows how big it is even cross-origin.
    el.preview.addEventListener("load", () => {
      if (result) return;
      shape = { width: el.preview.naturalWidth, height: el.preview.naturalHeight };
      showCropFields();
      paintCrop();
      showStripLabel();
    });

    el.box.addEventListener("pointerdown", onDown);
    el.box.addEventListener("pointermove", onMove);
    el.box.addEventListener("pointerup", onUp);
    el.box.addEventListener("pointercancel", onUp);
    // The box is drawn in the picture's own pixels, so it has to be redrawn
    // when the picture is given more or less room.
    window.addEventListener("resize", () => paintCrop());

    for (const field of [el.cropX, el.cropY, el.cropW, el.cropH]) {
      field.addEventListener("change", readCropFields);
    }
    el.cropClear.addEventListener("click", () => setCrop(null));
    el.cropToggle.addEventListener("click", () => setCropping(!cropping));
    // The preview is never draggable. There is nowhere useful to drag it to:
    // the picture is already in the app, and a press on it is either a crop or
    // nothing. Dragging it was what interrupted every crop.
    el.preview.draggable = false;
    el.box.addEventListener("dragstart", (e) => e.preventDefault());
    el.width.addEventListener("input", () => {
      typed = "width";
      echoSize(el.width);
      showStripLabel();
    });
    el.height.addEventListener("input", () => {
      typed = "height";
      echoSize(el.height);
      showStripLabel();
    });
    el.strip.addEventListener("change", showStripLabel);
    el.run.addEventListener("click", () => runQueue().catch(() => {}));
    el.cancel.addEventListener("click", () => { stop = true; });
    el.clear.addEventListener("click", clearQueue);
    el.format.addEventListener("change", showStripLabel);

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
    showCropFields();
  }

  // What the background hands over: a page image, named after its own URL.
  function set(url) {
    load(url ? { url, name: url, label: short(url) } : null);
  }

  window.CTAImages = { mount, set, file: loadFile, take, takeUrls };
})();
