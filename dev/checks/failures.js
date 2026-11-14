const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/readiness.js`);
// In a page, window.CTAReady is also the bare name CTAReady, which is how
// failures.js reaches it. Node does not do that, so it is said here.
global.CTAReady = window.CTAReady;
require(`${ROOT}/src/platform/failures.js`);
const F = window.CTAFailure;
const R = window.CTAReady;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const said = (text) => F.explain({ type: "error", reason: "ytdlp-failed", detail: text },
  "win");

// Real lines, as yt-dlp prints them.
const runtime = said("ERROR: [youtube] abc: Some tv client https formats have "
  + "been skipped as they are missing a url. No supported JavaScript runtime "
  + "is available. Please install Deno or Node.js");
is("a missing runtime is recognised", runtime.title,
  "A JavaScript runtime is missing");
is("and now offers a link, which it had stopped doing", runtime.link,
  { text: "Get Node", url: R.RUNTIME_DOCS });
is("and says it is the uncommon case",
  runtime.detail.includes("most do not"), true);

const ffmpeg = said("ERROR: Postprocessing: ffprobe and ffmpeg not found. "
  + "Please install or provide the path using --ffmpeg-location");
is("missing ffmpeg is recognised", ffmpeg.title, "ffmpeg is needed for this video");
is("and sends windows to yt-dlp's builds", ffmpeg.link.url, R.FFMPEG_BUILDS);
is("and everyone else to ffmpeg.org",
  F.explain({ reason: "ytdlp-failed", detail: "ffmpeg not found" }, "mac").link.url,
  R.FFMPEG_DOCS);

const old = said("ERROR: unable to download video data: HTTP Error 403: Forbidden");
is("a refusal blames the version", old.title, "The site refused the download");
is("and keeps the update command, which still works", old.command,
  "winget upgrade yt-dlp.yt-dlp");

const remux = said("ERROR: Postprocessing: Cannot remux: the formats are not "
  + "supported by the container mp4");
is("a container that cannot hold it", remux.title, "mp4 cannot hold this video");
is("with advice and no link", [remux.command, remux.link], ["", null]);

is("a private video", said("ERROR: Private video. Sign in if you've been granted "
  + "access to this video").title, "That video needs an account");
is("a dead address", said("ERROR: HTTP Error 404: Not Found").title,
  "That address leads nowhere");
is("no network", said("ERROR: unable to connect: [Errno -3] Temporary failure in "
  + "name resolution").title, "No connection");
is("a full disk", said("ERROR: unable to write data: [Errno 28] No space left on "
  + "device").title, "The disk is full");

// Reasons the helper itself gives, rather than yt-dlp.
is("no yt-dlp", F.explain({ reason: "no-ytdlp" }, "win").link,
  { text: "Get yt-dlp", url: R.YTDLP_DOCS });
is("no plugin at all", F.explain({ reason: "no-helper" }, "win").link.url,
  `${R.SETUP_DOCS}#windows`);
is("a bad folder has nothing to press",
  F.explain({ reason: "bad-folder" }, "win").link, null);

// Nothing recognised: an honest answer rather than a guess.
const lost = said("ERROR: something nobody has ever seen before");
is("an unknown failure says so", lost.title, "The download did not finish");
is("and suggests nothing", [lost.command, lost.link], ["", null]);
is("but keeps every word", lost.raw.includes("nobody has ever seen"), true);

// No rule may suggest a command that no longer exists, which is what the
// runtime rule was doing: how.jsruntime was deleted and nobody noticed.
const everything = [
  "no supported javascript runtime", "http error 403", "cannot be remuxed",
  "ffmpeg", "private video", "video unavailable", "unsupported url",
  "http error 404", "unable to connect", "no space left", "permission denied"
].map((text) => said(text));
is("no rule offers an empty command",
  everything.filter((why) => why.command === undefined || why.command === "undefined"),
  []);
is("and every link that exists is a real address",
  everything.filter((why) => why.link && !/^https:\/\//.test(why.link.url)), []);

// What was asked for, in the panels' own words.
is("a webm request", F.asked({ container: "webm", height: "1080", fps: "60",
  vcodec: "av01" }), "webm, 1080p, 60 fps, av01");
is("an mp4 request", F.asked({ container: "mp4", method: "compatible" }),
  "mp4, compatible");
is("audio", F.asked({ container: "mp3", bitrate: "192" }), "mp3, 192 kbps");
is("and nothing at all", F.asked(null), "unknown");

// The report.
const context = {
  url: "https://www.youtube.com/watch?v=abc123",
  format: { container: "mp4", height: "1080", method: "repackage" },
  report: { platform: "win32", host: 5, ytdlp: { version: "2026.10.26" },
    ffmpeg: { version: "8.0.1" } }
};
const address = F.report(remux, context);
const parsed = new URL(address);
is("it is an address a browser will open", parsed.origin, "https://github.com");
is("pointing at a new issue", parsed.pathname,
  "/cadieuxpaquinr/convert-them-all/issues/new");
is("titled with what happened", parsed.searchParams.get("title"),
  "Download failed: mp4 cannot hold this video");

const body = parsed.searchParams.get("body");
is("the body names the address", body.includes(context.url), true);
is("and the versions", body.includes("win32 · plugin 5 · yt-dlp 2026.10.26"), true);
is("and what was asked for", body.includes("Asked for: mp4, 1080p, repackage"), true);
is("and quotes yt-dlp", body.includes("Cannot remux"), true);
is("with somewhere to add more", body.includes("**Anything else**"), true);

// A download with no address recorded still reports.
is("a missing address is admitted",
  new URL(F.report(lost, {})).searchParams.get("body").includes("(not recorded)"),
  true);
is("and a plugin that never answered",
  new URL(F.report(lost, {})).searchParams.get("body")
    .includes("the plugin did not answer"), true);

// yt-dlp printing pages must not produce an address nothing will open.
const flood = said(`ERROR: ${"a very long line of output. ".repeat(2000)}`);
const long = F.report(flood, context);
is("a huge failure still fits", long.length <= 6000, true);
is("and keeps the end, where the error is",
  new URL(long).searchParams.get("body").includes("very long line of output"), true);
is("saying what it dropped, when it has to drop it",
  F.report(said("x".repeat(200000)), context).length <= 6000, true);
process.exit(bad ? 1 : 0);
