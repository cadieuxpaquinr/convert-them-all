const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// The module is written for a browser: it uses Blob, CompressionStream and a
// Response to read a stream back. Node has all three, so the real file is run
// here unchanged rather than a copy of it.
global.window = {};
require(`${ROOT}/src/formats/pdf.js`);
const P = window.CTAPdf;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-pdf-"));
const write = async (name, blob) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  return file;
};
const run = (cmd, args) => execFileSync(cmd, args).toString();

(async () => {
  // Wrapping, which is the part a reader cannot check for us.
  const style = { size: 11, bold: false };
  is("an empty string wraps to nothing", P.wrap("", 11, style, 200), []);
  is("a short line stays one line", P.wrap("hello there", 11, style, 200).length, 1);
  const many = P.wrap("the quick brown fox jumps over the lazy dog again and again",
    11, style, 120);
  is("a long line is broken", many.length > 1, true);
  is("every piece fits",
    many.every((line) => P.widthOf(line, 11, style) <= 120), true);
  is("no word was lost", many.join(" ").split(" ").length,
    "the quick brown fox jumps over the lazy dog again and again".split(" ").length);
  is("a word longer than the line still comes out",
    P.wrap("supercalifragilistic", 11, style, 10).length, 1);
  is("bold is wider",
    P.widthOf("Hello", 11, { size: 11, bold: true })
      > P.widthOf("Hello", 11, style), true);

  // The characters a PDF string cannot hold as they are.
  is("brackets and slashes are escaped", P.escape("a (b) c\\d"), "a \\(b\\) c\\\\d");
  is("a character outside WinAnsi becomes a question mark", P.latin("a中b"), "a?b");
  is("accents survive", P.latin("café"), "café");

  // Layout: what lands on which page.
  const long = Array.from({ length: 60 }, (_, i) =>
    ({ type: "p", text: `Paragraph number ${i + 1}, with enough words in it to take up a whole line of the page.` }));
  const pages = P.layout(long);
  is("sixty paragraphs need more than one page", pages.length > 1, true);
  is("nothing sits above the top margin",
    pages.every((lines) => lines.every((l) => l.y <= P.PAGE.height - P.MARGIN)), true);
  is("nor below the bottom one",
    pages.every((lines) => lines.every((l) => l.y >= P.MARGIN - 1)), true);
  is("every line starts at the margin or further in",
    pages.every((lines) => lines.every((l) => l.x >= P.MARGIN)), true);
  is("a list is indented further than a paragraph",
    P.layout([{ type: "li", text: "one" }])[0][0].x
      > P.layout([{ type: "p", text: "one" }])[0][0].x, true);

  // A real document, read back by poppler.
  const textPdf = await P.fromText({
    title: "Installing Real-Time Kernel",
    blocks: [
      { type: "h2", text: "Before you start" },
      { type: "p", text: "The kernel has to be built on a machine with enough room, and the sources have to match the release exactly." },
      { type: "li", text: "Download the sources" },
      { type: "li", text: "Apply the patch" },
      { type: "pre", text: "make -j8 Image\nmake modules_install" },
      { type: "p", text: "Then flash it, and the board comes up on the new kernel." }
    ]
  });
  const textPath = await write("text.pdf", textPdf);
  const read = run("pdftotext", [textPath, "-"]);
  is("the title is in there", read.includes("Installing Real-Time Kernel"), true);
  is("so is a heading", read.includes("Before you start"), true);
  is("and a paragraph, whole",
    read.replace(/\s+/g, " ").includes("sources have to match the release exactly"), true);
  is("and the list", read.includes("- Apply the patch"), true);
  is("and the code, line by line", read.includes("make modules_install"), true);
  const info = run("pdfinfo", [textPath]);
  is("one page", /Pages:\s+1/.test(info), true);
  is("A4 to the point", /Page size:\s+595 x 842/.test(info), true);
  is("poppler reports no damage", /Encrypted:\s+no/.test(info), true);
  const fonts = run("pdffonts", [textPath]);
  is("Helvetica is used", fonts.includes("Helvetica"), true);
  is("bold as well", fonts.includes("Helvetica-Bold"), true);
  is("and Courier for code", fonts.includes("Courier"), true);
  is("and nothing had to be embedded", /yes\s+yes/.test(fonts) === false, true);

  // Many pages, and the page count that goes with them.
  const big = await write("big.pdf", await P.fromText({ title: "Long", blocks: long }));
  const bigPages = Number(/Pages:\s+(\d+)/.exec(run("pdfinfo", [big]))[1]);
  is("the page count matches the layout", bigPages, P.layout(
    [{ type: "h1", text: "Long" }].concat(long)).length);
  is("the last paragraph survived to the end",
    run("pdftotext", [big, "-"]).includes("Paragraph number 60"), true);

  // Images: a JPEG goes in untouched, a raw bitmap is deflated.
  const jpegPath = path.join(dir, "shot.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi",
    "-i", "color=c=blue:s=64x48", "-frames:v", "1", jpegPath]);
  const jpeg = fs.readFileSync(jpegPath);
  const imagePdf = await P.fromImages([
    { bytes: new Uint8Array(jpeg), mime: "image/jpeg", width: 64, height: 48 }
  ]);
  const imagePath = await write("image.pdf", imagePdf);
  const imageInfo = run("pdfinfo", [imagePath]);
  is("the page is the size of the picture",
    /Page size:\s+64 x 48/.test(imageInfo), true);
  const listed = run("pdfimages", ["-list", imagePath]);
  is("poppler finds one image", listed.trim().split("\n").length - 2, 1);
  is("at the right size", /\b64\s+48\b/.test(listed), true);
  is("and knows it is jpeg", /jpeg/.test(listed), true);

  // The same picture as raw pixels, which must come out deflated instead.
  const pixels = new Uint8Array(8 * 4 * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 200; pixels[i + 1] = 30; pixels[i + 2] = 30;
  }
  const rawPath = await write("raw.pdf", await P.fromImages([
    { bytes: pixels, mime: "image/png", width: 8, height: 4 }
  ]));
  const rawList = run("pdfimages", ["-list", rawPath]);
  is("the deflated one is readable too", /\b8\s+4\b/.test(rawList), true);
  is("and is not jpeg", /jpeg/.test(rawList), false);
  const out = path.join(dir, "out");
  run("pdfimages", ["-png", rawPath, out]);
  const made = fs.readdirSync(dir).filter((f) => f.startsWith("out-"));
  is("poppler could extract it", made.length, 1);

  // Two pictures, two pages.
  const twoPath = await write("two.pdf", await P.fromImages([
    { bytes: new Uint8Array(jpeg), mime: "image/jpeg", width: 64, height: 48 },
    { bytes: pixels, mime: "image/png", width: 8, height: 4 }
  ]));
  is("two pages", /Pages:\s+2/.test(run("pdfinfo", [twoPath])), true);
  is("and two images", run("pdfimages", ["-list", twoPath]).trim().split("\n").length - 2, 2);

  // Nothing in, nothing out.
  try {
    await P.fromImages([]);
    bad++;
    console.log("FAIL an empty list is refused: no error");
  } catch (e) {
    console.log(`ok   an empty list is refused: ${e.message}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
