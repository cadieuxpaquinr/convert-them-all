const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/crawl.js`);
const C = window.CTACrawl;
let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

const NV = "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/RealTimeKernel.html";
const GUIDE = "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/";

is("the ladder of folders", C.prefixes(NV), [
  "https://docs.nvidia.com/",
  "https://docs.nvidia.com/jetson/",
  "https://docs.nvidia.com/jetson/archives/",
  "https://docs.nvidia.com/jetson/archives/r39.2/",
  "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/",
  "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/",
  "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/"
]);
is("the narrowest is the default",
  C.deepest(NV),
  "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/SD/Kernel/");
is("a folder address is itself a folder", C.prefixes(GUIDE).length, 5);
is("and is its own deepest", C.deepest(GUIDE), GUIDE);
is("the origin alone", C.prefixes("https://example.com"), ["https://example.com/"]);
is("the origin with a page", C.prefixes("https://example.com/a.html"),
  ["https://example.com/"]);
is("a port is part of the origin", C.deepest("https://example.com:8443/a/b.html"),
  "https://example.com:8443/a/");
is("not a url", C.prefixes("nonsense"), []);
is("not the web", C.prefixes("file:///home/x/a.html"), []);

const P = "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/";
is("a page inside", C.under(NV, P), true);
is("the folder itself", C.under(P, P), true);
is("a near miss on the name",
  C.under("https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide-old/a.html", P),
  false);
is("one folder up",
  C.under("https://docs.nvidia.com/jetson/archives/r39.2/index.html", P), false);
is("another host",
  C.under("https://evil.com/jetson/archives/r39.2/DeveloperGuide/a.html", P), false);
is("another scheme",
  C.under("http://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/a.html", P),
  false);
is("a subdomain is not the same host",
  C.under("https://x.docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide/a.html", P),
  false);
is("a script link", C.under("javascript:alert(1)", P), false);
is("an escaped climb out",
  C.under(P + "%2e%2e/%2e%2e/secret.html", P), false);
is("a prefix given without its slash",
  C.under(NV, "https://docs.nvidia.com/jetson/archives/r39.2/DeveloperGuide"), true);

is("a fragment is the same page", C.key(NV + "#build"), C.key(NV));
is("a query is not", C.key(NV + "?v=2") === C.key(NV), false);
is("a bad address has no key", C.key("javascript:1"), "");

is("a page is followable", C.followable(NV, P), true);
is("a pdf is not", C.followable(P + "guide.pdf", P), false);
is("an image is not", C.followable(P + "a/diagram.png", P), false);
is("a stylesheet is not", C.followable(P + "theme.css", P), false);
is("an archive is not", C.followable(P + "sources.tar.gz", P), false);
is("a folder is", C.followable(P + "SD/", P), true);
is("something outside is not", C.followable("https://other.com/a.html", P), false);

is("page scope follows nothing", C.plan("page", NV, P, 50).depth, 0);
is("links scope goes one deep", C.plan("links", NV, P, 50).depth, 1);
is("a section has no depth limit", C.plan("section", NV, P, 50).depth, Infinity);
is("the cap is carried", C.plan("section", NV, P, 120).cap, 120);
is("a missing cap falls back", C.plan("section", NV, P, "").cap, 50);
is("nonsense falls back", C.plan("section", NV, P, "many").cap, 50);
is("zero is not allowed", C.plan("section", NV, P, 0).cap, 50);
is("negative is not allowed", C.plan("section", NV, P, -5).cap, 1);
is("and there is a ceiling", C.plan("section", NV, P, 99999).cap, 2000);
process.exit(bad ? 1 : 0);
