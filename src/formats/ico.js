/*
 * The ICO container.
 *
 * Firefox has no ICO encoder, but an ICO entry is allowed to hold a whole PNG
 * since Vista, so the payload is just the PNG the canvas already produced.
 * A side can be 256 pixels at most, which the caller enforces by scaling.
 */
(() => {
  const DIR = 6;
  const ENTRY = 16;
  const MAX = 256;

  function wrap(png, width, height) {
    const header = new ArrayBuffer(DIR + ENTRY);
    const head = new DataView(header);
    head.setUint16(0, 0, true);
    head.setUint16(2, 1, true);
    head.setUint16(4, 1, true);
    // A side of 256 is written as 0: the field is one byte.
    head.setUint8(6, width >= MAX ? 0 : width);
    head.setUint8(7, height >= MAX ? 0 : height);
    head.setUint8(8, 0);
    head.setUint8(9, 0);
    head.setUint16(10, 1, true);
    head.setUint16(12, 32, true);
    head.setUint32(14, png.byteLength, true);
    head.setUint32(18, DIR + ENTRY, true);
    return new Blob([header, png], { type: "image/x-icon" });
  }

  window.CTAIco = { MAX, wrap };
})();
