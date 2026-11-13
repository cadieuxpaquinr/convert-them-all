/*
 * Owns the whole platform table so no caller branches on the OS.
 *
 * Three paths everywhere it matters: default/linux, windows, mac. Only mac and
 * win differ from the default, so openbsd, cros and the rest take the default.
 *
 * The shortcut strings Firefox accepts are not what the keyboard reports:
 * "Ctrl" in a shortcut means Command on macOS, and the real Control key there
 * is "MacCtrl". Neither the Super nor the Windows key has a name at all.
 */
(() => {
  const SYMBOLS = { MacCtrl: "⌃", Alt: "⌥", Shift: "⇧", Command: "⌘", Ctrl: "⌘" };
  const MAC_ORDER = ["MacCtrl", "Alt", "Shift", "Command", "Ctrl"];

  let os = "linux";

  const ready = browser.runtime.getPlatformInfo().then((info) => {
    os = info.os;
    return os;
  });

  const isMac = () => os === "mac";

  // Returns the manifest modifier names, or null when the keys pressed cannot be
  // expressed as a shortcut at all.
  function modifiers(e) {
    const mods = [];
    if (e.ctrlKey) mods.push(isMac() ? "MacCtrl" : "Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) {
      if (!isMac()) return null;
      mods.push("Command");
    }
    if (e.shiftKey) mods.push("Shift");
    return mods;
  }

  // Shift is a secondary modifier only, so it cannot carry a shortcut by itself.
  function hasPrimary(mods) {
    return mods.some((m) => m !== "Shift");
  }

  function display(shortcut) {
    if (!shortcut || !isMac()) return shortcut;
    const parts = shortcut.split("+");
    const mods = parts
      .filter((p) => p in SYMBOLS)
      .sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b))
      .map((m) => SYMBOLS[m]);
    const keys = parts.filter((p) => !(p in SYMBOLS));
    return mods.join("") + keys.join("+");
  }

  function primaryHint() {
    return isMac()
      ? "Use at least ⌘, ⌃ or ⌥, or a function key."
      : "Use at least Ctrl or Alt, or a function key.";
  }

  function metaRejected() {
    return os === "win"
      ? "The Windows key cannot be part of a shortcut."
      : "The Super key cannot be part of a shortcut.";
  }

  window.CTAPlatform = {
    ready, isMac, modifiers, hasPrimary, display, primaryHint, metaRejected,
    os: () => os
  };
})();
