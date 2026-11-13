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
  // A canvas larger than this is refused by Firefox and would fail late, with
  // a blank result rather than a reason.
  const MAX_SIDE = 16384;

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

  // An SVG has no pixels until something decides how big it is, and Firefox
  // refuses it outright through createImageBitmap: measured on 159, every SVG
  // comes back "The image could not be decoded". An <img> reads it, and a blob
  // URL we made ourselves does not taint the canvas, so that is the way in.
  // One without a width and a height reports 300 by 150, which is Firefox's
  // default rather than anything the file said.
  function svgPicture(blob) {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({
        source: image,
        width: image.naturalWidth || 300,
        height: image.naturalHeight || 150,
        scalable: true,
        close: () => URL.revokeObjectURL(url)
      });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("that SVG could not be read"));
      };
      image.src = url;
    });
  }

  // Fetched rather than put in an <img>: a cross-origin image taints the canvas
  // and then nothing can be read back out of it.
  async function pictureFrom(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    const blob = await response.blob();
    if (/^image\/svg/i.test(blob.type)) return svgPicture(blob);
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      scalable: false,
      close: () => bitmap.close()
    };
  }

  // The part of the source to take, in source pixels, and the size to put it
  // at. Both are already settled by now: plan() does the arithmetic, this only
  // draws.
  function draw(picture, area, opaque) {
    const canvas = document.createElement("canvas");
    canvas.width = area.width;
    canvas.height = area.height;
    const context = canvas.getContext("2d");
    if (opaque) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, area.width, area.height);
    }
    context.drawImage(picture.source,
      area.sx, area.sy, area.sw, area.sh,
      0, 0, area.width, area.height);
    return canvas;
  }

  // Crop first, in the source's own pixels, then size what is left. A crop
  // outside the picture is pulled back inside rather than refused: a box
  // dragged past the edge means the edge.
  function plan(picture, options) {
    const crop = options.crop || null;
    const sx = crop ? Math.max(0, Math.min(Math.round(crop.x), picture.width - 1)) : 0;
    const sy = crop ? Math.max(0, Math.min(Math.round(crop.y), picture.height - 1)) : 0;
    const sw = crop
      ? Math.max(1, Math.min(Math.round(crop.width), picture.width - sx))
      : picture.width;
    const sh = crop
      ? Math.max(1, Math.min(Math.round(crop.height), picture.height - sy))
      : picture.height;

    const wanted = options.resize || null;
    let width = sw;
    let height = sh;
    if (wanted && (wanted.width || wanted.height)) {
      if (wanted.width && wanted.height) {
        width = Math.round(wanted.width);
        height = Math.round(wanted.height);
      } else if (wanted.width) {
        width = Math.round(wanted.width);
        height = Math.max(1, Math.round((sh * width) / sw));
      } else {
        height = Math.round(wanted.height);
        width = Math.max(1, Math.round((sw * height) / sh));
      }
    }
    return {
      sx, sy, sw, sh,
      width: Math.max(1, Math.min(width, MAX_SIDE)),
      height: Math.max(1, Math.min(height, MAX_SIDE))
    };
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

  async function toIco(picture, area) {
    const scale = Math.min(1, CTAIco.MAX / Math.max(area.width, area.height));
    const width = Math.max(1, Math.round(area.width * scale));
    const height = Math.max(1, Math.round(area.height * scale));
    const sized = Object.assign({}, area, { width, height });
    const png = await toBlob(draw(picture, sized, false), "image/png");
    return { blob: await CTAIco.wrap(await png.arrayBuffer(), width, height),
      width, height };
  }

  // The whole picture kept, and only the metadata taken out. Nothing is
  // decoded and nothing is re-encoded, so the result is the same photograph,
  // not a copy of it.
  async function stripOnly(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const out = CTAJpegMeta.strip(bytes);
    const blob = new Blob([out.bytes], { type: "image/jpeg" });
    return { blob, removed: out.removed, saved: out.saved };
  }

  // What a conversion would really do, before it is done, for the pane to say
  // so: whether anything is being re-encoded at all.
  function lossless(options) {
    const target = format(options.format);
    return !!target && target.id === "jpeg" && !!options.strip
      && !options.crop && !options.resize
      && sameFormat(options.name || options.url, "jpeg");
  }

  async function run(options) {
    const target = format(options.format);
    if (!target) throw new Error("unknown format");
    if (!available(target)) throw new Error(`${target.label} is not available yet`);

    if (lossless(options)) {
      const out = await stripOnly(options.url);
      return {
        url: URL.createObjectURL(out.blob),
        format: target,
        ext: target.ext,
        size: out.blob.size,
        removed: out.removed,
        lossless: true,
        converted: true
      };
    }

    const picture = await pictureFrom(options.url);
    try {
      const area = plan(picture, options);
      const made = target.encoder === "ico"
        ? await toIco(picture, area)
        : { blob: await toBlob(draw(picture, area, target.opaque), target.mime),
          width: area.width, height: area.height };
      return {
        url: URL.createObjectURL(made.blob),
        format: target,
        ext: target.ext,
        size: made.blob.size,
        width: made.width,
        height: made.height,
        source: { width: picture.width, height: picture.height },
        lossless: false,
        converted: true
      };
    } finally {
      picture.close();
    }
  }

  // What the pane needs to fill its fields in: the size the source really is.
  async function measure(url) {
    const picture = await pictureFrom(url);
    const size = { width: picture.width, height: picture.height,
      scalable: picture.scalable };
    picture.close();
    return size;
  }

  window.CTAConvert = {
    MAX_SIDE, FORMATS, format, formatFrom, nameFrom, extensionFrom, fileName,
    available, sameFormat, plan, lossless, measure, run
  };
})();
