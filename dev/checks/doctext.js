const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/formats/doctext.js`);
const D = window.CTADocText;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

// Markdown in.
is("a heading", D.fromMarkdown("# Title"), [{ type: "h1", text: "Title" }]);
is("a deeper one", D.fromMarkdown("### Third"), [{ type: "h3", text: "Third" }]);
is("deeper than three is still three",
  D.fromMarkdown("##### Fifth"), [{ type: "h3", text: "Fifth" }]);
is("a paragraph", D.fromMarkdown("just words"), [{ type: "p", text: "just words" }]);
is("wrapped lines join up", D.fromMarkdown("one\ntwo\nthree"),
  [{ type: "p", text: "one two three" }]);
is("a blank line splits them", D.fromMarkdown("one\n\ntwo"),
  [{ type: "p", text: "one" }, { type: "p", text: "two" }]);
is("a dash list", D.fromMarkdown("- one\n- two"),
  [{ type: "li", text: "one" }, { type: "li", text: "two" }]);
is("a numbered list", D.fromMarkdown("1. one\n2. two"),
  [{ type: "li", text: "one" }, { type: "li", text: "two" }]);
is("a star list too", D.fromMarkdown("* one"), [{ type: "li", text: "one" }]);
is("a quote is a paragraph", D.fromMarkdown("> quoted"),
  [{ type: "p", text: "quoted" }]);
is("a fence keeps its lines", D.fromMarkdown("```\nmake all\nmake install\n```"),
  [{ type: "pre", text: "make all\nmake install" }]);
is("an unclosed fence still comes out",
  D.fromMarkdown("```\nstuck"), [{ type: "pre", text: "stuck" }]);
is("a hash inside a line is not a heading",
  D.fromMarkdown("a # b"), [{ type: "p", text: "a # b" }]);
is("nothing at all", D.fromMarkdown(""), []);

// Markdown out.
const blocks = [
  { type: "h1", text: "Title" }, { type: "p", text: "words" },
  { type: "li", text: "one" }, { type: "pre", text: "code here" }
];
is("markdown comes back", D.toMarkdown(blocks, ""),
  "# Title\n\nwords\n\n- one\n\n```\ncode here\n```\n");
is("and a title can be put in front", D.toMarkdown([], "Book"), "# Book\n");

// A round trip, which is the thing that must not drift.
is("markdown survives the trip", D.fromMarkdown(D.toMarkdown(blocks, "")), blocks);

// HTML out.
const html = D.toHtml(blocks, "Title");
is("a doctype", html.startsWith("<!DOCTYPE html>"), true);
is("the title is in the head", html.includes("<title>Title</title>"), true);
is("headings", html.includes("<h1>Title</h1>"), true);
is("a list is wrapped once",
  (html.match(/<ul>/g) || []).length, 1);
is("code is escaped inside pre",
  D.toHtml([{ type: "pre", text: "a < b" }], "").includes("<pre><code>a &lt; b"), true);
is("bold becomes strong",
  D.toHtml([{ type: "p", text: "a **bold** word" }], "").includes("<strong>bold</strong>"),
  true);
is("italic becomes em",
  D.toHtml([{ type: "p", text: "a *soft* word" }], "").includes("<em>soft</em>"), true);
is("inline code", D.toHtml([{ type: "p", text: "run `make`" }], "")
  .includes("<code>make</code>"), true);
is("a link", D.toHtml([{ type: "p", text: "see [here](https://a.com)" }], "")
  .includes('<a href="https://a.com">here</a>'), true);
is("angle brackets in text are escaped",
  D.toHtml([{ type: "p", text: "a < b & c" }], "").includes("a &lt; b &amp; c"), true);
is("two lists in a row close properly",
  (D.toHtml([{ type: "li", text: "a" }, { type: "p", text: "x" },
    { type: "li", text: "b" }], "").match(/<\/ul>/g) || []).length, 2);
process.exit(bad ? 1 : 0);
