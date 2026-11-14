const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/kinds.js`);
const K = window.CTAKind;
let bad = 0;
const is = (n, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${got}`);
};
const f = (name, type) => ({ name, type });

is("png by type", K.of(f("a.png", "image/png")), "image");
is("mp3 by type", K.of(f("a.mp3", "audio/mpeg")), "audio");
is("mp4 is other", K.of(f("a.mp4", "video/mp4")), "other");
is("text is other", K.of(f("a.txt", "text/plain")), "other");
is("png with no type", K.of(f("holiday.PNG", "")), "image");
is("flac with no type", K.of(f("track.flac", "")), "audio");
is("m4a with no type", K.of(f("talk.m4a", "")), "audio");
is("zip with no type", K.of(f("stuff.zip", "")), "archive");
is("a tarball", K.of(f("sources.tar.gz", "")), "archive");
is("a workbook", K.of(f("report.xlsx", "")), "sheet");
is("an open document sheet", K.of(f("report.ods", "")), "sheet");
is("a csv", K.of(f("rows.csv", "")), "sheet");
is("a word document", K.of(f("letter.docx", "")), "document");
is("markdown", K.of(f("notes.md", "")), "document");
is("html is a document here", K.of(f("page.html", "")), "document");
is("a workbook by type beats the archive it is",
  K.of(f("x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
  "sheet");
is("and so does a word document",
  K.of(f("x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
  "document");
is("no extension at all", K.of(f("README", "")), "other");
is("a dotfile is not an extension", K.of(f(".bashrc", "")), "other");
is("nonsense extension", K.of(f("a.verylong", "")), "other");
is("the type beats the name", K.of(f("song.mp3", "video/mp4")), "other");
is("nothing at all", K.of(null), "other");

is("image goes to Images", K.section("image"), "images");
is("audio goes to Audio", K.section("audio"), "audio");
is("the rest goes to Files", K.section("other"), "files");
is("an archive goes to Archives", K.section("archive"), "archives");
is("a sheet goes to Sheets", K.section("sheet"), "sheets");
is("a document goes to Documents", K.section("document"), "documents");
is("an archive reads as one", K.noun("archive"), "an archive");
is("a sheet reads as a spreadsheet", K.noun("sheet"), "a spreadsheet");
is("a document reads as one", K.noun("document"), "a document");
is("an unknown kind goes to Files", K.section("fish"), "files");
is("image reads as an image", K.noun("image"), "an image");
is("audio reads as an audio file", K.noun("audio"), "an audio file");
is("other reads as a file", K.noun("other"), "a file");
process.exit(bad ? 1 : 0);
