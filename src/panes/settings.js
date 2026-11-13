/*
 * The Settings pane: shortcut, app window geometry, theme. Mounted by app.js.
 */
(() => {
  // How many allowed sites the dialog names before it counts the rest.
  const LISTED = 3;

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
      CTAMessages.say(message, isError ? "error" : "ok");
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

    // The rectangle windows.getCurrent() reports is the one windows.create()
    // takes, so what is stored here reopens the window exactly where it sits.
    document.getElementById("geometry-current").addEventListener("click", async () => {
      try {
        const win = await browser.windows.getCurrent();
        // Wayland never tells a window where it is, so Firefox has 0,0 to report
        // and placing the window again would do nothing either. Keep the size and
        // leave the position unset, which centres the window next time rather
        // than pinning it to the top-left corner.
        const unplaced = !win.left && !win.top;
        showGeometry(await CTAGeometry.save(unplaced
          ? { width: win.width, height: win.height }
          : { left: win.left, top: win.top, width: win.width, height: win.height }));
        setStatus(unplaced
          ? "Saved the size only: this system reports no window position, as Wayland "
            + "does, and X and Y have no effect there."
          : "Saved this window's size and position.");
      } catch (e) {
        setStatus("Could not read this window.", true);
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

    const folderField = document.getElementById("download-folder");

    // The helper checks the folder, not the add-on: it is the one that has to
    // write there, and it refuses anything outside the user's home.
    document.getElementById("folder-save").addEventListener("click", async () => {
      const path = folderField.value.trim();
      if (!path) {
        await CTAFolder.clear();
        setStatus("Using the usual Downloads folder.");
        return;
      }
      const answer = await CTANative.ask({ type: "check-folder", path });
      if (!answer || answer.type !== "folder") {
        setStatus("The helper did not answer, so the folder was not checked.", true);
        return;
      }
      if (!answer.exists) {
        setStatus(`${answer.path} does not exist.`, true);
        return;
      }
      if (!answer.writable) {
        setStatus(`${answer.path} cannot be written to.`, true);
        return;
      }
      await CTAFolder.save(answer.path);
      folderField.value = answer.path;
      setStatus("Downloads will be saved there.");
    });

    document.getElementById("folder-default").addEventListener("click", async () => {
      await CTAFolder.clear();
      folderField.value = "";
      setStatus("Using the usual Downloads folder.");
    });

    async function loadFolder() {
      folderField.value = await CTAFolder.read();
    }

    const allSites = document.getElementById("all-sites");
    const dialog = document.getElementById("sites-dialog");
    const sitesCount = document.getElementById("sites-count");
    const sitesList = document.getElementById("sites-list");
    const sitesRest = document.getElementById("sites-rest");
    const sitesKeep = document.getElementById("sites-keep");
    const sitesRemove = document.getElementById("sites-remove");

    // Shown after the all-sites grant goes, because the sites allowed one at a
    // time survive it and nothing else in Firefox offers to clear them from here.
    async function openSites() {
      let sites = [];
      try {
        sites = await CTAAccess.grantedSites();
      } catch (e) {
        sites = [];
      }
      sitesList.textContent = "";
      // Only the first few, so a long list cannot push the buttons off screen.
      for (const origin of sites.slice(0, LISTED)) {
        const item = document.createElement("li");
        item.textContent = CTAAccess.hostOf(origin) || origin;
        sitesList.appendChild(item);
      }
      if (sites.length > LISTED) {
        const item = document.createElement("li");
        item.textContent = `and ${sites.length - LISTED} more`;
        sitesList.appendChild(item);
      }
      const many = sites.length > 1;
      sitesCount.textContent =
        `${sites.length} site${many ? "s are" : " is"} still allowed one at a time:`;
      sitesRest.hidden = !sites.length;
      sitesRemove.hidden = !sites.length;
      sitesKeep.textContent = sites.length ? "Keep current permissions" : "Close";
      dialog.showModal();
    }

    sitesKeep.addEventListener("click", () => dialog.close());

    sitesRemove.addEventListener("click", async () => {
      try {
        await CTAAccess.revokeSites();
        setStatus("Site permissions removed.");
      } catch (e) {
        setStatus("Could not remove the site permissions.", true);
      }
      dialog.close();
    });

    // Read back from Firefox, never from the click, so a refused prompt leaves
    // the box showing what is really granted.
    async function loadAccess() {
      allSites.checked = await CTAAccess.hasAll();
    }

    allSites.addEventListener("change", async () => {
      try {
        if (allSites.checked) {
          const granted = await CTAAccess.requestAll();
          setStatus(granted ? "Conversions allowed on all sites."
            : "Permission refused.", !granted);
        } else {
          await CTAAccess.revokeAll();
          setStatus("Conversions ask for one site at a time again.");
          await loadAccess();
          await openSites();
          return;
        }
      } catch (e) {
        setStatus("Could not change the site permission.", true);
      }
      await loadAccess();
    });

    // The Add-ons page and any other app window can change this too.
    CTAAccess.onChange(() => loadAccess().catch(() => {}));

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
    loadAccess().catch(() => {});
    loadFolder().catch(() => {});
  }

  window.CTASettings = { mount };
})();
