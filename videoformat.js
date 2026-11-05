/*
 * What can be asked for, and what this particular video can actually give.
 *
 * The left panel picks the output; the right panel is whatever that output has
 * to offer. Both are described here rather than in the markup, so every
 * combination can be checked without a browser, and so the add-on sends intent
 * rather than arguments: the helper builds the command from its own whitelist.
 */
(() => {
  const OUTPUTS = [
    { id: "webm", label: "webm - Best quality" },
    { id: "mp4", label: "mp4" },
    { id: "mp3", label: "mp3 - Audio only" }
  ];

  const HEIGHTS = [
    { value: "", label: "Best available" },
    { value: "2160", label: "2160p" },
    { value: "1440", label: "1440p" },
    { value: "1080", label: "1080p" },
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
    { value: "360", label: "360p" }
  ];

  // Crowd-sourced segment data, and only YouTube is covered by it.
  const SPONSOR = {
    id: "sponsorblock",
    label: "Skip sponsored segments (BETA feature - YouTube only)",
    type: "check",
    youtubeOnly: true
  };

  const FIELDS = {
    webm: [
      { id: "height", label: "Resolution", options: HEIGHTS },
      {
        id: "fps",
        label: "Frame rate",
        options: [
          { value: "", label: "Best available" },
          { value: "60", label: "60 fps" },
          { value: "30", label: "30 fps" }
        ]
      },
      {
        id: "vcodec",
        label: "Codec",
        options: [
          { value: "", label: "Any" },
          { value: "av01", label: "AV1" },
          { value: "vp9", label: "VP9" },
          { value: "avc1", label: "H.264" }
        ]
      },
      SPONSOR
    ],
    mp4: [
      { id: "height", label: "Resolution", options: HEIGHTS },
      {
        id: "method",
        label: "How",
        options: [
          { value: "repackage", label: "Keep quality, repackage" },
          { value: "compatible", label: "Guaranteed compatible" }
        ],
        // Said once, where the choice is made, rather than left to be found out
        // when a file will not play or a resolution quietly drops.
        hint: "Repackaging keeps the best picture but fails on videos mp4 cannot "
          + "hold. Compatible always plays, and is limited to the resolutions the "
          + "site offers in H.264."
      },
      SPONSOR
    ],
    mp3: [
      {
        id: "bitrate",
        label: "Bitrate",
        options: [
          { value: "", label: "Best available" },
          { value: "320", label: "320 kbps" },
          { value: "256", label: "256 kbps" },
          { value: "192", label: "192 kbps" },
          { value: "128", label: "128 kbps" },
          { value: "96", label: "96 kbps" }
        ]
      },
      { id: "keepVideo", label: "Keep the video file as well", type: "check" }
    ]
  };

  function defaults() {
    return {
      container: "webm",
      height: "",
      fps: "",
      vcodec: "",
      method: "repackage",
      bitrate: "",
      keepVideo: false,
      sponsorblock: false
    };
  }

  function fields(container) {
    return FIELDS[container] || FIELDS.webm;
  }

  // Which heights are reachable: asking mp4 to stay compatible limits it to what
  // the site serves in H.264, which is where a 1080p video becomes a 480p file.
  function heightsFor(choice, probe) {
    if (!probe) return null;
    const compatible = choice.container === "mp4" && choice.method === "compatible";
    const list = compatible ? probe.mp4Heights : probe.heights;
    return Array.isArray(list) && list.length ? list : null;
  }

  // "Best available" is never greyed: it asks for whatever exists.
  function offers(fieldId, value, choice, probe) {
    if (!value) return true;
    if (!probe) return true;
    if (fieldId === "height") {
      const heights = heightsFor(choice, probe);
      return !heights || heights.includes(Number(value));
    }
    if (fieldId === "fps") {
      const rates = probe.fps;
      return !Array.isArray(rates) || !rates.length || rates.includes(Number(value));
    }
    if (fieldId === "vcodec") {
      const codecs = probe.vcodecs;
      return !Array.isArray(codecs) || !codecs.length || codecs.includes(value);
    }
    // Audio is re-encoded, so every bitrate is reachable whatever the source is.
    return true;
  }

  // Only what this output uses: sending a frame rate with an mp3 request would
  // be noise, and the helper would refuse anything it does not expect anyway.
  function intent(choice) {
    const picked = Object.assign(defaults(), choice || {});
    if (picked.container === "mp3") {
      return {
        container: "mp3",
        bitrate: picked.bitrate,
        keepVideo: !!picked.keepVideo
      };
    }
    if (picked.container === "mp4") {
      return {
        container: "mp4",
        height: picked.height,
        method: picked.method,
        sponsorblock: !!picked.sponsorblock
      };
    }
    return {
      container: "webm",
      height: picked.height,
      fps: picked.fps,
      vcodec: picked.vcodec,
      sponsorblock: !!picked.sponsorblock
    };
  }

  // The segment database only covers YouTube, so the tick is offered only when
  // the link is one. Read from the address, which needs no call to anything.
  function isYouTube(url) {
    try {
      const host = new URL(String(url)).hostname.replace(/^www\./, "");
      return host === "youtube.com" || host === "m.youtube.com"
        || host === "youtu.be" || host === "music.youtube.com";
    } catch (e) {
      return false;
    }
  }

  window.CTAVideoFormat = {
    OUTPUTS, fields, defaults, offers, intent, isYouTube
  };
})();
