/*
 * Writing a WAV file from samples.
 *
 * This is the one audio format a browser can really produce. MediaRecorder,
 * measured on Firefox 159, writes Opus and nothing else: audio/mpeg, audio/wav
 * and audio/mp4 are all refused. WAV needs no encoder at all, only a header and
 * the samples, so it is written here by hand.
 *
 * Plain arrays in, a Blob out, and no AudioContext anywhere: every bit depth
 * can then be checked without a browser.
 */
(() => {
  const DEPTHS = [16, 24, 32];
  // 32-bit is written as float, which is what the samples already are, so
  // nothing is rounded on the way out. 16 and 24 are integers, the usual thing
  // for a WAV, and are clamped before scaling.
  const FLOAT = 3;
  const PCM = 1;

  function clamp(value) {
    if (value > 1) return 1;
    if (value < -1) return -1;
    return value;
  }

  function text(view, at, word) {
    for (let i = 0; i < word.length; i += 1) view.setUint8(at + i, word.charCodeAt(i));
  }

  function write(source) {
    const channels = source.channels || [];
    const rate = source.sampleRate || 48000;
    const depth = DEPTHS.includes(source.bitDepth) ? source.bitDepth : 16;

    const count = channels.length || 1;
    const frames = channels.length ? channels[0].length : 0;
    const bytesPerSample = depth / 8;
    const blockAlign = count * bytesPerSample;
    const dataBytes = frames * blockAlign;

    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    text(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    text(view, 8, "WAVE");
    text(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, depth === 32 ? FLOAT : PCM, true);
    view.setUint16(22, count, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, depth, true);
    text(view, 36, "data");
    view.setUint32(40, dataBytes, true);

    let at = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < count; channel += 1) {
        const sample = clamp(channels[channel][frame] || 0);
        if (depth === 32) {
          view.setFloat32(at, sample, true);
        } else if (depth === 24) {
          // Three bytes, little end first. 8388607 and not 8388608, so that
          // full scale is the largest value the format holds rather than an
          // overflow into the sign bit.
          const value = Math.round(sample * 8388607);
          view.setUint8(at, value & 0xff);
          view.setUint8(at + 1, (value >> 8) & 0xff);
          view.setUint8(at + 2, (value >> 16) & 0xff);
        } else {
          view.setInt16(at, Math.round(sample * 32767), true);
        }
        at += bytesPerSample;
      }
    }

    return { buffer, bytes: buffer.byteLength, frames, channels: count,
      sampleRate: rate, bitDepth: depth };
  }

  function blob(source) {
    return new Blob([write(source).buffer], { type: "audio/wav" });
  }

  window.CTAWav = { DEPTHS, write, blob };
})();
