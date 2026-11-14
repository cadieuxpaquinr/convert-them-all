// The Downloads search, run against real folders on disk.
//
// This one is not JavaScript at heart: the search lives in host/cta_host.py,
// and is driven here through python so that it sits with the other checks and
// runs from ./dev/check.sh like them.
const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-dl-"));
const make = (...parts) => {
  const place = path.join(dir, ...parts);
  fs.mkdirSync(path.dirname(place), { recursive: true });
  fs.writeFileSync(place, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(place, 0o755);
  return place;
};
const plain = (...parts) => {
  const place = path.join(dir, ...parts);
  fs.mkdirSync(path.dirname(place), { recursive: true });
  fs.writeFileSync(place, "not a program");
  return place;
};

// The search, asked directly, with the Downloads folder pointed at a fixture.
function find(name, root) {
  const code = [
    "import json, os, sys",
    `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "host"))})`,
    `os.environ["XDG_DOWNLOAD_DIR"] = ${JSON.stringify(root)}`,
    "import cta_host",
    `print(json.dumps(cta_host.search_downloads(${JSON.stringify(name)})))`
  ].join("\n");
  return JSON.parse(execFileSync("python3", ["-c", code]).toString().trim());
}

// A loose file, which is what yt-dlp arrives as.
const loose = path.join(dir, "loose");
make("loose", "yt-dlp.exe");
is("a file sitting in Downloads", find("yt-dlp", loose),
  path.join(loose, "yt-dlp.exe"));
is("and nothing is invented for the other one", find("ffmpeg", loose), null);

// What "Extract All" really does to an ffmpeg build on Windows: the zip holds
// a folder of its own name, and Windows wraps that in another.
const twice = path.join(dir, "twice");
const deep = make("twice", "ffmpeg-master-latest-win64-gpl",
  "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe");
is("four levels down, inside the doubled folder", find("ffmpeg", twice), deep);

// The same build unzipped the tidy way, with one folder.
const once = path.join(dir, "once");
const normal = make("once", "ffmpeg-7.1-essentials_build", "bin", "ffmpeg.exe");
is("three levels down, one folder", find("ffmpeg", once), normal);

// A folder with no bin inside it.
const flat = path.join(dir, "flat");
const bare = make("flat", "ffmpeg-7.1", "ffmpeg.exe");
is("straight inside a folder named after it", find("ffmpeg", flat), bare);

// Anything directly in Downloads is opened, whatever it is called.
const named = path.join(dir, "named");
const inTools = make("named", "tools", "yt-dlp.exe");
is("one level down, in a folder called anything", find("yt-dlp", named), inTools);

// But not everything is walked: a deep tree of holiday photos is read once
// and left alone, so a program hidden five folders down is not found.
const noise = path.join(dir, "noise");
make("noise", "holiday", "2019", "spain", "beach", "ffmpeg.exe");
is("a program buried in unrelated folders is not hunted for",
  find("ffmpeg", noise), null);

// The shallowest copy wins, because that is the one someone just downloaded.
const both = path.join(dir, "both");
const top = make("both", "ffmpeg.exe");
make("both", "ffmpeg-old-build", "bin", "ffmpeg.exe");
is("the one in front beats the one in a folder", find("ffmpeg", both), top);

// A file that cannot be started is not a program.
const unreadable = path.join(dir, "unreadable");
plain("unreadable", "ffmpeg.exe");
is("a file with no execute bit is passed over",
  find("ffmpeg", unreadable), null);

// Nothing at all.
const empty = path.join(dir, "empty");
fs.mkdirSync(empty);
is("an empty Downloads folder", find("ffmpeg", empty), null);
is("and one that does not exist",
  find("ffmpeg", path.join(dir, "nowhere")), null);

// The zip itself is not the program.
const zipped = path.join(dir, "zipped");
plain("zipped", "ffmpeg-release-essentials.zip");
is("an unopened zip is not mistaken for it", find("ffmpeg", zipped), null);

fs.rmSync(dir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
