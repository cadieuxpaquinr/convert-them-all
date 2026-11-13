const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
global.window = {};
require(`${ROOT}/src/formats/jpegmeta.js`);
const J = window.CTAJpegMeta;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

// A real JPEG from ffmpeg, then the same one with an Exif block, an ICC
// profile and a comment pushed in front of it by hand. Nothing here is a
// fixture made by the code it is checking.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-jpeg-"));
const plainPath = path.join(dir, "plain.jpg");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi",
  "-i", "color=c=red:s=32x24", "-frames:v", "1", plainPath]);
const plain = fs.readFileSync(plainPath);

function segment(marker, body) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}
const exif = segment(0xe1, Buffer.concat([
  Buffer.from("Exif\0\0", "latin1"), Buffer.from("II*\0\0\0\0", "latin1"),
  Buffer.from("GPS 45.5017 -73.5673 and a camera serial".repeat(3), "latin1")]));
const icc = segment(0xe2, Buffer.from("ICC_PROFILE\0somecolours", "latin1"));
const comment = segment(0xfe, Buffer.from("written by a person", "latin1"));
const withMeta = Buffer.concat([plain.subarray(0, 2), exif, icc, comment,
  plain.subarray(2)]);

is("a jpeg is recognised", J.isJpeg(plain), true);
is("a png is not", J.isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
is("an empty buffer is not", J.isJpeg(Buffer.alloc(0)), false);

// ffmpeg writes a comment of its own naming the encoder, so a plain file
// already has one thing worth taking out. That is a finding, not a fault: the
// name of the program that made a picture is metadata like any other.
const ffmpegComment = J.find(plain);
is("even a plain ffmpeg jpeg carries a comment",
  ffmpegComment.map((r) => r.name), ["comment"]);

const out = J.strip(withMeta);
is("exif and both comments went", out.removed.map((r) => r.name),
  ["Exif or XMP", "comment", "comment"]);
is("the bytes they took are reported",
  out.saved, exif.length + comment.length + ffmpegComment[0].bytes);
is("the file shrank by exactly that",
  withMeta.length - out.bytes.length,
  exif.length + comment.length + ffmpegComment[0].bytes);
is("the colour profile stayed",
  Buffer.from(out.bytes).includes(Buffer.from("ICC_PROFILE")), true);
is("no trace of the exif is left",
  Buffer.from(out.bytes).includes(Buffer.from("GPS 45.5017")), false);
is("nor of the comment",
  Buffer.from(out.bytes).includes(Buffer.from("written by a person")), false);

// The point of the whole module: the picture itself is untouched.
is("what is left is the original file, less its comment, plus the profile",
  out.bytes.length, plain.length + icc.length - ffmpegComment[0].bytes);
const stripped = Buffer.from(out.bytes);
is("it still starts with SOI", [stripped[0], stripped[1]], [0xff, 0xd8]);
is("and ends with EOI",
  [stripped[stripped.length - 2], stripped[stripped.length - 1]], [0xff, 0xd9]);
const scanAt = stripped.indexOf(Buffer.from([0xff, 0xda]));
const plainScanAt = plain.indexOf(Buffer.from([0xff, 0xda]));
is("the compressed picture is byte for byte the same",
  Buffer.compare(stripped.subarray(scanAt), plain.subarray(plainScanAt)), 0);

// A file with nothing left to take out comes back byte for byte.
const twice = J.strip(Buffer.from(out.bytes));
is("a second pass finds nothing", twice.removed, []);
is("and removes nothing", twice.saved, 0);
is("and hands back the same bytes",
  Buffer.compare(Buffer.from(twice.bytes), Buffer.from(out.bytes)), 0);

// Reading without rewriting.
is("find says what is in there", J.find(withMeta).map((r) => r.marker),
  [0xe1, 0xfe, 0xfe]);
is("find on rubbish says nothing", J.find(Buffer.from([1, 2, 3])), []);

// Damaged input is refused rather than half-written.
const throws = (name, bytes) => {
  try {
    J.strip(bytes);
    bad++;
    console.log(`FAIL ${name}: no error`);
  } catch (e) {
    console.log(`ok   ${name}: ${e.message}`);
  }
};
throws("not a jpeg at all", Buffer.from("hello world"));
throws("truncated mid-segment", withMeta.subarray(0, 40));
throws("a marker with no length", Buffer.from([0xff, 0xd8, 0xff, 0xe1]));
throws("a length that lies", Buffer.concat([
  Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0xff, 0xff]),
  Buffer.from([1, 2, 3])]));

// The JPEG the add-on would really hand over, checked by another program.
const outPath = path.join(dir, "stripped.jpg");
fs.writeFileSync(outPath, stripped);
const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries",
  "stream=width,height", "-of", "csv=p=0", outPath]).toString().trim();
is("ffprobe still reads it as 32x24", probe, "32,24");

fs.rmSync(dir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
