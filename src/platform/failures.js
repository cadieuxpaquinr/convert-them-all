/*
 * What went wrong with a download, in a sentence.
 *
 * yt-dlp says a lot, most of it meant for a terminal. This picks the one line
 * that matters and says what to do about it. The original text is kept and
 * shown behind Details, because the guess here can be wrong and the real
 * message must never be thrown away.
 */
(() => {
  const RULES = [
    {
      match: /no supported javascript runtime/i,
      title: "A JavaScript runtime is missing",
      detail: "YouTube scrambles its links, and yt-dlp needs a JavaScript runtime "
        + "to work them out. Node, Deno or Bun will do.",
      command: (how) => how.jsruntime
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
      command: (how) => how.ffmpeg
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
      detail: "The helper could not find it.",
      command: (how) => how.ytdlp
    },
    "no-helper": {
      title: "The helper is not running",
      detail: "Nothing answered. Check the Videos section for how to install it."
    },
    "helper-stopped": {
      title: "The helper stopped",
      detail: "It closed before the download finished."
    }
  };

  // The raw text is never dropped: the match above is a guess, and the real
  // message is what someone would paste into a bug report.
  function explain(result, os) {
    const how = CTAReady.commands(os);
    const raw = (result && (result.detail || result.message)) || "";
    const known = result && BY_REASON[result.reason];

    if (known) {
      return {
        title: known.title,
        detail: known.detail,
        command: known.command ? known.command(how) : "",
        raw
      };
    }

    for (const rule of RULES) {
      if (rule.match.test(raw)) {
        return {
          title: rule.title,
          detail: rule.detail,
          command: rule.command ? rule.command(how) : "",
          raw
        };
      }
    }

    return {
      title: "The download did not finish",
      detail: "yt-dlp stopped without a reason this add-on recognises.",
      command: "",
      raw
    };
  }

  window.CTAFailure = { explain };
})();
