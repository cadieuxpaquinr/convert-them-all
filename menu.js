// Set this to the branch name while testing a dev build, and the menu footer shows
// it, so reloading a temporary add-on visibly confirms which build Firefox took:
//   const BRANCH = "0.0.1/menu-and-settings-ui";
// Empty, or "main", shows the version alone.
const BRANCH = "";

const REPO = "https://github.com/cadieuxpaquinr/convert-them-all";
const ISSUES = `${REPO}/issues`;
const AUTHOR = "https://www.linkedin.com/in/raphael-cadieux-paquin";

// Await the message before closing: closing the panel first tears down this
// context and the message can be dropped in flight.
async function run(message) {
  await browser.runtime.sendMessage(message);
  window.close();
}

const primary = document.getElementById("primary");
const settings = document.getElementById("settings");
const report = document.getElementById("report");
const about = document.getElementById("about");
const follow = document.getElementById("follow");
const checkbox = document.getElementById("disable-shortcut");
const label = document.getElementById("shortcut-label");

primary.addEventListener("click", () => run({ type: "primary-action" }));
settings.addEventListener("click", () => run({ type: "open-settings" }));
report.addEventListener("click", () => run({ type: "open-url", url: ISSUES }));
about.addEventListener("click", () => run({ type: "open-url", url: REPO }));
follow.addEventListener("click", () => run({ type: "open-url", url: AUTHOR }));

function paint(disabled) {
  checkbox.checked = disabled;
  label.textContent = CTAShortcut.label(disabled);
}

// Unlike the buttons, toggling leaves the panel open.
checkbox.addEventListener("change", async () => {
  const wanted = checkbox.checked;
  try {
    await (wanted ? CTAShortcut.disable() : CTAShortcut.enable());
    paint(wanted);
  } catch (e) {
    paint(!wanted);
  }
});

// Firefox gives these rows no arrow key navigation, which a menu is expected to have.
const items = [primary, checkbox, settings, report, about, follow];

document.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const current = items.indexOf(document.activeElement);
  const from = current < 0 ? (step > 0 ? -1 : 0) : current;
  items[(from + step + items.length) % items.length].focus();
});

const manifest = browser.runtime.getManifest();
document.getElementById("build").textContent =
  BRANCH && BRANCH !== "main"
    ? `${manifest.name} v${manifest.version} · ${BRANCH}`
    : `${manifest.name} v${manifest.version}`;

// On failure show the enabled label, which is what the markup already says, rather
// than leaving the row contradicting the real state with only a console message.
CTAShortcut.state().then((s) => paint(s.disabled)).catch(() => paint(false));
