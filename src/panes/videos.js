/*
 * The Videos pane: the link to work on, the output to produce, and the download.
 *
 * There is no preview any more. A thumbnail needs a media address, and the
 * common case has none: a site streaming in pieces hands over nothing, or a
 * blob: that only its own page can read. The box was empty in every real test.
 * What sits there instead is the choice: the output on the left, and whatever
 * that output has to offer on the right.
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
  // What the link in the box turned out to offer, or null while unknown.
  let probed = null;
  // The last failure, kept so the report can quote it.
  let failure = null;
  // The output and its options, remembered between sessions.
  let choice = null;

  function short(url) {
    return url.length > MAX_URL ? `${url.slice(0, MAX_URL)}…` : url;
  }

  function size(bytes) {
    if (!bytes) return "unknown size";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
  }

  function setStatus(message, isError) {
    CTAMessages.say(message, isError ? "error" : "ok");
  }

  function showDetails(raw) {
    el.raw.textContent = raw || "";
    el.details.hidden = !raw;
  }

  // What a failure leaves on screen: the fix, when there is one worth
  // pressing, and a way to say that this was wrong. Both go when the next
  // download starts, because they belong to the one that failed.
  function showFailure(why, context) {
    const there = !!why;
    el.failed.hidden = !there;
    el.fix.hidden = !(there && why.link);
    if (!there) {
      failure = null;
      return;
    }
    failure = { why, context };
    if (why.link) el.fix.textContent = why.link.text;
  }

  function busy(on) {
    el.url.disabled = on || blocked;
    el.download.disabled = on || blocked;
    el.detect.disabled = on || blocked;
    el.cancel.hidden = !on;
    el.progress.hidden = !on;
  }

  function remember() {
    CTAVideoPrefs.save(choice).catch(() => {});
  }

  // Says the one thing the panels cannot: that asking for mp4 costs resolution
  // on this particular video.
  function showOffers() {
    const heights = (probed && probed.heights) || [];
    if (!heights.length) {
      el.offers.hidden = true;
      return;
    }
    const best = heights[0];
    const mp4 = ((probed && probed.mp4Heights) || [])[0];
    el.offers.textContent = mp4 && mp4 < best
      ? `This video goes up to ${best}p, and to ${mp4}p as compatible mp4.`
      : `This video goes up to ${best}p.`;
    el.offers.hidden = false;
  }

  function renderOptions() {
    el.options.textContent = "";
    let hint = "";

    for (const field of CTAVideoFormat.fields(choice.container)) {
      if (field.hint) hint = field.hint;

      if (field.type === "check") {
        const row = document.createElement("label");
        row.className = "check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.id = `opt-${field.id}`;
        // The segment database covers YouTube and nothing else, so the tick is
        // only live when the link is one.
        const usable = !field.youtubeOnly
          || CTAVideoFormat.isYouTube(el.url.value.trim());
        box.disabled = !usable;
        box.checked = usable && !!choice[field.id];
        box.addEventListener("change", () => {
          choice[field.id] = box.checked;
          remember();
        });
        const text = document.createElement("span");
        text.textContent = field.label;
        if (!usable) row.classList.add("off");
        row.append(box, text);
        el.options.appendChild(row);
        continue;
      }

      const row = document.createElement("label");
      row.className = "field";
      const name = document.createElement("span");
      name.textContent = field.label;
      const select = document.createElement("select");
      select.id = `opt-${field.id}`;

      for (const option of field.options) {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        item.disabled = !CTAVideoFormat.offers(field.id, option.value, choice, probed);
        select.appendChild(item);
      }

      select.value = choice[field.id];
      // Something remembered that this video cannot give falls back to the best
      // it has, rather than sitting there as a choice that would be ignored.
      const picked = select.options[select.selectedIndex];
      if (!picked || picked.disabled) {
        select.value = field.options[0].value;
        choice[field.id] = select.value;
      }

      select.addEventListener("change", () => {
        choice[field.id] = select.value;
        remember();
        // Which resolutions are reachable depends on how mp4 is made.
        if (field.id === "method") renderOptions();
      });

      row.append(name, select);
      el.options.appendChild(row);
    }

    el.optionHint.textContent = hint;
    el.optionHint.hidden = !hint;
    showOffers();
  }

  async function start() {
    choice = await CTAVideoPrefs.read();
    for (const output of CTAVideoFormat.OUTPUTS) {
      const item = document.createElement("option");
      item.value = output.id;
      item.textContent = output.label;
      el.output.appendChild(item);
    }
    el.output.value = choice.container;
    el.output.addEventListener("change", () => {
      choice.container = el.output.value;
      remember();
      renderOptions();
    });
    renderOptions();
  }

  // Reading what a video offers costs a call to the site, so it happens when
  // the link settles rather than on every keystroke. Not knowing greys nothing.
  async function ask() {
    const url = el.url.value.trim();
    probed = null;
    renderOptions();
    if (!url || blocked) return;
    el.offers.textContent = "Reading what this video offers…";
    el.offers.hidden = false;
    const tools = await CTATools.forRequest().catch(() => null);
    const answer = await CTANative.ask(
      tools ? { type: "probe", url, tools } : { type: "probe", url }, 70000);
    probed = answer && answer.type === "formats" ? answer : null;
    renderOptions();
  }

  async function download() {
    const url = el.url.value.trim();
    if (!url) {
      setStatus("Paste a link first, or detect one on the page.", true);
      return;
    }
    showDetails("");
    showFailure(null);
    busy(true);
    el.progress.textContent = "Starting…";

    const directory = await CTAFolder.read().catch(() => "");
    const tools = await CTATools.forRequest().catch(() => null);
    const request = { type: "download", url, directory,
      format: CTAVideoFormat.intent(choice) };
    if (tools) request.tools = tools;
    const result = await CTANative.job(
      request,
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
    showFailure(why, {
      url,
      format: CTAVideoFormat.intent(choice),
      report: await CTAReport.get().catch(() => null)
    });
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
    await ask();
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
    // The second button belongs to the states that ask for an installation:
    // pressing it asks the helper again, which is all a finished one needs.
    el.helperReload.hidden = !state.reload;
    el.recheck.hidden = state.reload;
    el.helperActions.hidden = state.ready;
  }

  async function paint(report) {
    await CTAPlatform.ready.catch(() => {});
    paintHelper(CTAReady.check(report, CTAPlatform.os()));
  }

  function waiting() {
    el.helperTitle.textContent = "Checking what this computer can do…";
    el.helperDetail.textContent = "";
    el.helperSteps.textContent = "";
  }

  // The shared report: the home page asks the same question, and the helper
  // should not be started twice to answer it.
  async function refresh() {
    waiting();
    await paint(await CTAReport.get());
  }

  async function recheck() {
    waiting();
    await paint(await CTAReport.refresh());
  }

  function mount() {
    el.helper = document.getElementById("video-helper");
    el.helperTitle = document.getElementById("helper-title");
    el.helperDetail = document.getElementById("helper-detail");
    el.helperSteps = document.getElementById("helper-steps");
    el.helperActions = document.getElementById("helper-actions");
    el.helperLink = document.getElementById("helper-link");
    el.helperReload = document.getElementById("helper-reload");
    el.recheck = document.getElementById("helper-recheck");
    el.tools = document.getElementById("video-tools");
    el.selection = document.getElementById("video-selection");
    el.url = document.getElementById("video-url");
    el.detect = document.getElementById("video-detect");
    el.download = document.getElementById("video-download");
    el.cancel = document.getElementById("video-cancel");
    el.progress = document.getElementById("video-progress");
    el.details = document.getElementById("video-details");
    el.raw = document.getElementById("video-raw");
    el.output = document.getElementById("video-output");
    el.options = document.getElementById("video-options");
    el.optionHint = document.getElementById("video-option-hint");
    el.offers = document.getElementById("video-offers");
    el.failed = document.getElementById("video-failed");
    el.fix = document.getElementById("video-fix");
    el.report = document.getElementById("video-report");

    placeholder = el.selection.textContent;

    document.getElementById("helper-recheck")
      .addEventListener("click", () => recheck().catch(() => {}));
    document.getElementById("helper-reload")
      .addEventListener("click", () => recheck().catch(() => {}));
    // Checked again from the home page: this pane follows, rather than keeping
    // an answer the user has just acted on.
    CTAReport.onChange((report) => paint(report).catch(() => {}));
    // The background places the tab in a normal window: this one is a popup.
    el.helperLink.addEventListener("click", () => {
      if (link) {
        browser.runtime.sendMessage({ type: "open-url", url: link.url }).catch(() => {});
      }
    });
    el.download.addEventListener("click", () => download().catch(() => {}));
    // Both open in a normal window: this one is a popup.
    el.fix.addEventListener("click", () => {
      if (failure && failure.why.link) {
        browser.runtime.sendMessage({ type: "open-url", url: failure.why.link.url })
          .catch(() => {});
      }
    });
    el.report.addEventListener("click", () => {
      if (!failure) return;
      browser.runtime.sendMessage({
        type: "open-url",
        url: CTAFailure.report(failure.why, failure.context)
      }).catch(() => {});
    });
    el.detect.addEventListener("click", () => detect().catch(() => {}));
    el.cancel.addEventListener("click", () => CTANative.stop());
    el.url.addEventListener("keydown", (e) => {
      if (e.key === "Enter") download().catch(() => {});
    });
    // change fires when the field settles, which is when the probe is worth it.
    el.url.addEventListener("change", () => ask().catch(() => {}));

    el.selection.textContent = placeholder;
    showFailure(null);
    start().catch(() => {});
    refresh().catch(() => {});
  }

  // The page address is what yt-dlp reads best, and for a streamed video it is
  // the only one there is: the element itself has none.
  function set(url, page) {
    if (!el.selection) return;
    const link = page || url;
    if (link) {
      el.url.value = link;
      showDetails("");
      ask().catch(() => {});
    }
    el.selection.textContent = link
      ? `From: ${short(link)}`
      : placeholder;
  }

  window.CTAVideos = { mount, set, refresh };
})();
