const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
global.window = {};
require(`${ROOT}/src/formats/tar.js`);
const T = window.CTATar;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-tar-"));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir }).toString();
const bytesOf = (s) => new TextEncoder().encode(s);
const text = (b) => new TextDecoder().decode(b);

(async () => {
  // Names, which is where ustar gets interesting.
  is("a short name needs no prefix", T.split("notes.txt"),
    { prefix: "", name: "notes.txt" });
  const long = `${"folder/".repeat(20)}deep.txt`;
  const parts = T.split(long);
  is("a long one is split at a slash", `${parts.prefix}/${parts.name}`, long);
  is("and the name half fits", parts.name.length <= 100, true);
  try {
    T.split("x".repeat(150));
    bad++;
    console.log("FAIL a long name with no slash is refused: no error");
  } catch (e) {
    console.log(`ok   a long name with no slash is refused: ${e.message}`);
  }

  // A tar this wrote, opened by tar.
  const big = bytesOf("tar me ".repeat(400));
  const made = T.write([
    { name: "notes.txt", bytes: bytesOf("hello there") },
    { name: "deep/inside/file.txt", bytes: bytesOf("nested") },
    { name: "empty.txt", bytes: new Uint8Array(0) },
    { name: "big.txt", bytes: big },
    { name: "folder/", bytes: new Uint8Array(0) }
  ]);
  fs.writeFileSync(path.join(dir, "made.tar"), Buffer.from(made));

  is("tar lists every entry", run("tar", ["tf", "made.tar"]).trim().split("\n"),
    ["notes.txt", "deep/inside/file.txt", "empty.txt", "big.txt", "folder/"]);
  is("tar finds nothing wrong", run("tar", ["tvf", "made.tar"]).includes("notes.txt"),
    true);
  is("the contents come out", run("tar", ["xOf", "made.tar", "notes.txt"]),
    "hello there");
  is("the nested one too", run("tar", ["xOf", "made.tar", "deep/inside/file.txt"]),
    "nested");
  is("and the big one whole",
    run("tar", ["xOf", "made.tar", "big.txt"]).length, big.length);
  is("the folder is a folder",
    /^d/m.test(run("tar", ["tvf", "made.tar"]).split("\n").pop()
      || run("tar", ["tvf", "made.tar"])), true);
  is("the archive is a whole number of blocks",
    made.length % T.BLOCK, 0);
  is("and ends with two empty ones",
    made.subarray(made.length - 1024).every((b) => b === 0), true);

  // Reading what another program wrote.
  fs.mkdirSync(path.join(dir, "tree/sub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tree/one.txt"), "first");
  fs.writeFileSync(path.join(dir, "tree/sub/two.txt"), "second ".repeat(300));
  run("tar", ["cf", "theirs.tar", "tree"]);
  const theirs = new Uint8Array(fs.readFileSync(path.join(dir, "theirs.tar")));

  is("recognised as a tar", T.isTar(theirs), true);
  const entries = T.list(theirs);
  is("the names match", entries.map((e) => e.name).sort(),
    ["tree/", "tree/one.txt", "tree/sub/", "tree/sub/two.txt"]);
  is("folders are marked",
    entries.filter((e) => e.folder).map((e) => e.name).sort(),
    ["tree/", "tree/sub/"]);
  const one = entries.find((e) => e.name === "tree/one.txt");
  is("the size is read", one.size, 5);
  is("and the bytes come back", text(T.read(theirs, one)), "first");
  const two = entries.find((e) => e.name === "tree/sub/two.txt");
  is("a big one too", text(T.read(theirs, two)), "second ".repeat(300));
  is("the date came with it",
    two.modified instanceof Date && two.modified.getFullYear() >= 2024, true);

  // Our own, read back by us.
  const mine = T.list(made);
  is("we read our own", mine.map((e) => e.name).length, 5);
  is("and the bytes match", text(T.read(made, mine[0])), "hello there");
  is("including an empty file", T.read(made, mine[2]).length, 0);

  // gzip, which is the browser's and not ours.
  const packed = await T.gzip(made);
  is("gzip is recognised", T.isGzip(packed), true);
  is("and it got smaller", packed.length < made.length, true);
  fs.writeFileSync(path.join(dir, "made.tar.gz"), Buffer.from(packed));
  is("tar reads the whole thing through gzip",
    run("tar", ["tzf", "made.tar.gz"]).trim().split("\n").length, 5);
  is("and the contents survive",
    run("tar", ["xzOf", "made.tar.gz", "big.txt"]).length, big.length);

  // Their gzip, read by us.
  run("tar", ["czf", "theirs.tar.gz", "tree"]);
  const theirsGz = new Uint8Array(fs.readFileSync(path.join(dir, "theirs.tar.gz")));
  is("we see it is gzip", T.isGzip(theirsGz), true);
  const unpacked = await T.gunzip(theirsGz);
  is("and what is inside is a tar", T.isTar(unpacked), true);
  is("with the same four entries", T.list(unpacked).length, 4);
  is("and the same bytes",
    text(T.read(unpacked, T.list(unpacked).find((e) => e.name === "tree/one.txt"))),
    "first");

  // A round trip through both of ours.
  is("ours, gzipped and back again",
    text(T.read(await T.gunzip(await T.gzip(made)), mine[0])), "hello there");

  is("a jpeg is not a tar",
    T.isTar(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), false);
  is("nor is it gzip",
    T.isGzip(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), false);
  try {
    T.list(new Uint8Array(10));
    bad++;
    console.log("FAIL something tiny is refused: no error");
  } catch (e) {
    console.log(`ok   something tiny is refused: ${e.message}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
