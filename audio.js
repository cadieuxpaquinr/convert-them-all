/*
 * The Audio pane: the file to work on, what to make of it, and the download.
 *
 * It mirrors the Images pane, and differs in two ways. There is no preview,
 * because a player is a feature of its own and this is a converter; what sits
 * there instead is what the file turned out to be. And the sample rate is
 * chosen before the file is read rather than after, which is how
 * decodeAudioData works. The encoding itself lives in audioconvert.js.
 */
(() => {
  const el = {};
  let placeholder = "";
  let src = null;
  let result = null;
  let picked = null;

  function size(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} kB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  function clock(seconds) {
    const whole = Math.round(seconds);
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
  }

  function enable(on) {
    for (const node of [el.format, el.rate, el.depth, el.name, el.convert,
      el.download]) {
      node.disabled = !on;
    }
  }

  function facts(pairs) {
    el.facts.textContent = "";
    for (const [term, value] of pairs) {
      const line = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      line.append(dt, dd);
      el.facts.appendChild(line);
    }
  }

  function replaceResult(next) {
    if (result) URL.revokeObjectURL(result.url);
    result = next;
  }

  function fillFormats() {
    for (const target of CTAAudioConvert.FORMATS) {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = CTAAudioConvert.available(target)
        ? target.label
        : `${target.label} - COMING SOON`;
      option.disabled = !CTAAudioConvert.available(target);
      el.format.appendChild(option);
    }
    for (const rate of CTAAudioConvert.RATES) {
      const option = document.createElement("option");
      option.value = String(rate);
      option.textContent = `${rate} Hz`;
      el.rate.appendChild(option);
    }
    for (const depth of CTAWav.DEPTHS) {
      const option = document.createElement("option");
      option.value = String(depth);
      option.textContent = depth === 32 ? "32-bit float" : `${depth}-bit`;
      el.depth.appendChild(option);
    }
  }

  async function convert() {
    const target = CTAAudioConvert.format(el.format.value);
    if (!CTAAudioConvert.available(target)) {
      CTAMessages.say(`${target ? target.label : "That format"} is not available `
        + "yet.", true);
      return;
    }

    el.state.textContent = "Converting…";
    el.convert.disabled = true;
    try {
      const next = await CTAAudioConvert.run({
        file: src.file,
        format: target.id,
        sampleRate: el.rate.value,
        bitDepth: el.depth.value
      });
      replaceResult(next);
      el.state.textContent = `Converted to ${target.label}`;
      facts([
        ["Name", src.file.name],
        ["Length", clock(next.seconds)],
        ["Channels", next.channels === 1 ? "mono" : `${next.channels}`],
        ["Sample rate", `${next.sampleRate} Hz`],
        ["Depth", next.bitDepth === 32 ? "32-bit float" : `${next.bitDepth}-bit`],
        ["Size", `${size(src.file.size)} → ${size(next.size)}`]
      ]);
      CTAMessages.say(`Converted to ${target.label}, ${size(next.size)}.`);
    } catch (e) {
      el.state.textContent = "Original";
      CTAMessages.say(`Could not convert: ${e.message}`, true);
    } finally {
      el.convert.disabled = !src;
    }
  }

  // Before a conversion this saves the file as it came in, which is why it
  // carries the source extension rather than the one picked in the list.
  async function download() {
    const target = result || {
      url: URL.createObjectURL(src.file),
      ext: CTAConvert.extensionFrom(src.file.name) || "audio"
    };
    const filename = CTAConvert.fileName(el.name.value, target.ext);
    try {
      await browser.downloads.download({ url: target.url, filename, saveAs: false });
      CTAMessages.say(`Saved as ${filename}.`);
    } catch (e) {
      CTAMessages.say("Could not save that file.", true);
    }
    if (!result) URL.revokeObjectURL(target.url);
  }

  // The one way in. A file, or null to empty the pane.
  function load(file) {
    if (!el.selection) return;
    replaceResult(null);
    src = file ? { file } : null;
    el.selection.textContent = file ? `Selected: ${file.name}` : placeholder;
    el.state.textContent = "Original";
    enable(!!file);

    if (!file) {
      facts([]);
      return;
    }
    el.name.value = CTAConvert.nameFrom(file.name);
    // What is known before anything is decoded. The rest arrives with the
    // conversion, because reading it means decoding it anyway.
    facts([
      ["Name", file.name],
      ["Type", file.type || "unknown"],
      ["Size", size(file.size)]
    ]);
  }

  function mount() {
    el.selection = document.getElementById("audio-selection");
    el.pick = document.getElementById("pick-audio");
    el.file = document.getElementById("audio-file");
    el.facts = document.getElementById("audio-facts");
    el.state = document.getElementById("audio-state");
    el.format = document.getElementById("audio-format");
    el.rate = document.getElementById("audio-rate");
    el.depth = document.getElementById("audio-depth");
    el.name = document.getElementById("audio-name");
    el.convert = document.getElementById("audio-convert");
    el.download = document.getElementById("audio-download");

    placeholder = el.selection.textContent;

    fillFormats();
    el.format.value = CTAAudioConvert.FORMATS[0].id;
    el.rate.value = String(CTAAudioConvert.DEFAULT_RATE);
    el.depth.value = "16";

    el.pick.addEventListener("click", () => el.file.click());
    el.file.addEventListener("change", () => {
      const file = el.file.files[0];
      // Cleared so that picking the same file twice still fires a change.
      el.file.value = "";
      if (file && picked) picked(file, "audio");
    });
    el.convert.addEventListener("click", () => convert().catch(() => {}));
    el.download.addEventListener("click", () => download().catch(() => {}));

    enable(false);
    facts([]);
  }

  // The shell routes what is picked, because only it knows the other panes.
  function onPick(handler) {
    picked = handler;
  }

  window.CTAAudio = { mount, file: load, onPick };
})();
