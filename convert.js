/*
 * Image formats, file naming, and the conversion itself. Everything runs in the
 * browser; nothing is uploaded anywhere.
 *
 * Measured on Firefox 158, not assumed: the canvas encodes PNG, JPEG, WEBP and
 * BMP. For any other type it quietly hands back PNG, which would save PNG bytes
 * under a foreign extension, so toBlob() checks what it got. ICO has its own
 * container in ico.js. AVIF and GIF have no offline encoder yet and are marked
 * unavailable instead of being faked.
 */
(() => {
  const QUALITY = 0.92;

  // encoder: "canvas" uses the browser, "ico" uses ico.js, null means the
  // format is listed but cannot be produced yet.
  // opaque: the encoder drops the alpha channel, so the canvas is filled first.
  const FORMATS = [
    { id: "png", label: "PNG", mime: "image/png", ext: "png", encoder: "canvas" },
    { id: "jpeg", label: "JPEG", mime: "image/jpeg", ext: "jpg", encoder: "canvas",
      opaque: true },
    { id: "webp", label: "WEBP", mime: "image/webp", ext: "webp", encoder: "canvas" },
    { id: "avif", label: "AVIF", mime: "image/avif", ext: "avif", encoder: null },
    { id: "gif", label: "GIF", mime: "image/gif", ext: "gif", encoder: null },
    { id: "bmp", label: "BMP", mime: "image/bmp", ext: "bmp", encoder: "canvas",
      opaque: true },
    { id: "ico", label: "ICO", mime: "image/x-icon", ext: "ico", encoder: "ico" }
  ];

  const ALIASES = { jpg: "jpeg", jpe: "jpeg", jfif: "jpeg" };

  function format(id) {
    return FORMATS.find((f) => f.id === id) || null;
  }

  // The last path segment. URL drops the query and the fragment, which is what
  // keeps "cat.png?v=3" from becoming an extension of "png?v=3".
  function unescape(text) {
    try {
      return decodeURIComponent(text);
    } catch (e) {
      // A stray % that is not an escape.
      return text;
    }
  }

  function segment(url) {
    const text = String(url || "");
    if (/^data:/i.test(text)) return "";
    try {
      return unescape(new URL(text).pathname.split("/").pop() || "");
    } catch (e) {
      // Not an absolute URL. Take the last segment by hand rather than giving
      // up, so a relative src still names the file after the image.
      return unescape(text.split(/[?#]/)[0].split("/").pop() || "");
    }
  }

  function dataExtension(url) {
    const match = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(url || "");
    if (!match) return "";
    const known = FORMATS.find((f) => f.mime === `image/${match[1].toLowerCase()}`);
    if (known) return known.ext;
    return /^[a-z0-9]{1,5}$/.test(match[1]) ? match[1].toLowerCase() : "";
  }

  function extensionFrom(url) {
    const name = segment(url);
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : dataExtension(url);
  }

  function nameFrom(url) {
    const name = segment(url);
    const dot = name.lastIndexOf(".");
    return (dot > 0 ? name.slice(0, dot) : name) || "image";
  }

  // Which of the seven the source already is, so the list can preselect it.
  function formatFrom(url) {
    const ext = extensionFrom(url);
    return format(ALIASES[ext] || ext) || FORMATS.find((f) => f.ext === ext) || null;
  }

  // Firefox refuses a path, so only a bare name survives. An allow-list is used
  // rather than a list of forbidden characters: it also drops the control
  // characters and the separators of every platform. Leading dots go too, since
  // they would hide the file and they are what is left of "../".
  function fileName(name, ext) {
    const clean = String(name || "")
      .replace(/[^\p{L}\p{N} ._-]+/gu, "")
      .replace(/^[.\s]+|[.\s]+$/g, "")
      .slice(0, 100);
    return `${clean || "image"}.${ext || "img"}`;
  }

  function available(target) {
    return !!(target && target.encoder);
  }

  // Read from the URL alone, so an image that is already in the format asked for
  // costs no permission, no download and no encode. That matters on a slow
  // machine, and re-encoding would only lose quality.
  function sameFormat(url, id) {
    const current = formatFrom(url);
    return !!current && current.id === id;
  }

  // Fetched rather than put in an <img>: a cross-origin image taints the canvas
  // and then nothing can be read back out of it.
  async function bitmapFrom(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    return createImageBitmap(await response.blob());
  }

  function draw(bitmap, width, height, opaque) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (opaque) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  }

  function toBlob(canvas, mime) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("the image could not be encoded"));
        } else if (blob.type !== mime) {
          // The silent PNG fallback. Refusing here is what keeps the extension
          // from lying about the file.
          reject(new Error(`this Firefox cannot write ${mime}`));
        } else {
          resolve(blob);
        }
      }, mime, QUALITY);
    });
  }

  async function toIco(bitmap) {
    const scale = Math.min(1, CTAIco.MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const png = await toBlob(draw(bitmap, width, height, false), "image/png");
    return CTAIco.wrap(await png.arrayBuffer(), width, height);
  }

  async function run({ url, format: id }) {
    const target = format(id);
    if (!target) throw new Error("unknown format");
    if (!available(target)) throw new Error(`${target.label} is not available yet`);

    const bitmap = await bitmapFrom(url);
    try {
      const blob = target.encoder === "ico"
        ? await toIco(bitmap)
        : await toBlob(
          draw(bitmap, bitmap.width, bitmap.height, target.opaque), target.mime);
      return {
        url: URL.createObjectURL(blob),
        format: target,
        ext: target.ext,
        size: blob.size,
        width: bitmap.width,
        height: bitmap.height,
        converted: true
      };
    } finally {
      bitmap.close();
    }
  }

  window.CTAConvert = {
    FORMATS, format, formatFrom, nameFrom, extensionFrom, fileName, available,
    sameFormat, run
  };
})();
