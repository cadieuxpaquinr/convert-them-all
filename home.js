/*
 * The home page: what the app needs from outside the browser, and whether it
 * is there.
 *
 * yt-dlp and ffmpeg used to be discovered the hard way, by opening Videos and
 * finding it shut. The all-sites permission was worse hidden, three clicks into
 * Settings, so most people met it as a prompt in the middle of converting
 * something. Both are setup, and setup belongs where the app opens.
 *
 * The rows stay on screen whether or not anything is wrong: the versions are
 * worth seeing, and a list that disappears when it is happy teaches nobody
 * where to look when it is not.
 */
(() => {
  const MARKS = { ok: "✓", old: "○", bad: "✕", unknown: "?" };

  const el = {};

  // The app window is a popup: the background puts the tab in a normal window
  // rather than navigating this one away from itself.
  function open(url) {
    browser.runtime.sendMessage({ type: "open-url", url }).catch(() => {});
  }

  function mark(kind) {
    const span = document.createElement("span");
    span.className = "mark";
    span.dataset.mark = kind;
    span.textContent = MARKS[kind] || MARKS.unknown;
    return span;
  }

  function drawRow(row) {
    const item = document.createElement("li");
    item.id = `tool-${row.id}`;
    const what = document.createElement("div");
    what.className = "what";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.name;
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = row.detail;
    what.append(name, detail);

    if (row.command) {
      const command = document.createElement("code");
      command.textContent = row.command;
      what.appendChild(command);
    }
    if (row.link) {
      const actions = document.createElement("div");
      actions.className = "row";
      const button = document.createElement("button");
      button.textContent = row.link.text;
      button.addEventListener("click", () => open(row.link.url));
      actions.appendChild(button);
      what.appendChild(actions);
    }

    item.append(mark(row.mark), what);
    return item;
  }

  function paintTools(answer) {
    el.tools.textContent = "";
    for (const row of answer.rows) el.tools.appendChild(drawRow(row));
    // Said once, under the list, rather than twice over in two rows that can
    // only report the same absence.
    el.helper.textContent = answer.helper
      ? `${answer.helper.text} Run the installer from the add-on folder: `
        + `${answer.helper.command}. ${answer.helper.note}`
      : "";
    el.helper.hidden = !answer.helper;
  }

  function waiting() {
    el.tools.textContent = "";
    const item = document.createElement("li");
    const what = document.createElement("div");
    what.className = "what";
    what.textContent = "Looking at what is installed…";
    item.append(mark("unknown"), what);
    el.tools.appendChild(item);
    el.helper.hidden = true;
  }

  async function paint(report) {
    await CTAPlatform.ready.catch(() => {});
    paintTools(CTAReady.tools(report, CTAPlatform.os()));
  }

  async function load() {
    waiting();
    await paint(await CTAReport.get());
  }

  async function recheck() {
    waiting();
    await paint(await CTAReport.refresh());
  }

  // Granted here, removed in Settings: taking it away opens a dialog about what
  // is left behind, and that belongs in one place.
  async function paintAccess() {
    let all = false;
    try {
      all = await CTAAccess.hasAll();
    } catch (e) {
      all = false;
    }
    el.accessMark.dataset.mark = all ? "ok" : "old";
    el.accessMark.textContent = all ? MARKS.ok : MARKS.old;
    el.accessDetail.textContent = all
      ? "Conversions are allowed on every site. You can take this back any time "
        + "in Settings."
      : "Optional. Without it the add-on asks for each site as you convert from "
        + "it. Allowing every site at once stops the prompts, and you can change "
        + "it any time in Settings.";
    el.accessActions.hidden = all;
  }

  function mount() {
    el.tools = document.getElementById("home-tools");
    el.helper = document.getElementById("home-helper");
    el.accessMark = document.querySelector("#home-access .mark");
    el.accessDetail = document.getElementById("access-detail");
    el.accessActions = document.getElementById("access-actions");

    document.getElementById("home-recheck")
      .addEventListener("click", () => recheck().catch(() => {}));

    // Straight from the click: Firefox only grants a request still inside the
    // gesture that asked for it.
    document.getElementById("access-allow").addEventListener("click", async () => {
      let granted = false;
      try {
        granted = await CTAAccess.requestAll();
      } catch (e) {
        granted = false;
      }
      CTAMessages.say(granted ? "Conversions allowed on all sites."
        : "Permission refused.", !granted);
      await paintAccess();
    });

    // Settings, the Add-ons page and another app window can all change this.
    CTAAccess.onChange(() => paintAccess().catch(() => {}));
    // Checked again from the Videos pane: this list follows.
    CTAReport.onChange((report) => paint(report).catch(() => {}));

    load().catch(() => {});
    paintAccess().catch(() => {});
  }

  window.CTAHome = { mount, recheck };
})();
