/*
 * What a file is, and which section deals with it.
 *
 * A file arrives three ways now: dropped on the window, picked in Files, or
 * picked in Audio. All three ask this, so a png behaves the same whichever door
 * it came through.
 *
 * The type the file carries is believed first, since the system that wrote it
 * knows better than its name does. The extension is the fallback, because a
 * file dragged out of an archive or off a plain server often arrives with no
 * type at all.
 *
 * A video file is deliberately "other": the Videos pane downloads from a link
 * and can do nothing with a file on disk, so sending one there would be a dead
 * end dressed up as a feature.
 */
(() => {
  const EXTENSIONS = {
    image: ["png", "jpg", "jpeg", "jfif", "webp", "bmp", "gif", "avif", "ico",
      "svg", "tif", "tiff", "heic", "heif"],
    audio: ["mp3", "wav", "wave", "flac", "ogg", "oga", "opus", "m4a", "aac",
      "weba", "wma", "aiff", "aif", "mka"],
    archive: ["zip", "tar", "gz", "tgz", "tbz", "bz2", "xz", "7z", "rar"]
  };

  // An archive's type is often missing or wrong, and the names it goes by are
  // many, so these are checked before the loose prefix rules below.
  const ARCHIVE_TYPES = new Set([
    "application/zip", "application/x-zip-compressed", "application/x-tar",
    "application/gzip", "application/x-gzip", "application/x-compressed-tar"
  ]);

  const SECTIONS = { image: "images", audio: "audio", archive: "archives",
    other: "files" };
  const NOUNS = { image: "an image", audio: "an audio file",
    archive: "an archive", other: "a file" };

  function extensionOf(name) {
    const dot = String(name || "").lastIndexOf(".");
    if (dot <= 0) return "";
    const ext = name.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
  }

  function of(file) {
    if (!file) return "other";
    const type = String(file.type || "").toLowerCase();
    if (ARCHIVE_TYPES.has(type)) return "archive";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("audio/")) return "audio";
    // A type that says something else is trusted as much as one that says
    // image: video/mp4 is not an audio file, whatever the name suggests.
    if (type) return "other";

    const ext = extensionOf(file.name);
    if (EXTENSIONS.image.includes(ext)) return "image";
    if (EXTENSIONS.audio.includes(ext)) return "audio";
    if (EXTENSIONS.archive.includes(ext)) return "archive";
    return "other";
  }

  function section(kind) {
    return SECTIONS[kind] || SECTIONS.other;
  }

  function noun(kind) {
    return NOUNS[kind] || NOUNS.other;
  }

  window.CTAKind = { of, section, noun };
})();
