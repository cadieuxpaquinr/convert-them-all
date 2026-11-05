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

  // yt-dlp chases sites that change under it constantly. A week old is worth
  // mentioning; a fortnight old is not worth trusting, and a copy from March
  // failed on YouTube with a bare 403 that a current one downloaded without
  // complaint. Past the second number the download is refused rather than
  // allowed to fail in a way that looks like a fault in this add-on.
  const SUGGEST_DAYS = 7;
  const FORCE_DAYS = 15;

  // The project's own page, which outlives any package name written down here.
  const YTDLP_DOCS = "https://github.com/yt-dlp/yt-dlp#installation";

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

  // Days up to a month: rounding 14 and 16 both to "2 weeks" would make the two
  // sides of the limit read the same, which is the one thing this must not do.
  function days(count) {
    if (count < 31) return `${count} days`;
    if (count < 365) return `${Math.round(count / 30)} months`;
    const years = count / 365;
    return years < 1.5 ? "over a year" : `${Math.round(years)} years`;
  }

  function state(id, blocking, title, detail, steps, link) {
    return {
      id, blocking, ready: id === "ready", title, detail,
      steps: steps || [],
      link: link || null
    };
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
        [{ text: "Install it:", command: how.ytdlp }, { text: how.note }],
        { text: "Get yt-dlp", url: YTDLP_DOCS });
    }
    if (ytdlp.broken) {
      return state("ytdlp-broken", true,
        "yt-dlp is installed but will not run",
        ytdlp.broken,
        [{ text: "Install it again:", command: how.ytdlp }],
        { text: "Get yt-dlp", url: YTDLP_DOCS });
    }

    const age = ageInDays(ytdlp.version, now);
    if (age !== null && age > FORCE_DAYS) {
      return state("ytdlp-expired", true,
        `yt-dlp is ${days(age)} old and cannot be relied on`,
        "Sites change what they serve from week to week, and a copy this old fails "
        + "on most of them. Downloading is held back until it is updated, because "
        + "the failures look like faults in this add-on rather than an old program.",
        [{ text: "Update it:", command: how.update }],
        { text: "Update yt-dlp", url: YTDLP_DOCS });
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

    // Nothing is in the way from here on: what follows is worth saying, but
    // downloading still works.
    const ffmpeg = report.ffmpeg || {};
    if (!ffmpeg.found) {
      return state("no-ffmpeg", false,
        "Without ffmpeg, some videos cannot be saved",
        "Sites such as YouTube send the picture and the sound separately, and ffmpeg "
        + "is what joins them. Videos that come as a single stream still work.",
        [{ text: "Install it:", command: how.ffmpeg }, { text: how.note }]);
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

    if (age !== null && age > SUGGEST_DAYS) {
      return state("ytdlp-old", false,
        `yt-dlp is ${days(age)} old`,
        "Updating it now and then is what keeps downloads working, since sites "
        + "change often. Nothing is blocked yet.",
        [{ text: "Update it:", command: how.update }],
        { text: "Update yt-dlp", url: YTDLP_DOCS });
    }

    return state("ready", false,
      "Ready",
      `yt-dlp ${ytdlp.version}, ffmpeg ${ffmpeg.version}, ${runtime.name}. `
      + `Saving to ${folder.path}.`,
      []);
  }

  window.CTAReady = {
    NEEDS_HOST, SUGGEST_DAYS, FORCE_DAYS, YTDLP_DOCS, commands, check
  };
})();
