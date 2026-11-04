/*
 * The app shell: which section is visible, and the panes' wiring.
 *
 * The home section has no sidebar entry. It shows when the window opens and is
 * gone for good once a section is picked.
 */
(() => {
  const nav = document.getElementById("sections");
  const panes = document.querySelectorAll("main > section");
  const buttons = nav.querySelectorAll("button[data-section]");

  function show(name) {
    for (const pane of panes) pane.hidden = pane.id !== name;
    for (const button of buttons) {
      if (button.dataset.section === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }

  // closest(), not e.target: the Settings row has a span around its gear.
  nav.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-section]");
    if (button) show(button.dataset.section);
  });

  CTASidebar.mount(document.getElementById("resize"));
  // A failed read just means the default width, which is what the CSS already shows.
  CTASidebar.load().catch(() => {});

  CTASettings.mount();
  CTAAbout.mount();
  CTAImages.mount();

  // The background says which section to show, and gives an image only when one
  // comes with it: opening the app from the toolbar or the shortcut asks for the
  // home page and leaves whatever the Images section was holding.
  function apply(view) {
    if (!view) return;
    if (view.section) show(view.section);
    if ("image" in view) CTAImages.set(view.image);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "show") apply(msg);
  });

  // Pulled, not pushed: the background cannot message this page until it has
  // loaded, and a window it just opened has not.
  browser.runtime.sendMessage({ type: "get-view" }).then(apply).catch(() => {});
})();
