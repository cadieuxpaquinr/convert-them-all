const COMMAND = "primary-action";

let settingsWindowId = null;

// PLACEHOLDER: the add-on has no feature yet, so both the menu row and the
// shortcut land here.
function primaryAction() {
  return Promise.resolve();
}

async function openSettings() {
  if (settingsWindowId != null) {
    try {
      await browser.windows.update(settingsWindowId, { focused: true });
      return;
    } catch (e) {
      settingsWindowId = null;
    }
  }
  const win = await browser.windows.create({
    url: browser.runtime.getURL("options.html"),
    type: "popup",
    width: 560,
    height: 420
  });
  settingsWindowId = win.id;
}

browser.windows.onRemoved.addListener((id) => {
  if (id === settingsWindowId) settingsWindowId = null;
});

browser.commands.onCommand.addListener((name) => {
  if (name === COMMAND) primaryAction();
});

// Let Firefox place the tab when the message came from a popup panel, which has
// no tab of its own.
function openUrl(msg, sender) {
  const windowId = sender.tab && sender.tab.windowId;
  const options = { url: msg.url };
  if (windowId != null) options.windowId = windowId;
  return browser.tabs.create(options);
}

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg && msg.type) {
    case "primary-action":
      return primaryAction();
    case "open-settings":
      return openSettings();
    case "open-url":
      return openUrl(msg, sender);
  }
});
