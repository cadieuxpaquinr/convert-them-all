const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
global.window = {};
require(`${ROOT}/src/formats/zip.js`);
const Z = window.CTAZip;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-zip-"));
const run = (cmd, args, options) =>
  execFileSync(cmd, args, Object.assign({ cwd: dir }, options || {}));
const text = (bytes) => new TextDecoder().decode(bytes);

(async () => {
  // The checksum, against a value the whole world agrees on.
  is("crc32 of the usual string",
    Z.crc32(new TextEncoder().encode("123456789")).toString(16), "cbf43926");
  is("crc32 of nothing", Z.crc32(new Uint8Array(0)), 0);

  // A zip this wrote, opened by unzip.
  const big = new TextEncoder().encode("compress me ".repeat(500));
  const blob = await Z.write([
    { name: "notes.txt", bytes: new TextEncoder().encode("hello there") },
    { name: "deep/inside/file.txt", bytes: new TextEncoder().encode("nested") },
    { name: "empty.txt", bytes: new Uint8Array(0) },
    { name: "big.txt", bytes: big },
    { name: "café — résumé.txt", bytes: new TextEncoder().encode("unicode name") }
  ]);
  const zipPath = path.join(dir, "made.zip");
  fs.writeFileSync(zipPath, Buffer.from(await blob.arrayBuffer()));

  is("unzip says it is sound", run("unzip", ["-t", "made.zip"]).toString()
    .includes("No errors detected"), true);
  const listed = run("zipinfo", ["-1", "made.zip"]).toString().trim().split("\n");
  is("every entry is there", listed, ["notes.txt", "deep/inside/file.txt",
    "empty.txt", "big.txt", "café — résumé.txt"]);
  is("the contents come back out",
    run("unzip", ["-p", "made.zip", "notes.txt"]).toString(), "hello there");
  is("including the nested one",
    run("unzip", ["-p", "made.zip", "deep/inside/file.txt"]).toString(), "nested");
  is("and the unicode one",
    run("unzip", ["-p", "made.zip", "café — résumé.txt"]).toString(), "unicode name");
  is("the big one is whole",
    run("unzip", ["-p", "made.zip", "big.txt"]).length, big.length);

  const verbose = run("zipinfo", ["-v", "made.zip", "big.txt"]).toString();
  is("and was really deflated", /defl/i.test(verbose), true);
  is("to less than it was", fs.statSync(zipPath).size < big.length, true);
  const emptyInfo = run("zipinfo", ["-v", "made.zip", "empty.txt"]).toString();
  is("an empty file is stored, not deflated", /stored/i.test(emptyInfo), true);

  // Reading back what another program wrote.
  fs.mkdirSync(path.join(dir, "tree/sub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tree/one.txt"), "first");
  fs.writeFileSync(path.join(dir, "tree/sub/two.txt"), "second ".repeat(200));
  run("zip", ["-r", "-q", "theirs.zip", "tree"]);
  const theirs = new Uint8Array(fs.readFileSync(path.join(dir, "theirs.zip")));

  is("it is recognised as a zip", Z.isZip(theirs), true);
  const entries = Z.list(theirs);
  is("the names match", entries.map((e) => e.name).sort(),
    ["tree/", "tree/one.txt", "tree/sub/", "tree/sub/two.txt"]);
  is("folders are marked as folders",
    entries.filter((e) => e.folder).map((e) => e.name).sort(), ["tree/", "tree/sub/"]);
  const one = entries.find((e) => e.name === "tree/one.txt");
  is("sizes are right", one.size, 5);
  is("and the bytes come back", text(await Z.read(theirs, one)), "first");
  const two = entries.find((e) => e.name === "tree/sub/two.txt");
  is("a deflated entry inflates", text(await Z.read(theirs, two)),
    "second ".repeat(200));
  is("and its date survived the trip",
    two.modified instanceof Date && two.modified.getFullYear() >= 2024, true);

  // A round trip: ours, read by us, after another program has seen it.
  const mine = Z.list(new Uint8Array(await blob.arrayBuffer()));
  is("we can read our own", mine.map((e) => e.name).length, 5);
  is("and get the bytes back",
    text(await Z.read(new Uint8Array(await blob.arrayBuffer()),
      mine.find((e) => e.name === "big.txt"))).length, big.length);

  // A stored zip, which is what "do not compress" means.
  const storedBlob = await Z.write([
    { name: "raw.bin", bytes: big, store: true }
  ]);
  fs.writeFileSync(path.join(dir, "stored.zip"),
    Buffer.from(await storedBlob.arrayBuffer()));
  is("unzip is happy with a stored entry",
    run("unzip", ["-t", "stored.zip"]).toString().includes("No errors"), true);
  is("and it really is stored",
    /stored/i.test(run("zipinfo", ["-v", "stored.zip", "raw.bin"]).toString()), true);

  // Rubbish in.
  const throws = (name, call) => {
    try {
      call();
      bad++;
      console.log(`FAIL ${name}: no error`);
    } catch (e) {
      console.log(`ok   ${name}: ${e.message}`);
    }
  };
  throws("a text file is not a zip", () => Z.list(new TextEncoder().encode("hello")));
  throws("an empty file is not a zip", () => Z.list(new Uint8Array(0)));
  const whole = new Uint8Array(await blob.arrayBuffer());
  throws("a truncated zip is refused", () => Z.list(whole.subarray(0, 60)));
  is("and isZip says no to a jpeg",
    Z.isZip(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), false);

  // An empty archive is still a valid archive.
  const nothing = await Z.write([]);
  fs.writeFileSync(path.join(dir, "empty.zip"),
    Buffer.from(await nothing.arrayBuffer()));
  is("an empty zip has no entries", Z.list(
    new Uint8Array(await nothing.arrayBuffer())).length, 0);
  // unzip exits non-zero on an archive with nothing in it, and says why. That
  // is unzip's opinion of empty archives, not a fault in the file.
  let emptySaid = "";
  try {
    emptySaid = run("unzip", ["-l", "empty.zip"]).toString();
  } catch (e) {
    emptySaid = `${e.stdout}${e.stderr}`;
  }
  is("and unzip reads it as an empty one", /empty/i.test(emptySaid), true);

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
