const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/readiness.js`);
const R = window.CTAReady;
let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}`);
};
const base = (over) => Object.assign({
  type: "report", host: 4,
  ytdlp: { found: true, version: "2026.10.26", install: "self" },
  ffmpeg: { found: true, version: "8.0.1" },
  jsruntime: { found: true, name: "node" },
  downloads: { path: "/home/x/Downloads", exists: true, writable: true },
  releases: { tags: ["2026.10.26", "2026.10.21", "2026.08.19", "2026.07.04"] }
}, over || {});

// No helper at all.
let t = R.tools(null, "linux");
is("both unknown", t.rows.map((r) => r.mark), ["unknown", "unknown"]);
is("helper named", t.helper.command, "./host/install.sh");
is("helper reason", t.helper.text.includes("not installed"), true);

// A helper too old to describe anything.
t = R.tools({ type: "report", host: 2 }, "win");
is("outdated helper is unknown too", t.rows[0].mark, "unknown");
is("windows helper command", t.helper.command,
  "powershell -ExecutionPolicy Bypass -File host\\install.ps1");
is("outdated reason", t.helper.text.includes("out of date"), true);

// Everything current.
t = R.tools(base(), "linux");
is("no helper note", t.helper, null);
is("ytdlp ok", [t.rows[0].mark, t.rows[0].detail], ["ok", "2026.10.26, current."]);
is("ffmpeg ok", [t.rows[1].mark, t.rows[1].detail], ["ok", "8.0.1."]);
is("nothing to run", [t.rows[0].command, t.rows[1].command], ["", ""]);

// yt-dlp missing.
t = R.tools(base({ ytdlp: { found: false } }), "linux");
is("missing is bad", t.rows[0].mark, "bad");
is("install command", t.rows[0].command, "sudo apt install yt-dlp");
is("link offered", t.rows[0].link, { text: "Get yt-dlp", url: R.YTDLP_DOCS });

// yt-dlp present but will not run.
t = R.tools(base({ ytdlp: { found: true, broken: "exit code 1" } }), "mac");
is("broken is bad", t.rows[0].mark, "bad");
is("broken says why", t.rows[0].detail.includes("exit code 1"), true);
is("mac command", t.rows[0].command, "brew install yt-dlp");

// One release behind: present, older, still sufficient.
t = R.tools(base({ ytdlp: { found: true, version: "2026.10.21", install: "self" } }), "linux");
is("one behind is old, not bad", t.rows[0].mark, "old");
is("says it still works", t.rows[0].detail.includes("still works"), true);
is("the right updater", t.rows[0].command, "yt-dlp -U");

// Two behind: held shut.
t = R.tools(base({ ytdlp: { found: true, version: "2026.08.19", install: "pipx" } }), "linux");
is("two behind is bad", t.rows[0].mark, "bad");
is("says downloads are shut", t.rows[0].detail.includes("stay shut"), true);
is("pipx updater", t.rows[0].command, "pipx upgrade yt-dlp");

// A version the list has never heard of.
t = R.tools(base({ ytdlp: { found: true, version: "2019.01.01", install: "system" } }), "win");
is("unknown version counts as far behind", t.rows[0].mark, "bad");
is("winget updater for a system install", t.rows[0].command, "winget upgrade yt-dlp.yt-dlp");

// No release list, and an old copy.
t = R.tools(base({ releases: { tags: [] },
  ytdlp: { found: true, version: "2024.01.01", install: "pip" } }), "linux");
is("old with no list is old", t.rows[0].mark, "old");
is("says the list is missing", t.rows[0].detail.includes("could not be"), true);
is("pip updater", t.rows[0].command, "python3 -m pip install -U yt-dlp");

// No release list, and a copy from today: nothing to say.
const today = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
t = R.tools(base({ releases: { tags: [] },
  ytdlp: { found: true, version: today, install: "self" } }), "linux");
is("fresh with no list is ok", [t.rows[0].mark, t.rows[0].detail], ["ok", `${today}.`]);

// ffmpeg missing warns, and never blocks.
t = R.tools(base({ ffmpeg: { found: false } }), "win");
is("ffmpeg missing is old", t.rows[1].mark, "old");
is("windows ffmpeg command", t.rows[1].command, "winget install Gyan.FFmpeg");
is("ffmpeg link", t.rows[1].link, { text: "Get ffmpeg", url: R.FFMPEG_DOCS });
is("yt-dlp unaffected", t.rows[0].mark, "ok");
process.exit(bad ? 1 : 0);
