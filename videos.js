/*
 * The Videos pane: the video the "Convert to…" entry handed over, and nothing
 * more. There is no video converter yet, so this only shows what arrived.
 *
 * Same shape as images.js, so the conversion work has somewhere to land.
 */
(() => {
  const MAX_URL = 120;

  const el = {};
  let placeholder = "";
  // Where the helper notice's button points, when it has one.
  let link = null;
  // Set when the machine cannot download at all: the controls are held shut
  // rather than left to fail in a way that looks like a fault here.
  let blocked = false;

  function short(url) {
    return url.length > MAX_URL ? `${url.slice(0, MAX_URL)}…` : url;
  }

  function size(bytes) {
    if (!bytes) return "unknown size";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle("error", !!isError);
  }

  function showDetails(raw) {
    el.raw.textContent = raw || "";
    el.details.hidden = !raw;
  }

  function busy(on) {
    el.url.disabled = on || blocked;
    el.download.disabled = on || blocked;
    el.detect.disabled = on || blocked;
    el.cancel.hidden = !on;
    el.progress.hidden = !on;
  }

  async function download() {
    const url = el.url.value.trim();
    if (!url) {
      setStatus("Paste a link first, or detect one on the page.", true);
      return;
    }
    showDetails("");
    setStatus("");
    busy(true);
    el.progress.textContent = "Starting…";

    const directory = await CTAFolder.read().catch(() => "");
    const result = await CTANative.job(
      { type: "download", url, directory },
      (step) => {
        el.progress.textContent =
          `${step.percent || ""} at ${step.speed || "?"}, ${step.eta || "?"} left`;
      }
    );

    busy(false);
    if (result && result.type === "done") {
      setStatus(`Saved ${result.name}, ${size(result.bytes)}.`);
      return;
    }
    if (result && result.reason === "cancelled") {
      setStatus("Stopped.");
      return;
    }
    await CTAPlatform.ready.catch(() => {});
    const why = CTAFailure.explain(result, CTAPlatform.os());
    setStatus(`${why.title}. ${why.detail}`
      + (why.command ? ` Try: ${why.command}` : ""), true);
    showDetails(why.raw);
  }

  // The app window is a popup, so it is never the active tab itself. The
  // background holds the last normal window and reads the address from there.
  async function detect() {
    showDetails("");
    let answer = null;
    try {
      answer = await browser.runtime.sendMessage({ type: "active-url" });
    } catch (e) {
      answer = null;
    }
    if (!answer || !answer.url) {
      setStatus("No page to read. Open one in a normal window first.", true);
      return;
    }
    el.url.value = answer.url;
    setStatus(answer.title ? `Found: ${answer.title}` : "Found the page address.");
  }

  // What the machine can do, and what to do about it when it cannot. The whole
  // video side is gated on this; images never ask.
  function paintHelper(state) {
    el.helper.className = `notice ${state.ready ? "ready" : state.blocking ? "blocked" : "warn"}`;
    // Ready needs no headline: the versions and the folder are the useful part,
    // and they are what the line becomes.
    el.helperTitle.textContent = state.title;
    el.helperTitle.hidden = state.ready;
    el.helperDetail.textContent = state.detail;
    el.helperSteps.textContent = "";
    for (const step of state.steps) {
      const item = document.createElement("li");
      item.textContent = step.text;
      if (step.command) {
        const command = document.createElement("code");
        command.textContent = step.command;
        item.appendChild(command);
      }
      el.helperSteps.appendChild(item);
    }
    blocked = state.blocking;
    el.tools.classList.toggle("gated", blocked);
    busy(false);
    link = state.link;
    el.helperLink.hidden = !link;
    if (link) el.helperLink.textContent = link.text;
    el.helperActions.hidden = state.ready;
  }

  async function refresh() {
    el.helperTitle.textContent = "Checking what this computer can do…";
    el.helperDetail.textContent = "";
    el.helperSteps.textContent = "";
    const report = await CTANative.ping();
    await CTAPlatform.ready.catch(() => {});
    paintHelper(CTAReady.check(report, CTAPlatform.os()));
  }

  function mount() {
    el.helper = document.getElementById("video-helper");
    el.helperTitle = document.getElementById("helper-title");
    el.helperDetail = document.getElementById("helper-detail");
    el.helperSteps = document.getElementById("helper-steps");
    el.helperActions = document.getElementById("helper-actions");
    el.helperLink = document.getElementById("helper-link");
    el.tools = document.getElementById("video-tools");
    el.selection = document.getElementById("video-selection");
    el.url = document.getElementById("video-url");
    el.detect = document.getElementById("video-detect");
    el.download = document.getElementById("video-download");
    el.cancel = document.getElementById("video-cancel");
    el.status = document.getElementById("video-status");
    el.progress = document.getElementById("video-progress");
    el.details = document.getElementById("video-details");
    el.raw = document.getElementById("video-raw");
    el.preview = document.getElementById("video-preview");
    el.missing = document.getElementById("video-missing");

    placeholder = el.selection.textContent;

    // A video streamed in pieces has a blob: address that only its own page can
    // read, so failing to load is expected rather than exceptional.
    el.preview.addEventListener("error", () => {
      el.preview.hidden = true;
      el.missing.hidden = false;
    });

    // A thumbnail, never a player: seek a little way in so a frame is painted,
    // rather than the black one many files start with. Seeking rather than a
    // #t= fragment on the URL, which a blob: address will not take.
    el.preview.addEventListener("loadedmetadata", () => {
      const duration = el.preview.duration;
      const at = Number.isFinite(duration) ? Math.min(0.1, duration / 2) : 0.1;
      try {
        el.preview.currentTime = at;
      } catch (e) {
        // Some sources refuse to seek; the first frame will have to do.
      }
    });

    document.getElementById("helper-recheck")
      .addEventListener("click", () => refresh().catch(() => {}));
    // The background places the tab in a normal window: this one is a popup.
    el.helperLink.addEventListener("click", () => {
      if (link) {
        browser.runtime.sendMessage({ type: "open-url", url: link.url }).catch(() => {});
      }
    });
    el.download.addEventListener("click", () => download().catch(() => {}));
    el.detect.addEventListener("click", () => detect().catch(() => {}));
    el.cancel.addEventListener("click", () => CTANative.stop());
    el.url.addEventListener("keydown", (e) => {
      if (e.key === "Enter") download().catch(() => {});
    });

    reset();
    refresh().catch(() => {});
  }

  function clearPreview() {
    el.preview.hidden = true;
    el.preview.removeAttribute("src");
  }

  // Nothing handed over yet.
  function reset() {
    el.selection.textContent = placeholder;
    el.missing.hidden = true;
    clearPreview();
  }

  // No address at all is the certain case: a site that plays video in pieces
  // feeds the element directly and leaves nothing to point at. Saying so beats
  // leaving the pane looking as though the click did nothing.
  //
  // Anything else is judged by whether it loads, not by how it looks. A blob:
  // address can be perfectly good, from a picked file, or useless, from another
  // page, and only trying tells the two apart.
  function set(url, page) {
    if (!el.selection) return;
    if (page || url) {
      el.url.value = page || url;
      setStatus("");
      showDetails("");
    }
    if (!url) {
      el.selection.textContent = page
        ? "That video is streamed in pieces, so there is no frame to show. The page "
          + "address is in the box above, and yt-dlp can read the video from it."
        : "That video has no address of its own. The site streams it in pieces, so "
          + "there is nothing here to show or to save.";
      el.missing.hidden = true;
      clearPreview();
      return;
    }
    el.selection.textContent = `Selected: ${short(url)}`;
    el.missing.hidden = true;
    el.preview.hidden = false;
    el.preview.src = url;
  }

  window.CTAVideos = { mount, set, refresh };
})();
