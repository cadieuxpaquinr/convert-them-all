const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/drop.js`);
const { read } = window.CTADrop;

function fake(data, files) {
  return { files: files || [], types: Object.keys(data),
    getData: (t) => data[t] || "" };
}
let bad = 0;
function is(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}`);
}

const f = { name: "cat.png", type: "image/png" };
const g = { name: "notes.txt", type: "text/plain" };

is("file", read(fake({}, [f])), { kind: "file", file: f, ignored: 0 });
is("several files", read(fake({}, [f, g])), { kind: "file", file: f, ignored: 1 });
is("linked image prefers the img",
  read(fake({
    "text/html": '<a href="https://site/page"><img alt="x" src="https://site/cat.png?a=1&amp;b=2"></a>',
    "text/uri-list": "https://site/page"
  })),
  { kind: "url", url: "https://site/cat.png?a=1&b=2" });
is("bare link", read(fake({ "text/uri-list": "# comment\nhttps://site/cat.png" })),
  { kind: "url", url: "https://site/cat.png" });
is("plain text url", read(fake({ "text/plain": "https://site/cat.png" })),
  { kind: "url", url: "https://site/cat.png" });
is("data url", read(fake({ "text/uri-list": "data:image/png;base64,AAAA" })),
  { kind: "url", url: "data:image/png;base64,AAAA" });
is("single quoted src", read(fake({ "text/html": "<img src='https://site/a.png'>" })),
  { kind: "url", url: "https://site/a.png" });
is("unquoted src", read(fake({ "text/html": "<img src=https://site/a.png>" })),
  { kind: "url", url: "https://site/a.png" });
is("plain words", read(fake({ "text/plain": "just some words" })), null);
is("javascript scheme refused", read(fake({ "text/plain": "javascript:alert(1)" })), null);
is("empty", read(fake({})), null);
is("no transfer", read(null), null);
is("html without an img falls back",
  read(fake({ "text/html": "<p>hello</p>", "text/uri-list": "https://site/cat.png" })),
  { kind: "url", url: "https://site/cat.png" });
process.exit(bad ? 1 : 0);
