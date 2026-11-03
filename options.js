const COMMAND = CTAShortcut.COMMAND;
const input = document.getElementById("shortcut");
const status = document.getElementById("status");
const save = document.getElementById("save");
const checkbox = document.getElementById("disable-shortcut");
const shortcutLabel = document.getElementById("shortcut-label");
let pending = "";

const KEY_NAMES = {
  " ": "Space",
  ",": "Comma",
  ".": "Period",
  "ArrowUp": "Up",
  "ArrowDown": "Down",
  "ArrowLeft": "Left",
  "ArrowRight": "Right",
  "PageUp": "PageUp",
  "PageDown": "PageDown",
  "Home": "Home",
  "End": "End",
  "Insert": "Insert",
  "Delete": "Delete"
};

function setStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("error", !!isError);
}

function mainKey(e) {
  if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^[0-9]$/.test(e.key)) return e.key;
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.key;
  return null;
}

// pending holds the manifest string Save sends to Firefox; the field shows the
// platform spelling of it, which on macOS is not the same text.
function show(shortcut) {
  pending = shortcut;
  input.value = CTAPlatform.display(shortcut);
}

// The single painter: every change reloads from Firefox, so a rejected call
// leaves the form showing what is really bound rather than what was clicked.
async function load() {
  const { shortcut, disabled } = await CTAShortcut.state();
  show(shortcut);
  checkbox.checked = disabled;
  shortcutLabel.textContent = CTAShortcut.label(disabled);
  input.disabled = disabled;
  save.disabled = disabled;
}

input.addEventListener("keydown", (e) => {
  e.preventDefault();
  const key = mainKey(e);
  if (!key) return;

  const mods = CTAPlatform.modifiers(e);
  if (!mods) {
    setStatus(CTAPlatform.metaRejected(), true);
    return;
  }

  const isFunctionKey = /^F([1-9]|1[0-2])$/.test(key);
  if (!CTAPlatform.hasPrimary(mods) && !isFunctionKey) {
    setStatus(CTAPlatform.primaryHint(), true);
    return;
  }

  show(mods.concat(key).join("+"));
  setStatus("");
});

checkbox.addEventListener("change", async () => {
  const wanted = checkbox.checked;
  try {
    await (wanted ? CTAShortcut.disable() : CTAShortcut.enable());
    setStatus(wanted ? "Shortcut disabled." : "Shortcut enabled.");
  } catch (e) {
    setStatus("Could not change the shortcut.", true);
  }
  await load();
});

save.addEventListener("click", async () => {
  if (!pending) {
    setStatus("Pick a shortcut first.", true);
    return;
  }
  try {
    await browser.commands.update({ name: COMMAND, shortcut: pending });
    setStatus("Saved.");
  } catch (e) {
    setStatus("Could not save that shortcut.", true);
  }
});

document.getElementById("reset").addEventListener("click", async () => {
  try {
    await browser.commands.reset(COMMAND);
    await load();
    setStatus("Reset to default.");
  } catch (e) {
    setStatus("Could not reset the shortcut.", true);
  }
});

const nav = document.getElementById("sections");

nav.addEventListener("click", (e) => {
  const name = e.target.dataset && e.target.dataset.section;
  if (!name) return;
  for (const button of nav.children) {
    const selected = button === e.target;
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    document.getElementById(button.dataset.section).hidden = !selected;
  }
});

async function loadTheme() {
  const value = await CTATheme.current();
  const radio = document.querySelector(`input[name="theme"][value="${value}"]`);
  if (radio) radio.checked = true;
}

for (const radio of document.querySelectorAll('input[name="theme"]')) {
  radio.addEventListener("change", () => {
    CTATheme.set(radio.value).catch(() => setStatus("Could not save the theme.", true));
  });
}

// A failed platform lookup must still leave a usable form: load on the default
// path rather than leaving every field blank with only a console message.
CTAPlatform.ready
  .catch(() => {})
  .then(load)
  .catch(() => setStatus("Could not read the current shortcut.", true));

loadTheme().catch(() => {});
