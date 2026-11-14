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
  // Must match HOST_VERSION in host/cta_host.py. It sat at 2 while the helper
  // had moved to 3, so a helper left behind by an older install counted as
  // current and then refused every probe as an unknown request.
  const NEEDS_HOST = 5;

  // Counted in releases, not in days: yt-dlp shipped on 4 July, 19 August,
  // 21 October and 26 October, so days since a release say nothing about being
  // current. One behind is worth a word; two behind is where sites start
  // failing in ways that look like faults in this add-on, so the video side is
  // held shut until it is updated.
  const SUGGEST_BEHIND = 1;
  const FORCE_BEHIND = 2;

  // Only when the release list could not be fetched: a guess, and never a block.
  const BLIND_SUGGEST_DAYS = 90;

  // The projects' own pages, which outlive any package name written down here.
  // Nobody installs an add-on and then runs a command it printed at them, so
  // the app links to these and never asks for a shell. The one-time setup of
  // the helper itself lives in the project's own readme, behind a link, for
  // whoever is willing.
  const YTDLP_DOCS = "https://github.com/yt-dlp/yt-dlp#installation";
  const FFMPEG_DOCS = "https://ffmpeg.org/download.html";
  const RUNTIME_DOCS = "https://nodejs.org/en/download";
  const SETUP_DOCS =
    "https://github.com/cadieuxpaquinr/convert-them-all#install";

  const GET_YTDLP = { text: "Get yt-dlp", url: YTDLP_DOCS };
  const UPDATE_YTDLP = { text: "Update yt-dlp", url: YTDLP_DOCS };
  const GET_FFMPEG = { text: "Get ffmpeg", url: FFMPEG_DOCS };
  const GET_RUNTIME = { text: "Get Node", url: RUNTIME_DOCS };
  const SETUP = { text: "How to set this up", url: SETUP_DOCS };

  // Said wherever a program is missing: the PATH is what makes everything
  // find it, and Settings is the way out when that is not wanted.
  const WHERE = "Put it on your PATH, or say where it is in Settings, "
    + "under Programs.";

  // Only updating is left as a command. "yt-dlp -U" is one word, it works,
  // and a program that is already installed was installed somehow, which is
  // what decides the right way to update it.
  const COMMANDS = {
    linux: { update: "sudo apt install --only-upgrade yt-dlp" },
    win: { update: "winget upgrade yt-dlp.yt-dlp" },
    mac: { update: "brew upgrade yt-dlp" }
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
        "Video downloads are not set up yet",
        "Downloading a video needs a small program outside the browser, because an "
        + "add-on cannot run one itself. It is a one-time setup, and images, "
        + "audio, documents and the rest do not need it.",
        [], SETUP);
    }

    if (report.type === "error" || typeof report.host !== "number") {
      return state("helper-broken", true,
        "The helper answered, but not with anything usable",
        report.detail || "It reported an error instead of a description of the machine.",
        [], SETUP);
    }

    if (report.host < NEEDS_HOST) {
      return state("helper-outdated", true,
        "The helper is out of date",
        `This add-on needs helper version ${NEEDS_HOST}, and the installed one is `
        + `version ${report.host}. Setting it up again replaces it.`,
        [], SETUP);
    }

    const ytdlp = report.ytdlp || {};
    if (!ytdlp.found) {
      return state("no-ytdlp", true,
        "Video downloads need yt-dlp",
        "yt-dlp is the program that knows how to read a video out of a web page. "
        + `The helper could not find it. ${WHERE}`,
        [], GET_YTDLP);
    }
    if (ytdlp.broken) {
      return state("ytdlp-broken", true,
        "yt-dlp is there but will not run",
        ytdlp.broken,
        [], GET_YTDLP);
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
        UPDATE_YTDLP);
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
        + `is what joins them. Videos that come as a single stream still work. ${WHERE}`,
        [], GET_FFMPEG);
    }

    const runtime = report.jsruntime || {};
    if (!runtime.found) {
      return state("no-jsruntime", false,
        "Sites that scramble their links will fail",
        "YouTube and others hide their addresses behind JavaScript, and yt-dlp needs "
        + "a runtime to work them out. Node, Deno or Bun will do. Other sites are "
        + "unaffected.",
        [], GET_RUNTIME);
    }

    if (behind !== null && behind >= SUGGEST_BEHIND) {
      return state("ytdlp-behind", false,
        `A newer yt-dlp is out: ${tags[0]}`,
        `You have ${ytdlp.version}. Some sites may not work until it is updated. `
        + "Nothing is blocked yet.",
        [{ text: "Update it:", command: update }],
        UPDATE_YTDLP);
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
        UPDATE_YTDLP);
    }

    return state("ready", false,
      "Ready",
      `yt-dlp ${ytdlp.version}, ffmpeg ${ffmpeg.version}, ${runtime.name}. `
      + `Saving to ${folder.path}.`,
      []);
  }

  // The same report, read one program at a time, for the home page's list.
  // check() answers "can this machine download", which is one state and one
  // fix; this answers "what is installed", which is a row each and stays on
  // screen whether or not anything is wrong.
  function row(id, name, mark, detail, command, link) {
    return { id, name, mark, detail, command: command || "", link: link || null };
  }

  // Nothing can be detected through a helper that is absent or too old, and
  // guessing would be worse than saying so.
  function helperUsable(report) {
    return !!report && report.type !== "error"
      && typeof report.host === "number" && report.host >= NEEDS_HOST;
  }

  function ytdlpRow(report, os) {
    const ytdlp = report.ytdlp || {};

    if (!ytdlp.found) {
      return row("ytdlp", "yt-dlp", "bad",
        "Not found. It is what reads a video out of a web page, and video "
        + `downloads need it. ${WHERE}`, "", GET_YTDLP);
    }
    if (ytdlp.broken) {
      return row("ytdlp", "yt-dlp", "bad",
        `There but will not run. ${ytdlp.broken}`, "", GET_YTDLP);
    }

    const tags = (report.releases || {}).tags || [];
    const behind = releasesBehind(ytdlp.version, tags);
    const update = updateCommand(ytdlp.install, os);

    if (behind !== null && behind >= FORCE_BEHIND) {
      return row("ytdlp", "yt-dlp", "bad",
        `${ytdlp.version}, ${behind} releases behind. ${tags[0]} is out, and a `
        + "copy this far behind fails on many sites. Video downloads stay shut "
        + "until it is updated.", update, UPDATE_YTDLP);
    }
    if (behind !== null && behind >= SUGGEST_BEHIND) {
      return row("ytdlp", "yt-dlp", "old",
        `${ytdlp.version}, one release behind. It still works, and ${tags[0]} is `
        + "out. Some sites may need the newer one.", update, UPDATE_YTDLP);
    }

    const age = ageInDays(ytdlp.version, new Date());
    if (behind === null && age !== null && age > BLIND_SUGGEST_DAYS) {
      return row("ytdlp", "yt-dlp", "old",
        `${ytdlp.version}, ${days(age)} old. The release list could not be `
        + "fetched, so whether a newer one is out is unknown.", update, UPDATE_YTDLP);
    }
    const where = ytdlp.configured ? ", from the path you set" : "";
    if (behind === null) {
      return row("ytdlp", "yt-dlp", "ok", `${ytdlp.version}${where}.`);
    }
    return row("ytdlp", "yt-dlp", "ok", `${ytdlp.version}, current${where}.`);
  }

  function ffmpegRow(report) {
    const ffmpeg = report.ffmpeg || {};
    if (ffmpeg.found) {
      // Worth saying when it came from Settings rather than the PATH: that is
      // the one the user has to keep up to date themselves.
      return row("ffmpeg", "ffmpeg", "ok",
        ffmpeg.configured ? `${ffmpeg.version}, from the path you set.`
          : `${ffmpeg.version}.`);
    }
    // Missing ffmpeg costs some videos, not all of them, so the row warns
    // rather than refusing.
    return row("ffmpeg", "ffmpeg", "old",
      "Not found. Sites such as YouTube send the picture and the sound "
      + "separately, and ffmpeg is what joins them. Videos that come as one "
      + `stream still work without it. ${WHERE}`, "", GET_FFMPEG);
  }

  function tools(report, os) {
    if (!helperUsable(report)) {
      const why = report
        ? "The helper is out of date, so nothing can be detected."
        : "Video downloads need a one-time setup, and nothing about them can "
          + "be detected until it is done.";
      return {
        rows: [
          row("ytdlp", "yt-dlp", "unknown", "Cannot tell yet.", "", GET_YTDLP),
          row("ffmpeg", "ffmpeg", "unknown", "Cannot tell yet.", "", GET_FFMPEG)
        ],
        helper: { text: why, link: SETUP }
      };
    }
    return { rows: [ytdlpRow(report, os), ffmpegRow(report)], helper: null };
  }

  window.CTAReady = {
    NEEDS_HOST, SUGGEST_BEHIND, FORCE_BEHIND, YTDLP_DOCS, FFMPEG_DOCS,
    RUNTIME_DOCS, SETUP_DOCS,
    commands, updateCommand, releasesBehind, check, tools
  };
})();
