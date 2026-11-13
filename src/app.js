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
  const overlay = document.querySelector("#drop-overlay span");

  let current = "home";

  function show(name) {
    current = name;
    for (const pane of panes) pane.hidden = pane.id !== name;
    for (const button of buttons) {
      if (button.dataset.section === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    // Any file can be dropped and is sent where it belongs, so the overlay only
    // narrows itself where the narrower word is the true one.
    overlay.textContent = name === "images"
      ? "Drop an image here"
      : "Drop a file here";
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
    CTAAudio, CTAArchives, CTASheets, CTAWebsites, CTAHome]) {
    try {
      pane.mount();
    } catch (e) {
      console.error("Convert Them All: a section failed to load.", e);
    }
  }

  const PANES = { images: "Images", audio: "Audio", archives: "Archives",
    sheets: "Sheets", files: "Files" };

  const TAKERS = {
    images: (file) => CTAImages.file(file),
    audio: (file) => CTAAudio.file(file),
    archives: (file) => CTAArchives.file(file),
    sheets: (file) => CTASheets.file(file),
    files: (file) => CTAFiles.set(file)
  };

  // The one road in, whether the file was dropped or picked. "from" is the pane
  // whose button was used, and is empty for a drop: a drop was aimed at the
  // window, not at a pane, so there is nothing to correct the user about.
  function handFile(file, from) {
    const kind = CTAKind.of(file);
    const where = CTAKind.section(kind);
    show(where);
    TAKERS[where](file);
    if (!from || from === where) return;
    // Said because the file left the pane the user was standing in. The Audio
    // pane asked for one thing in particular, so that is named as well.
    CTAMessages.say(from === "audio"
      ? `${file.name} is ${CTAKind.noun(kind)}, not an audio file. `
        + `It went to ${PANES[where]}.`
      : `${file.name} is ${CTAKind.noun(kind)}. It went to ${PANES[where]}.`);
  }

  function dropped(item) {
    // An address says nothing about what is behind it, so it goes to Images:
    // the preview is the answer.
    if (item.kind === "url") {
      show("images");
      CTAImages.set(item.url);
      return;
    }
    handFile(item.file, "");
    if (item.ignored > 0 && CTAKind.of(item.file) === "image") {
      CTAMessages.say(`One image at a time, so ${item.ignored} more `
        + `${item.ignored === 1 ? "was" : "were"} left out.`);
    }
  }

  CTADrop.mount(document.getElementById("drop-overlay"), dropped);
  // The markup already shows the home page; saying so out loud is what settles
  // the overlay's wording before anything is dragged.
  show(current);
  CTAFiles.onPick(handFile);
  CTAAudio.onPick(handFile);
  CTAArchives.onPick(handFile);
  CTASheets.onPick(handFile);

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
