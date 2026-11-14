const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/readiness.js`);
const R = window.CTAReady;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const base = (over) => Object.assign({
  type: "report", host: R.NEEDS_HOST,
  ytdlp: { found: true, version: "2026.10.26", install: "self" },
  ffmpeg: { found: true, version: "8.0.1" },
  jsruntime: { found: true, name: "node" },
  downloads: { path: "/home/x/Downloads", exists: true, writable: true },
  releases: { tags: ["2026.10.26", "2026.10.21", "2026.08.19", "2026.07.04"] }
}, over || {});

// The rule this whole change exists for: the app asks nobody to run an
// installer. Only updating a yt-dlp that is already there keeps a command.
const INSTALLERS = /install|apt|brew|winget|pipx|\.sh|\.ps1|powershell/i;
function noInstallCommands(name, thing) {
  const commands = [];
  if (thing.rows) for (const row of thing.rows) if (row.command) commands.push(row.command);
  if (thing.steps) for (const step of thing.steps) if (step.command) commands.push(step.command);
  if (thing.helper && thing.helper.command) commands.push(thing.helper.command);
  const offending = commands.filter((c) => INSTALLERS.test(c) && !/^sudo apt install --only-upgrade|upgrade/.test(c));
  is(name, offending, []);
}

// No helper at all: nothing is listed, because nothing can be looked for, and
// two programs the user cannot yet use are not two jobs worth giving them.
let t = R.tools(null, "linux");
is("nothing is listed", t.rows, []);
is("one line says what is needed", t.helper.text, R.NEEDS_SETUP);
is("and it is one sentence", t.helper.text.split(". ").length <= 2, true);
is("the instructions are offered", t.helper.link.text, "installation instructions");
is("pointing at this machine's section", t.helper.link.url,
  `${R.SETUP_DOCS}#linux`);
is("with a way back once it is done", t.helper.reload, true);
noInstallCommands("no installer is suggested anywhere", t);

t = R.tools({ type: "report", host: 1 }, "win");
is("an old helper lists nothing either", t.rows, []);
is("and says it is out of date",
  t.helper.text.startsWith("The plugin is out of date"), true);
is("with the windows section", t.helper.link.url, `${R.SETUP_DOCS}#windows`);
is("and the same way back", t.helper.reload, true);
noInstallCommands("nor for an old helper", t);

is("every platform has its own anchor",
  ["linux", "win", "mac"].map((os) => R.setupLink(os).url.split("#")[1]),
  ["linux", "windows", "macos"]);
is("and an unknown one still lands on the page",
  R.setupLink("fish").url, R.SETUP_DOCS);

// Everything current.
t = R.tools(base(), "linux");
is("no helper note", t.helper, null);
is("ytdlp ok", [t.rows[0].mark, t.rows[0].detail], ["ok", "2026.10.26, current."]);
is("ffmpeg ok", [t.rows[1].mark, t.rows[1].detail], ["ok", "8.0.1."]);
is("nothing to run", [t.rows[0].command, t.rows[1].command], ["", ""]);
is("and nothing to press", [t.rows[0].link, t.rows[1].link], [null, null]);

// Where a program came from, when it was not simply on the PATH.
t = R.tools(base({
  ytdlp: { found: true, version: "2026.10.26", install: "self", source: "set" },
  ffmpeg: { found: true, version: "8.0.1", source: "set" }
}), "win");
is("yt-dlp names the path that was set", t.rows[0].detail,
  "2026.10.26, current, from the path you set.");
is("and so does ffmpeg", t.rows[1].detail, "8.0.1, from the path you set.");

t = R.tools(base({
  ytdlp: { found: true, version: "2026.10.26", install: "self", source: "downloads" },
  ffmpeg: { found: true, version: "8.0.1", source: "downloads" }
}), "win");
is("a copy found in Downloads says so", t.rows[0].detail,
  "2026.10.26, current, found in your Downloads folder.");
is("ffmpeg too", t.rows[1].detail, "8.0.1, found in your Downloads folder.");

t = R.tools(base({
  ytdlp: { found: true, version: "2026.10.26", install: "self", source: "path" },
  ffmpeg: { found: true, version: "8.0.1", source: "path" }
}), "win");
is("and one on the PATH says nothing about it", t.rows[0].detail,
  "2026.10.26, current.");

// Missing: a link, and a word about the PATH, and no command.
t = R.tools(base({ ytdlp: { found: false } }), "win");
is("missing is bad", t.rows[0].mark, "bad");
is("with no command", t.rows[0].command, "");
is("a link instead", t.rows[0].link, { text: "Get yt-dlp", url: R.YTDLP_DOCS });
is("and it says the Downloads folder is looked in",
  t.rows[0].detail.includes("Downloads"), true);
is("with the PATH as the other way", t.rows[0].detail.includes("PATH"), true);
is("and Settings as the third", t.rows[0].detail.includes("Settings"), true);
noInstallCommands("still no installer", t);

t = R.tools(base({ ffmpeg: { found: false } }), "mac");
is("ffmpeg missing warns", t.rows[1].mark, "old");
is("with its own link", t.rows[1].link, { text: "Get ffmpeg", url: R.FFMPEG_DOCS });
is("and no command", t.rows[1].command, "");

// Windows has no ffmpeg of its own and yt-dlp bundles none, so it is sent to
// the builds yt-dlp publishes rather than to a page of other people's.
t = R.tools(base({ ffmpeg: { found: false } }), "win");
is("windows is sent to yt-dlp's own builds",
  t.rows[1].link.url, R.FFMPEG_BUILDS);
