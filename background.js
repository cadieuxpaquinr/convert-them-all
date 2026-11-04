const COMMAND = "primary-action";
const MENU_ITEM = "convert-image";

let appWindowId = null;
let lastNormalWindowId = null;
// What the app shows next: a section, and an image when one comes with it.
// Held in memory, never in storage: it belongs to the moment, not the profile.
let view = null;

// A top-level item takes its icon from the manifest; the icons option on
// menus.create() would only apply to a submenu.
browser.menus.create({
  id: MENU_ITEM,
  title: "Convert to…",
  contexts: ["image"]
});

// The return value is ignored by Firefox; it is returned so a failure shows up as
// a rejection in the console instead of disappearing.
browser.menus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ITEM) return undefined;
  return showInApp({ section: "images", image: info.srcUrl || "" });
});

// Firefox ignores the windowTypes filter on windows.getAll and getLastFocused, so
// the type is checked here. Without that, "the last focused window" is the app's
// own popup whenever the app has focus, which is exactly when a link is clicked.
// The app window is excluded by id as well, so a tab cannot land on top of the
// app even if Firefox reports its type as normal.
function usable(win) {
  return !!win && win.type === "normal" && win.id !== appWindowId;
}

async function normalWindow() {
  if (lastNormalWindowId != null) {
    try {
      const remembered = await browser.windows.get(lastNormalWindowId);
      if (usable(remembered)) return remembered;
    } catch (e) {
      lastNormalWindowId = null;
    }
  }
  const all = await browser.windows.getAll().catch(() => []);
  const normal = all.filter(usable);
  return normal.find((win) => win.focused) || normal[0] || null;
}

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  try {
    const win = await browser.windows.get(windowId);
    if (usable(win)) lastNormalWindowId = windowId;
  } catch (e) {
    // The window went away between the event and the lookup.
  }
});

// Centre on the browser window the user came from when no position is stored.
async function placement(geometry) {
  const options = { width: geometry.width, height: geometry.height };
  if ("left" in geometry && "top" in geometry) {
    options.left = geometry.left;
    options.top = geometry.top;
    return options;
  }
  const win = await normalWindow();
  if (!win) return options;
  options.left = Math.max(0, Math.round(win.left + (win.width - options.width) / 2));
  options.top = Math.max(0, Math.round(win.top + (win.height - options.height) / 2));
  return options;
}

// One window only. A second trigger raises the one already open and leaves it on
// whatever section the user was reading.
async function openApp() {
  if (appWindowId != null) {
    try {
      await browser.windows.update(appWindowId, { focused: true });
      return;
    } catch (e) {
      appWindowId = null;
    }
  }
  const geometry = await CTAGeometry.read().catch(() => CTAGeometry.normalize(null));
  const win = await browser.windows.create(Object.assign(
    { url: browser.runtime.getURL("app.html"), type: "popup" },
    await placement(geometry)
  ));
  appWindowId = win.id;
}

// Push to an app that is already up; otherwise open it and let it pull the view
// once loaded, which is what keeps this free of a load race.
async function showInApp(next) {
  view = next;
  if (appWindowId != null) {
    try {
      await browser.windows.update(appWindowId, { focused: true });
      await browser.runtime.sendMessage(Object.assign({ type: "show" }, next));
      return;
    } catch (e) {
      // The window is gone, or its page is still loading and nothing is
      // listening yet. openApp() raises it in the second case.
    }
  }
  await openApp();
}

// No image key: the Images section keeps whatever it was holding.
function openHome() {
  return showInApp({ section: "home" });
}

browser.windows.onRemoved.addListener((id) => {
  if (id === appWindowId) appWindowId = null;
  if (id === lastNormalWindowId) lastNormalWindowId = null;
});

browser.browserAction.onClicked.addListener(() => openHome());

browser.commands.onCommand.addListener((name) => {
  if (name === COMMAND) openHome();
});

// Never open the tab in the app window itself, which is a popup: a plain
// tabs.create() with no windowId would land there. Target a normal browser
// window and raise it, or open one when every browser window is closed.
async function openUrl(msg) {
  const win = await normalWindow();
  if (!win) {
    await browser.windows.create({ url: msg.url, type: "normal" });
    return;
  }
  await browser.tabs.create({ url: msg.url, windowId: win.id, active: true });
  await browser.windows.update(win.id, { focused: true });
}

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg && msg.type) {
    case "open-app":
      return openHome();
    case "open-url":
      return openUrl(msg);
    case "get-view":
      return Promise.resolve(view);
  }
});
