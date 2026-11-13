/*
 * Taking the metadata out of a JPEG without touching the picture.
 *
 * Converting an image already drops every piece of metadata, because a canvas
 * keeps none: that is a side effect of re-encoding, and re-encoding costs
 * quality. This walks the segments instead and rewrites the file without the
 * ones that carry information about you, leaving the compressed image data
 * exactly as it was. The result is byte-for-byte the same picture.
 *
 * What goes:
 *   APP1   Exif and XMP. Camera, lens, software, dates, and the GPS position.
 *   APP13  IPTC and Photoshop resources, which carry author and caption.
 *   COM    free-text comments.
 *
 * What stays, on purpose:
 *   APP0   the JFIF header, which some old readers want to see.
 *   APP2   the ICC colour profile. Dropping it changes how the picture looks,
 *          which is the one thing this must not do.
 *
 * No DOM, no canvas: a byte array in, a byte array out.
 */
(() => {
  const SOI = 0xd8;
  const SOS = 0xda;
  const EOI = 0xd9;
  const APP1 = 0xe1;
  const APP13 = 0xed;
  const COM = 0xfe;

  const NAMES = { 0xe1: "Exif or XMP", 0xed: "IPTC", 0xfe: "comment" };
  const DROP = new Set([APP1, APP13, COM]);

  function isJpeg(bytes) {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === SOI;
  }

  // A marker with no length word of its own: the padding byte, the start and
  // end of the file, and the restart markers.
  function standalone(marker) {
    return marker === SOI || marker === EOI || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7);
  }

  function strip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!isJpeg(bytes)) throw new Error("that is not a JPEG");

    const keep = [bytes.subarray(0, 2)];
    const removed = [];
    let at = 2;

    while (at < bytes.length) {
      if (bytes[at] !== 0xff) throw new Error("this JPEG is damaged");
      // A run of 0xff before a marker is padding, and is allowed.
      let mark = at + 1;
      while (mark < bytes.length && bytes[mark] === 0xff) mark += 1;
      const marker = bytes[mark];
      if (marker === undefined) throw new Error("this JPEG ends mid-marker");

      if (standalone(marker)) {
        keep.push(bytes.subarray(at, mark + 1));
        at = mark + 1;
        continue;
      }

      const lengthAt = mark + 1;
      if (lengthAt + 1 >= bytes.length) throw new Error("this JPEG ends mid-marker");
      const length = (bytes[lengthAt] << 8) | bytes[lengthAt + 1];
      if (length < 2) throw new Error("this JPEG is damaged");
      const end = lengthAt + length;
      if (end > bytes.length) throw new Error("this JPEG ends mid-segment");

      if (DROP.has(marker)) {
        removed.push({ marker, name: NAMES[marker] || "metadata", bytes: length + 2 });
      } else {
        keep.push(bytes.subarray(at, end));
      }
      at = end;

      // Everything after the start of a scan is compressed picture, and is
      // copied whole: there are no more segments to read in it.
      if (marker === SOS) {
        keep.push(bytes.subarray(at));
        at = bytes.length;
      }
    }

    let size = 0;
    for (const part of keep) size += part.length;
    const out = new Uint8Array(size);
    let written = 0;
    for (const part of keep) {
      out.set(part, written);
      written += part.length;
    }
    return { bytes: out, removed, saved: bytes.length - out.length };
  }

  // What is in there, without rewriting anything.
  function find(input) {
    try {
      return strip(input).removed;
    } catch (e) {
      return [];
    }
  }

  window.CTAJpegMeta = { isJpeg, strip, find };
})();
