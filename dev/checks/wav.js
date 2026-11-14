const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
global.Blob = class { constructor(parts) { this.parts = parts; } };
require(`${ROOT}/src/formats/wav.js`);
const W = window.CTAWav;
let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)} ${ok ? "" : "want " + JSON.stringify(want)}`);
};
const str = (v, at, n) => Array.from({length: n}, (_, i) =>
  String.fromCharCode(v.getUint8(at + i))).join("");

// Stereo, 16-bit.
let out = W.write({ channels: [new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0])],
                    sampleRate: 44100, bitDepth: 16 });
let v = new DataView(out.buffer);
is("RIFF", str(v, 0, 4), "RIFF");
is("WAVE", str(v, 8, 4), "WAVE");
is("fmt ", str(v, 12, 4), "fmt ");
is("fmt chunk is 16 bytes", v.getUint32(16, true), 16);
is("integer pcm", v.getUint16(20, true), 1);
is("two channels", v.getUint16(22, true), 2);
is("rate", v.getUint32(24, true), 44100);
is("byte rate", v.getUint32(28, true), 44100 * 4);
is("block align", v.getUint16(32, true), 4);
is("depth", v.getUint16(34, true), 16);
is("data tag", str(v, 36, 4), "data");
is("data length", v.getUint32(40, true), 3 * 4);
is("riff length", v.getUint32(4, true), 36 + 12);
is("total bytes", out.bytes, 44 + 12);
is("first frame is interleaved", [v.getInt16(44, true), v.getInt16(46, true)],
  [0, 16384]);
is("full scale up", v.getInt16(48, true), 32767);
is("full scale down", v.getInt16(52, true), -32767);

// Mono, 24-bit.
out = W.write({ channels: [new Float32Array([1, -1, 0])], sampleRate: 48000, bitDepth: 24 });
v = new DataView(out.buffer);
is("24-bit depth", v.getUint16(34, true), 24);
is("one channel", v.getUint16(22, true), 1);
is("24-bit block align", v.getUint16(32, true), 3);
is("24-bit byte count", out.bytes, 44 + 9);
is("24-bit full scale", [v.getUint8(44), v.getUint8(45), v.getUint8(46)],
  [0xff, 0xff, 0x7f]);
is("24-bit negative", [v.getUint8(47), v.getUint8(48), v.getUint8(49)],
  [0x01, 0x00, 0x80]);

// 32-bit float.
out = W.write({ channels: [new Float32Array([0.25, -0.5])], sampleRate: 8000, bitDepth: 32 });
v = new DataView(out.buffer);
is("float tag", v.getUint16(20, true), 3);
is("float samples kept", [v.getFloat32(44, true), v.getFloat32(48, true)], [0.25, -0.5]);

// Out of range and odd input.
out = W.write({ channels: [new Float32Array([2, -2])], sampleRate: 48000, bitDepth: 16 });
v = new DataView(out.buffer);
is("clamped", [v.getInt16(44, true), v.getInt16(46, true)], [32767, -32767]);
out = W.write({ channels: [new Float32Array([0])], sampleRate: 48000, bitDepth: 11 });
is("an unknown depth falls back to 16", new DataView(out.buffer).getUint16(34, true), 16);
out = W.write({});
is("nothing at all still makes a header", out.bytes, 44);
is("and claims one channel", new DataView(out.buffer).getUint16(22, true), 1);
process.exit(bad ? 1 : 0);
