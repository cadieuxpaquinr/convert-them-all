const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/formats/convert.js`);
const C = window.CTAConvert;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const picture = { width: 400, height: 300 };
const area = (options) => C.plan(picture, options);

// Nothing asked for: the whole picture at its own size.
is("untouched", area({}), { sx: 0, sy: 0, sw: 400, sh: 300, width: 400, height: 300 });

// Resize, with one side given and the shape kept.
is("width alone keeps the shape", area({ resize: { width: 200 } }),
  { sx: 0, sy: 0, sw: 400, sh: 300, width: 200, height: 150 });
is("height alone keeps the shape", area({ resize: { height: 150 } }),
  { sx: 0, sy: 0, sw: 400, sh: 300, width: 200, height: 150 });
is("both given are both obeyed", area({ resize: { width: 100, height: 100 } }),
  { sx: 0, sy: 0, sw: 400, sh: 300, width: 100, height: 100 });
is("rounding, not truncation", area({ resize: { width: 333 } }).height, 250);
is("an empty resize changes nothing", area({ resize: {} }).width, 400);
is("zero is not a size", area({ resize: { width: 0 } }).width, 400);
is("a negative width is pulled up to one", area({ resize: { width: -5 } }).width, 1);
is("bigger than a canvas can be is capped",
  area({ resize: { width: 99999 } }).width, C.MAX_SIDE);

// Crop, in the source's own pixels.
is("a box inside", area({ crop: { x: 10, y: 20, width: 100, height: 50 } }),
  { sx: 10, sy: 20, sw: 100, sh: 50, width: 100, height: 50 });
is("a box that runs off the right edge is pulled back",
  area({ crop: { x: 350, y: 0, width: 200, height: 50 } }),
  { sx: 350, sy: 0, sw: 50, sh: 50, width: 50, height: 50 });
is("off the bottom too",
  area({ crop: { x: 0, y: 280, width: 50, height: 200 } }).sh, 20);
is("a negative origin is the origin",
  area({ crop: { x: -40, y: -40, width: 100, height: 100 } }).sx, 0);
is("an origin past the far corner still leaves a pixel",
  area({ crop: { x: 9999, y: 9999, width: 10, height: 10 } }),
  { sx: 399, sy: 299, sw: 1, sh: 1, width: 1, height: 1 });
is("fractions are rounded", area({ crop: { x: 10.6, y: 0, width: 50.4, height: 10 } }).sx, 11);
is("a zero-wide crop still gives a pixel",
  area({ crop: { x: 0, y: 0, width: 0, height: 0 } }).sw, 1);

// The two together: crop first, then size what is left.
is("cropped, then resized",
  area({ crop: { x: 0, y: 0, width: 200, height: 100 }, resize: { width: 400 } }),
  { sx: 0, sy: 0, sw: 200, sh: 100, width: 400, height: 200 });
is("the shape kept is the crop's, not the picture's",
  area({ crop: { x: 0, y: 0, width: 100, height: 400 }, resize: { width: 50 } }).height,
  150);

// When a conversion is no conversion at all.
const jpeg = "https://a.com/holiday.jpg";
is("a jpeg, stripped, is lossless",
  C.lossless({ url: jpeg, format: "jpeg", strip: true }), true);
is("without the strip it is a re-encode",
  C.lossless({ url: jpeg, format: "jpeg" }), false);
is("a crop means re-encoding",
  C.lossless({ url: jpeg, format: "jpeg", strip: true, crop: { x: 0, y: 0, width: 5, height: 5 } }),
  false);
is("so does a resize",
  C.lossless({ url: jpeg, format: "jpeg", strip: true, resize: { width: 50 } }), false);
is("a png cannot be stripped this way",
  C.lossless({ url: "https://a.com/a.png", format: "png", strip: true }), false);
is("nor can a jpeg on its way to png",
  C.lossless({ url: jpeg, format: "png", strip: true }), false);
is("the name is believed over the address",
  C.lossless({ url: "blob:nothing", name: "holiday.JPEG", format: "jpeg", strip: true }),
  true);
is("an unknown format is not lossless",
  C.lossless({ url: jpeg, format: "fish", strip: true }), false);
process.exit(bad ? 1 : 0);
