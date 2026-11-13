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

  // First: the panes say things while they mount, and the corner has to be
  // there to catch them.
  CTAMessages.mount();

  // One pane that fails to mount must not take the others, nor the handover
  // below, down with it: that would leave the app sitting on its home page with
  // no sign of why.
  for (const pane of [CTASettings, CTAAbout, CTAImages, CTAVideos, CTAFiles,
    CTAHome]) {
    try {
      pane.mount();
    } catch (e) {
      console.error("Convert Them All: a section failed to load.", e);
    }
  }

  // A file says what it is, so one that is not an image goes to Files rather
  // than failing in a pane that could never take it. An address says nothing
  // about what is behind it, and goes to Images: the preview is the answer.
  function isImage(file) {
    if (file.type) return file.type.startsWith("image/");
    return !!CTAConvert.formatFrom(file.name);
  }

  function dropped(item) {
    if (item.kind === "url") {
      show("images");
      CTAImages.set(item.url);
      return;
    }
    if (!isImage(item.file)) {
      show("files");
      CTAFiles.set(item.file);
      return;
    }
    show("images");
    CTAImages.file(item.file);
    if (item.ignored > 0) {
      CTAImages.note(`One image at a time, so ${item.ignored} more `
        + `${item.ignored === 1 ? "was" : "were"} left out.`);
    }
  }

  CTADrop.mount(document.getElementById("drop-overlay"), dropped);

  // The background says which section to show, and gives an image only when one
  // comes with it: opening the app from the toolbar or the shortcut asks for the
  // home page and leaves whatever the Images section was holding.
  function apply(view) {
    if (!view) return;
    if (view.section) show(view.section);
    if ("image" in view) CTAImages.set(view.image);
    if ("video" in view) CTAVideos.set(view.video, view.page);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "show") apply(msg);
  });

  // Pulled, not pushed: the background cannot message this page until it has
  // loaded, and a window it just opened has not.
  browser.runtime.sendMessage({ type: "get-view" }).then(apply).catch(() => {});
})();
