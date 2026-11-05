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

  // Counted in releases, not in days: yt-dlp shipped on 4 July, 19 August,
  // 21 October and 26 October, so days since a release say nothing about being
  // current. One behind is worth a word; two behind is where sites start
  // failing in ways that look like faults in this add-on, so the video side is
  // held shut until it is updated.
  const SUGGEST_BEHIND = 1;
  const FORCE_BEHIND = 2;

  // Only when the release list could not be fetched: a guess, and never a block.
  const BLIND_SUGGEST_DAYS = 90;

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

  // The wrong update command is worse than none: a copy in ~/.local/bin shadows
  // the one apt manages, so "apt install --only-upgrade" would appear to work
  // and change nothing at all.
  const UPDATERS = {
    self: () => "yt-dlp -U",
    pipx: () => "pipx upgrade yt-dlp",
    pip: (os) => (os === "win"
      ? "py -m pip install -U yt-dlp"
      : "python3 -m pip install -U yt-dlp"),
    brew: () => "brew upgrade yt-dlp",
    winget: () => "winget upgrade yt-dlp.yt-dlp",
    system: (os) => commands(os).update
  };

  function updateCommand(install, os) {
    const updater = UPDATERS[install];
    return updater ? updater(os) : commands(os).update;
  }

  // Where the installed version sits in the list of known releases.
  function releasesBehind(version, tags) {
    if (!version || !tags || !tags.length) return null;
    const at = tags.indexOf(String(version).trim());
    // Older than everything the list knows about: at least that many behind.
    return at === -1 ? tags.length : at;
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

    const tags = (report.releases || {}).tags || [];
    const behind = releasesBehind(ytdlp.version, tags);
    const update = updateCommand(ytdlp.install, os);

    if (behind !== null && behind >= FORCE_BEHIND) {
      return state("ytdlp-expired", true,
        `yt-dlp is ${behind} releases behind`,
        `You have ${ytdlp.version} and ${tags[0]} is out. Sites change what they `
        + "serve, and a copy this far behind fails on many of them, which looks "
        + "like a fault in this add-on rather than an old program. Video "
        + "downloads stay shut until it is updated.",
        [{ text: "Update it:", command: update }],
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

    if (behind !== null && behind >= SUGGEST_BEHIND) {
      return state("ytdlp-behind", false,
        `A newer yt-dlp is out: ${tags[0]}`,
        `You have ${ytdlp.version}. Some sites may not work until it is updated. `
        + "Nothing is blocked yet.",
        [{ text: "Update it:", command: update }],
        { text: "Update yt-dlp", url: YTDLP_DOCS });
    }

    // No release list, so the only measure left is the date on the copy itself.
    // It can suggest, never block: being offline is not being out of date.
    const age = ageInDays(ytdlp.version, now);
    if (behind === null && age !== null && age > BLIND_SUGGEST_DAYS) {
      return state("ytdlp-maybe-old", false,
        `yt-dlp is ${days(age)} old`,
        "The list of releases could not be fetched, so whether a newer one exists "
        + "is unknown. A copy this old usually is behind.",
        [{ text: "Update it:", command: update }],
        { text: "Update yt-dlp", url: YTDLP_DOCS });
    }

    return state("ready", false,
      "Ready",
      `yt-dlp ${ytdlp.version}, ffmpeg ${ffmpeg.version}, ${runtime.name}. `
      + `Saving to ${folder.path}.`,
      []);
  }

  window.CTAReady = {
    NEEDS_HOST, SUGGEST_BEHIND, FORCE_BEHIND, YTDLP_DOCS,
    commands, updateCommand, releasesBehind, check
  };
})();
