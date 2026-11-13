const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/sitepath.js`);
const P = window.CTASitePath;
let bad = 0;
const is = (n, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${got}${ok ? "" : "\n     want " + want}`);
};

const NV = "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/RealTimeKernel.html";

is("a real page", P.of(NV),
  "convert-them-all/docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/RealTimeKernel.html");
is("a directory becomes index.html",
  P.of("https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/"),
  "convert-them-all/docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/index.html");
is("the origin alone", P.of("https://example.com"),
  "convert-them-all/example.com/index.html");
// No extension means it is treated as a folder with a page inside, so that a
// site serving both /guide/intro and /guide/intro/sub cannot collide.
is("no extension becomes a folder", P.of("https://example.com/guide/intro"),
  "convert-them-all/example.com/guide/intro/index.html");
is("a query is kept", P.of("https://example.com/search?q=kernel&page=2"),
  "convert-them-all/example.com/search/index-q-kernel-page-2.html");
is("a query on a real page too", P.of("https://example.com/a/b.html?v=3"),
  "convert-them-all/example.com/a/b-v-3.html");
is("a fragment is not part of the file", P.of("https://example.com/a/b.html#here"),
  "convert-them-all/example.com/a/b.html");
is("escapes are read", P.of("https://example.com/a%20b/c%20d.html"),
  "convert-them-all/example.com/a-b/c-d.html");
is("a traversal cannot climb out", P.of("https://example.com/a/../../etc/passwd"),
  "convert-them-all/example.com/etc/passwd/index.html");
is("an escaped traversal cannot either",
  P.of("https://example.com/a/%2e%2e/%2e%2e/etc/shadow"),
  "convert-them-all/example.com/etc/shadow/index.html");
is("a dash is all a stray separator becomes",
  P.of("https://example.com/a:b*c.html"),
  "convert-them-all/example.com/a-b-c.html");
// A tab is dropped by the URL parser itself, before any of this is reached.
is("a tab never survives the address",
  P.of("https://example.com/a" + String.fromCharCode(9) + "b.html"),
  "convert-them-all/example.com/ab.html");
const long = P.of("https://example.com/" + "x".repeat(200) + ".html").split("/").pop();
is("a very long name is cut", long.length <= 85, true);
is("and keeps its extension", long.endsWith(".html"), true);
is("not a url at all", P.of("notaurl"), "");
is("an empty string", P.of(""), "");

is("same folder",
  P.between("https://a.com/doc/one.html", "https://a.com/doc/two.html"), "two.html");
is("down into a folder",
  P.between("https://a.com/doc/one.html", "https://a.com/doc/sub/two.html"),
  "sub/two.html");
is("up out of a folder",
  P.between("https://a.com/doc/sub/two.html", "https://a.com/doc/one.html"),
  "../one.html");
is("up and over",
  P.between("https://a.com/doc/sub/two.html", "https://a.com/other/three.html"),
  "../../other/three.html");
is("to a directory index",
  P.between("https://a.com/doc/sub/two.html", "https://a.com/doc/"),
  "../index.html");
is("across hosts",
  P.between("https://a.com/one.html", "https://b.com/two.html"),
  "../b.com/two.html");
is("the NVIDIA pair",
  P.between(NV, "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/KernelCustomization.html"),
  "KernelCustomization.html");
is("back up to the guide index",
  P.between(NV, "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/"),
  "../../index.html");
is("a script link is not a target", P.between(NV, "javascript:void(0)"), "");
is("nor is a mail link", P.between(NV, "mailto:a@b.com"), "");
is("nor is a data url", P.of("data:text/html,<p>hi"), "");
is("nor is a file path", P.of("file:///etc/passwd"), "");
process.exit(bad ? 1 : 0);

// relative() over paths, which is what a saved file really links with.
is("a sibling file", P.relative("a/b/one.html", "a/b/two.md"), "two.md");
is("down", P.relative("a/one.html", "a/sub/two.html"), "sub/two.html");
is("up", P.relative("a/sub/two.html", "a/one.html"), "../one.html");
is("up twice", P.relative("a/b/c/x.html", "a/y.html"), "../../y.html");
is("nothing to point at", P.relative("a/one.html", ""), "");
is("the format decides the name",
  P.relative("convert-them-all/h/a/one.md", "convert-them-all/h/a/two.md"), "two.md");
process.exit(bad ? 1 : 0);