is("and the others are not", R.ffmpegLink("mac").url, R.FFMPEG_DOCS);
is("nor linux", R.ffmpegLink("linux").url, R.FFMPEG_DOCS);
is("the videos pane agrees",
  R.check(base({ ffmpeg: { found: false } }), "win").link.url, R.FFMPEG_BUILDS);

// Behind: the one place a command survives, and the right one for how it
// was installed.
t = R.tools(base({ ytdlp: { found: true, version: "2026.10.21", install: "self" } }),
  "linux");
is("one behind is old", t.rows[0].mark, "old");
is("and keeps its update command", t.rows[0].command, "yt-dlp -U");
is("with a link beside it", t.rows[0].link.text, "Update yt-dlp");
t = R.tools(base({ ytdlp: { found: true, version: "2026.08.19", install: "pipx" } }),
  "linux");
is("two behind is bad", t.rows[0].mark, "bad");
is("and pipx is named", t.rows[0].command, "pipx upgrade yt-dlp");
t = R.tools(base({ ytdlp: { found: true, version: "2019.01.01", install: "system" } }),
  "win");
is("a system install updates with winget on windows",
  t.rows[0].command, "winget upgrade yt-dlp.yt-dlp");

// check(), which is what the Videos pane shows.
let s = R.check(null, "mac");
is("no helper blocks", [s.id, s.blocking], ["no-helper", true]);
is("and says the one line", s.title, R.NEEDS_SETUP);
is("with nothing else to read", s.detail, "");
is("the instructions, for this platform", s.link.url, `${R.SETUP_DOCS}#macos`);
is("and the reload button", s.reload, true);
is("with no steps to follow", s.steps, []);
noInstallCommands("the videos pane asks for no installer either", s);

s = R.check({ type: "report", host: 2 }, "linux");
is("an old helper blocks", s.id, "helper-outdated");
is("and says what version is needed", s.detail.includes(String(R.NEEDS_HOST)), true);
is("pointing at the instructions", s.link.url, `${R.SETUP_DOCS}#linux`);
is("with the reload button too", s.reload, true);

s = R.check({ type: "error", detail: "it broke" }, "linux");
is("a broken helper blocks", s.id, "helper-broken");
is("and shows what it said", s.detail, "it broke");
is("while the line stays the same", s.title, R.NEEDS_SETUP);

// A working helper offers no reload button: there is nothing to install.
s = R.check(base(), "linux");
is("ready has no reload", s.reload, false);
is("nor does a missing yt-dlp",
  R.check(base({ ytdlp: { found: false } }), "linux").reload, false);

s = R.check(base({ ytdlp: { found: false } }), "linux");
is("no yt-dlp blocks", [s.id, s.blocking], ["no-ytdlp", true]);
is("with a link", s.link.text, "Get yt-dlp");
is("and no steps", s.steps, []);

s = R.check(base({ ytdlp: { found: true, broken: "exit 1" } }), "linux");
is("a broken yt-dlp blocks", s.id, "ytdlp-broken");
is("and shows why", s.detail, "exit 1");

s = R.check(base({ ytdlp: { found: true, version: "2026.08.19", install: "self" } }),
  "linux");
is("two behind still blocks", [s.id, s.blocking], ["ytdlp-expired", true]);
is("and keeps the update command", s.steps[0].command, "yt-dlp -U");

s = R.check(base({ ffmpeg: { found: false } }), "linux");
is("no ffmpeg warns without blocking", [s.id, s.blocking], ["no-ffmpeg", false]);
is("and links to it", s.link.text, "Get ffmpeg");

// A missing JavaScript runtime is not a problem until a download meets one.
// yt-dlp has an interpreter of its own, and YouTube works without Node, so
// warning in advance said something untrue. failures.js names it at the
// moment it is true instead.
s = R.check(base({ jsruntime: { found: false } }), "linux");
is("no runtime is simply ready", [s.id, s.blocking], ["ready", false]);
is("and nothing mentions one",
  /javascript|runtime|node/i.test(`${s.title} ${s.detail}`), false);
is("the ready line names the two that matter", s.detail,
  "yt-dlp 2026.10.26, ffmpeg 8.0.1. Saving to /home/x/Downloads.");
is("and says the same when a runtime is there",
  R.check(base(), "linux").detail,
  "yt-dlp 2026.10.26, ffmpeg 8.0.1. Saving to /home/x/Downloads.");

s = R.check(base({ downloads: { path: "/nope", exists: false } }), "linux");
is("a missing folder blocks", s.id, "no-folder");
is("and says where to fix it", s.steps[0].text.includes("Settings"), true);

s = R.check(base(), "linux");
is("everything in place is ready", [s.id, s.ready, s.blocking],
  ["ready", true, false]);
is("and reads as a summary",
  s.detail, "yt-dlp 2026.10.26, ffmpeg 8.0.1. Saving to /home/x/Downloads.");

// The updaters themselves, unchanged.
is("a self-updating copy", R.updateCommand("self", "linux"), "yt-dlp -U");
is("pip on windows", R.updateCommand("pip", "win"), "py -m pip install -U yt-dlp");
is("brew", R.updateCommand("brew", "mac"), "brew upgrade yt-dlp");
is("an unknown install falls back to the platform's",
  R.updateCommand("mystery", "win"), "winget upgrade yt-dlp.yt-dlp");

// Where the installed version sits.
is("the newest is zero behind",
  R.releasesBehind("2026.10.26", ["2026.10.26", "2026.10.21"]), 0);
is("one behind", R.releasesBehind("2026.10.21", ["2026.10.26", "2026.10.21"]), 1);
is("unknown to the list is as far behind as the list is long",
  R.releasesBehind("2019.01.01", ["2026.10.26", "2026.10.21"]), 2);
is("no list, no answer", R.releasesBehind("2026.10.26", []), null);
process.exit(bad ? 1 : 0);
