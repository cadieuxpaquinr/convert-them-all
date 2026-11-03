/*
 * The Settings pane: shortcut, app window geometry, theme. Mounted by app.js.
 */
(() => {
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

  function mount() {
    const input = document.getElementById("shortcut");
    const status = document.getElementById("status");
    const save = document.getElementById("save");
    const checkbox = document.getElementById("disable-shortcut");
    const shortcutLabel = document.getElementById("shortcut-label");
    const fields = {
      left: document.getElementById("win-x"),
      top: document.getElementById("win-y"),
      width: document.getElementById("win-width"),
      height: document.getElementById("win-height")
    };
    let pending = "";

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
    async function loadShortcut() {
      const { shortcut, disabled } = await CTAShortcut.state();
      show(shortcut);
      checkbox.checked = disabled;
      shortcutLabel.textContent = CTAShortcut.label(disabled);
      input.disabled = disabled;
      save.disabled = disabled;
    }

    function showGeometry(g) {
      fields.left.value = "left" in g ? g.left : "";
      fields.top.value = "top" in g ? g.top : "";
      fields.width.value = g.width;
      fields.height.value = g.height;
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
      await loadShortcut();
    });

    save.addEventListener("click", async () => {
      if (!pending) {
        setStatus("Pick a shortcut first.", true);
        return;
      }
      try {
        await browser.commands.update({ name: CTAShortcut.COMMAND, shortcut: pending });
        setStatus("Saved.");
      } catch (e) {
        setStatus("Could not save that shortcut.", true);
      }
    });

    document.getElementById("reset").addEventListener("click", async () => {
      try {
        await browser.commands.reset(CTAShortcut.COMMAND);
        await loadShortcut();
        setStatus("Reset to default.");
      } catch (e) {
        setStatus("Could not reset the shortcut.", true);
      }
    });

    // Repainted from what was stored, so a clamped value is visible instead of
    // the one that was typed.
    document.getElementById("geometry-save").addEventListener("click", async () => {
      try {
        showGeometry(await CTAGeometry.save({
          left: fields.left.value,
          top: fields.top.value,
          width: fields.width.value,
          height: fields.height.value
        }));
        setStatus("Window size saved.");
      } catch (e) {
        setStatus("Could not save the window size.", true);
      }
    });

    document.getElementById("geometry-reset").addEventListener("click", async () => {
      try {
        showGeometry(await CTAGeometry.reset());
        setStatus("Window size reset to default.");
      } catch (e) {
        setStatus("Could not reset the window size.", true);
      }
    });

    for (const radio of document.querySelectorAll('input[name="theme"]')) {
      radio.addEventListener("change", () => {
        CTATheme.set(radio.value)
          .catch(() => setStatus("Could not save the theme.", true));
      });
    }

    async function loadTheme() {
      const value = await CTATheme.current();
      const radio = document.querySelector(`input[name="theme"][value="${value}"]`);
      if (radio) radio.checked = true;
    }

    async function loadGeometry() {
      showGeometry(await CTAGeometry.read());
    }

    // A failed platform lookup must still leave a usable form: load on the default
    // path rather than leaving every field blank with only a console message.
    CTAPlatform.ready
      .catch(() => {})
      .then(loadShortcut)
      .catch(() => setStatus("Could not read the current shortcut.", true));

    loadGeometry().catch(() => {});
    loadTheme().catch(() => {});
  }

  window.CTASettings = { mount };
})();
