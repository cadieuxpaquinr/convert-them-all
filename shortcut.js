(() => {
  const COMMAND = "primary-action";
  const SAVED = "savedShortcut";

  // Disabled is read back from Firefox, not from a stored flag, so clearing the
  // shortcut from Manage Extension Shortcuts cannot desync the checkboxes.
  async function state() {
    const all = await browser.commands.getAll();
    const command = all.find((c) => c.name === COMMAND);
    const shortcut = (command && command.shortcut) || "";
    return { shortcut, disabled: !shortcut };
  }

  async function disable() {
    const { shortcut } = await state();
    if (shortcut) await browser.storage.local.set({ [SAVED]: shortcut });
    await browser.commands.update({ name: COMMAND, shortcut: "" });
  }

  // Shared so the menu and the settings window cannot drift apart.
  function label(disabled) {
    return disabled ? "Shortcut disabled" : "Disable shortcut";
  }

  async function enable() {
    const stored = await browser.storage.local.get(SAVED);
    if (stored[SAVED]) {
      await browser.commands.update({ name: COMMAND, shortcut: stored[SAVED] });
    } else {
      await browser.commands.reset(COMMAND);
    }
  }

  window.CTAShortcut = { COMMAND, state, label, disable, enable };
})();
