const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/formats/sheet.js`);
const S = window.CTASheet;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

// Reading delimited text, which is where the awkward cases live. The xlsx and
// ods readers need a DOM and are checked in the browser instead.
is("a plain row", S.readDelimited("a,b,c", ","), [["a", "b", "c"]]);
is("two rows", S.readDelimited("a,b\nc,d", ","), [["a", "b"], ["c", "d"]]);
is("windows line endings", S.readDelimited("a,b\r\nc,d\r\n", ","),
  [["a", "b"], ["c", "d"]]);
is("an empty field in the middle", S.readDelimited("a,,c", ","), [["a", "", "c"]]);
is("a trailing empty field", S.readDelimited("a,b,", ","), [["a", "b", ""]]);
is("a quoted comma", S.readDelimited('a,"b,c",d', ","), [["a", "b,c", "d"]]);
is("a doubled quote inside", S.readDelimited('a,"say ""no""",c', ","),
  [["a", 'say "no"', "c"]]);
is("a newline inside a quoted field", S.readDelimited('a,"two\nlines",c', ","),
  [["a", "two\nlines", "c"]]);
is("a byte order mark is dropped",
  S.readDelimited("﻿a,b", ","), [["a", "b"]]);
is("tabs when asked", S.readDelimited("a\tb\tc", "\t"), [["a", "b", "c"]]);
is("a comma is just text in a tsv", S.readDelimited("a,b\tc", "\t"),
  [["a,b", "c"]]);
is("nothing at all", S.readDelimited("", ","), []);

// Writing it back.
is("plain cells", S.toDelimited([["a", "b"]], ","), "a,b\n");
is("a comma forces quotes", S.toDelimited([["a,b", "c"]], ","), '"a,b",c\n');
is("so does a quote", S.toDelimited([['say "no"']], ","), '"say ""no"""\n');
is("so does a newline", S.toDelimited([["two\nlines"]], ","), '"two\nlines"\n');
is("a tab is nothing special in a csv", S.toDelimited([["a\tb"]], ","), "a\tb\n");
is("but it is in a tsv", S.toDelimited([["a\tb"]], "\t"), '"a\tb"\t\n'.replace("\t\n", "\n"));
is("empty cells survive", S.toDelimited([["", "", "x"]], ","), ",,x\n");
is("a missing cell is empty too", S.toDelimited([[undefined, null, 0]], ","), ",,0\n");

// A round trip through both.
const awkward = [["plain", "with,comma", 'with "quotes"', "two\nlines", ""]];
is("what goes out comes back",
  S.readDelimited(S.toDelimited(awkward, ","), ","), awkward);

// Column letters.
is("A is the first", S.columnOf("A1"), 0);
is("B is the second", S.columnOf("B3"), 1);
is("Z is the twenty-sixth", S.columnOf("Z9"), 25);
is("AA is the next one", S.columnOf("AA1"), 26);
is("AB after that", S.columnOf("AB1"), 27);
is("BA is further still", S.columnOf("BA1"), 52);
is("nonsense is the first", S.columnOf(""), 0);

// Dates, counted from the last day of 1899.
is("serial one is the first of January 1900", S.dateFrom(1), "1900-01-01");
is("the day before the phantom", S.dateFrom(59), "1900-02-28");
is("the day that never happened", S.dateFrom(60), "1900-02-29");
is("and the day after it", S.dateFrom(61), "1900-03-01");
is("a modern date", S.dateFrom(45368), "2024-03-17");
is("one with a time on it", S.dateFrom(45368.5), "2024-03-17 12:00:00");

// JSON, with and without a header row.
const sheets = [{ name: "One", rows: [["a", "b"], ["1", "2"], ["3", "4"]] }];
is("keyed by the header", JSON.parse(S.toJson(sheets, true)),
  { One: [{ a: "1", b: "2" }, { a: "3", b: "4" }] });
is("or left as rows", JSON.parse(S.toJson(sheets, false)),
  { One: [["a", "b"], ["1", "2"], ["3", "4"]] });
is("a header with no rows under it",
  JSON.parse(S.toJson([{ name: "Empty", rows: [["a"]] }], true)), { Empty: [] });
is("a nameless column gets one",
  JSON.parse(S.toJson([{ name: "S", rows: [["a", ""], ["1", "2"]] }], true)),
  { S: [{ a: "1", column2: "2" }] });
process.exit(bad ? 1 : 0);
