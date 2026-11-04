/*
 * Image formats, file naming, and the conversion seam.
 *
 * run() is the only place an encoder goes. It hands the source back untouched
 * today: the add-on has to work fully offline, so the library is not picked yet.
 * A real encoder returns a blob URL, the target extension, and converted: true,
 * which every caller already handles.
 */
(() => {
  const FORMATS = [
    { id: "png", label: "PNG", mime: "image/png", ext: "png" },
    { id: "jpeg", label: "JPEG", mime: "image/jpeg", ext: "jpg" },
    { id: "webp", label: "WEBP", mime: "image/webp", ext: "webp" },
    { id: "avif", label: "AVIF", mime: "image/avif", ext: "avif" },
    { id: "gif", label: "GIF", mime: "image/gif", ext: "gif" },
    { id: "bmp", label: "BMP", mime: "image/bmp", ext: "bmp" },
    { id: "ico", label: "ICO", mime: "image/x-icon", ext: "ico" }
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

  async function run({ url, format: id }) {
    const target = format(id);
    return {
      url,
      format: target,
      ext: extensionFrom(url) || (target && target.ext) || "img",
      converted: false
    };
  }

  window.CTAConvert = {
    FORMATS, format, formatFrom, nameFrom, extensionFrom, fileName, run
  };
})();
