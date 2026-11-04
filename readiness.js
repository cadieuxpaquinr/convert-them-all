/*
 * Is the machine able to download a video, and if not, what should be done.
 *
 * A pure function over the helper's report and the operating system, so every
 * outcome can be tested without uninstalling anything. The helper reports
 * facts; the wording and the commands live here, because only the add-on knows
 * which platform the person is looking at.
 *
 * One blocking problem is reported at a time: the first thing in the way, with
 * its fix, rather than a list to work through.
 */
(() => {
  // Raise this when the add-on starts needing something an older helper cannot
  // do. An out-of-date helper is then told to update instead of misbehaving.
  const NEEDS_HOST = 2;

  // yt-dlp warns about itself past 90 days, and it is right to: a copy from
  // March failed on YouTube with a bare 403 that a current one downloaded
  // without complaint. Matching its own threshold is the honest number.
  const STALE_DAYS = 90;

  const COMMANDS = {
    linux: {
      ytdlp: "sudo apt install yt-dlp",
      ffmpeg: "sudo apt install ffmpeg",
      python: "sudo apt install python3",
      update: "sudo apt install --only-upgrade yt-dlp",
      jsruntime: "sudo apt install nodejs",
      note: "On Debian and Ubuntu. Other distributions use their own package manager.",
      helper: "./host/install.sh"
    },
    win: {
      ytdlp: "winget install yt-dlp.yt-dlp",
      ffmpeg: "winget install Gyan.FFmpeg",
      python: "winget install Python.Python.3.12",
      update: "winget upgrade yt-dlp.yt-dlp",
      jsruntime: "winget install OpenJS.NodeJS",
      note: "In PowerShell or Terminal.",
      helper: "powershell -ExecutionPolicy Bypass -File host\\install.ps1"
    },
    mac: {
      ytdlp: "brew install yt-dlp",
      ffmpeg: "brew install ffmpeg",
      python: "brew install python",
      update: "brew upgrade yt-dlp",
      jsruntime: "brew install node",
      note: "With Homebrew.",
      helper: "./host/install.sh"
    }
  };

  function commands(os) {
    return COMMANDS[os] || COMMANDS.linux;
  }

  // yt-dlp versions are dates: 2026.03.17.
  function ageInDays(version, today) {
    const match = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(String(version || ""));
    if (!match) return null;
    const released = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Math.round((today.getTime() - released) / 86400000);
  }

  function state(id, blocking, title, detail, steps) {
    return { id, blocking, ready: id === "ready", title, detail, steps: steps || [] };
  }

  function check(report, os, today) {
    const now = today || new Date();
    const how = commands(os);

    if (!report) {
      return state("no-helper", true,
        "The helper is not installed",
        "Downloading a video needs a small program outside the browser, because an "
        + "add-on cannot run one itself. Images do not need it.",
        [{ text: "Run the installer from the add-on folder:", command: how.helper },
          { text: how.note }]);
    }

    if (report.type === "error" || typeof report.host !== "number") {
      return state("helper-broken", true,
        "The helper answered, but not with anything usable",
        report.detail || "It reported an error instead of a description of the machine.",
        [{ text: "Install it again:", command: how.helper }]);
    }

    if (report.host < NEEDS_HOST) {
      return state("helper-outdated", true,
        "The helper is out of date",
        `This add-on needs helper version ${NEEDS_HOST}, and the installed one is `
        + `version ${report.host}.`,
        [{ text: "Install it again from the add-on folder:", command: how.helper }]);
    }

    const ytdlp = report.ytdlp || {};
    if (!ytdlp.found) {
      return state("no-ytdlp", true,
        "Video downloads need yt-dlp",
        "yt-dlp is the program that knows how to read a video out of a web page. "
        + "The helper could not find it.",
        [{ text: "Install it:", command: how.ytdlp }, { text: how.note }]);
    }
    if (ytdlp.broken) {
      return state("ytdlp-broken", true,
        "yt-dlp is installed but will not run",
        ytdlp.broken,
        [{ text: "Install it again:", command: how.ytdlp }]);
    }

    const ffmpeg = report.ffmpeg || {};
    if (!ffmpeg.found) {
      return state("no-ffmpeg", false,
        "Without ffmpeg, some videos cannot be saved",
        "Sites such as YouTube send the picture and the sound separately, and ffmpeg "
        + "is what joins them. Videos that come as a single stream still work.",
        [{ text: "Install it:", command: how.ffmpeg }, { text: how.note }]);
    }

    const age = ageInDays(ytdlp.version, now);
    if (age !== null && age > STALE_DAYS) {
      return state("ytdlp-stale", false,
        `yt-dlp is ${Math.floor(age / 30)} months old`,
        "Sites change often, and an old copy fails on them in ways that look like "
        + "faults in this add-on.",
        [{ text: "Update it:", command: how.update }]);
    }

    const runtime = report.jsruntime || {};
    if (!runtime.found) {
      return state("no-jsruntime", false,
        "Sites that scramble their links will fail",
        "YouTube and others hide their addresses behind JavaScript, and yt-dlp needs "
        + "a runtime to work them out. Node, Deno or Bun will do. Other sites are "
        + "unaffected.",
        [{ text: "Install one:", command: how.jsruntime }, { text: how.note }]);
    }

    const folder = report.downloads || {};
    if (!folder.exists) {
      return state("no-folder", true,
        "The download folder does not exist",
        `Nothing is at ${folder.path || "the configured folder"}.`,
        [{ text: "Pick another one in Settings, under Downloads." }]);
    }
    if (!folder.writable) {
      return state("folder-readonly", true,
        "The download folder cannot be written to",
        `${folder.path} is not writable by you.`,
        [{ text: "Pick another one in Settings, under Downloads." }]);
    }

    return state("ready", false,
      "Ready",
      `yt-dlp ${ytdlp.version}, ffmpeg ${ffmpeg.version}, ${runtime.name}. `
      + `Saving to ${folder.path}.`,
      []);
  }

  window.CTAReady = { NEEDS_HOST, STALE_DAYS, commands, check };
})();
