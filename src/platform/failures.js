/*
 * What went wrong with a download, in a sentence.
 *
 * yt-dlp says a lot, most of it meant for a terminal. This picks the one line
 * that matters and says what to do about it. The original text is kept and
 * shown behind Details, because the guess here can be wrong and the real
 * message must never be thrown away.
 */
(() => {
  const ISSUES = "https://github.com/cadieuxpaquinr/convert-them-all/issues/new";
  // A browser will carry a longer address than this, but a report nobody can
  // open is worth nothing, and the end of what yt-dlp said is the part that
  // matters.
  const MAX_ADDRESS = 6000;
  const MAX_RAW = 1500;

  const RULES = [
    {
      match: /no supported javascript runtime/i,
      title: "A JavaScript runtime is missing",
      detail: "This video needs one, which most do not: yt-dlp has an "
        + "interpreter of its own and only asks for an outside one on the "
        + "harder sites. Node, Deno or Bun will do.",
      link: () => ({ text: "Get Node", url: CTAReady.RUNTIME_DOCS })
    },
    {
      match: /http error 403|unable to download video data/i,
      title: "The site refused the download",
      detail: "Large sites change how they serve video, and an out-of-date yt-dlp is "
        + "the usual reason for this. Updating it fixes most of these.",
      command: (how) => how.update
    },
    {
      match: /remux|not supported.*container|cannot be remuxed/i,
      title: "mp4 cannot hold this video",
      detail: "The picture is in a codec mp4 does not carry. Choose "
        + "\u201cGuaranteed compatible\u201d in the options, which downloads a "
        + "version mp4 can always hold, or keep webm."
    },
    {
      match: /ffmpeg|ffprobe/i,
      title: "ffmpeg is needed for this video",
      detail: "The picture and the sound come separately and have to be joined.",
      link: (os) => CTAReady.ffmpegLink(os)
    },
    {
      match: /private video|sign in to confirm|members-only|login required|cookies/i,
      title: "That video needs an account",
      detail: "The site only serves it to someone signed in."
    },
    {
      match: /video unavailable|has been removed|not available in your country|geo/i,
      title: "That video is not available",
      detail: "It may have been removed, or it may not be served where you are."
    },
    {
      match: /unsupported url|no video could be found|unable to extract/i,
      title: "Nothing downloadable was found there",
      detail: "yt-dlp did not recognise a video on that page. The address of the page "
        + "itself usually works better than the address of the player."
    },
    {
      match: /http error 404|not found/i,
      title: "That address leads nowhere",
      detail: "The page or the file is gone."
    },
    {
      match: /name or service not known|temporary failure in name resolution|unable to connect|network is unreachable/i,
      title: "No connection",
      detail: "The network refused or could not be reached."
    },
    {
      match: /no space left/i,
      title: "The disk is full",
      detail: "There is no room left where the file was going."
    },
    {
      match: /permission denied|read-only file system/i,
      title: "That folder cannot be written to",
      detail: "Pick another one in Settings, under Downloads."
    }
  ];

  const BY_REASON = {
    "bad-url": {
      title: "That is not a web address",
      detail: "Only http and https links can be downloaded."
    },
    "bad-folder": {
      title: "The download folder cannot be used",
      detail: "Pick another one in Settings, under Downloads."
    },
    "no-ytdlp": {
      title: "yt-dlp is not installed",
      detail: "The plugin could not find it.",
      link: () => ({ text: "Get yt-dlp", url: CTAReady.YTDLP_DOCS })
    },
    "no-helper": {
      title: "The plugin is not running",
      detail: "Nothing answered.",
      link: (os) => CTAReady.setupLink(os)
    },
    "helper-stopped": {
      title: "The plugin stopped",
      detail: "It closed before the download finished."
    }
  };

  // The raw text is never dropped: the match above is a guess, and the real
  // message is what someone would paste into a bug report.
  function explain(result, os) {
    const how = CTAReady.commands(os);
    const raw = (result && (result.detail || result.message)) || "";
    const known = result && BY_REASON[result.reason];

    const found = known || RULES.find((rule) => rule.match.test(raw));
    if (found) {
      return {
        title: found.title,
        detail: found.detail,
        command: found.command ? found.command(how) : "",
        link: found.link ? found.link(os) : null,
        raw
      };
    }

    return {
      title: "The download did not finish",
      detail: "yt-dlp stopped without a reason this add-on recognises.",
      command: "",
      link: null,
      raw
    };
  }

  // What was asked for, in the words the panels use rather than the
  // arguments the helper built from them.
  function asked(format) {
    if (!format) return "unknown";
    const parts = [format.container];
    if (format.height) parts.push(`${format.height}p`);
    if (format.fps) parts.push(`${format.fps} fps`);
    if (format.vcodec) parts.push(format.vcodec);
    if (format.method) parts.push(format.method);
    if (format.bitrate) parts.push(`${format.bitrate} kbps`);
    if (format.sponsorblock) parts.push("skipping sponsors");
    return parts.join(", ");
  }

  function versions(report) {
    if (!report) return "the plugin did not answer";
    const ytdlp = report.ytdlp || {};
    const ffmpeg = report.ffmpeg || {};
    return `${report.platform || "unknown"} · plugin ${report.host} · `
      + `yt-dlp ${ytdlp.version || "missing"} · ffmpeg ${ffmpeg.version || "missing"}`;
  }

  // A filled-in issue, for the cases this guessed wrong and the ones it had
  // no guess for. The end of yt-dlp's output is kept rather than the start:
  // the error is always last.
  function report(why, context) {
    const at = context || {};
    const raw = String(why.raw || "");
    const tail = raw.length > MAX_RAW ? `…${raw.slice(-MAX_RAW)}` : raw;
    const body = [
      "**What happened**", why.title, "",
      "**Address**", at.url || "(not recorded)", "",
      "**This machine**", versions(at.report), `Asked for: ${asked(at.format)}`, "",
      "**yt-dlp said**", "```", tail || "(nothing)", "```", "",
      "**Anything else**", ""
    ].join("\n");

    const address = `${ISSUES}?title=${encodeURIComponent(`Download failed: ${why.title}`)}`
      + `&body=${encodeURIComponent(body)}`;
    if (address.length <= MAX_ADDRESS) return address;
    // Still too long, so the quoted output goes and the person can paste it.
    const bare = body.replace(tail || "(nothing)", "(removed: paste it here)");
    return `${ISSUES}?title=${encodeURIComponent(`Download failed: ${why.title}`)}`
      + `&body=${encodeURIComponent(bare)}`;
  }

  window.CTAFailure = { ISSUES, explain, report, asked };
})();
