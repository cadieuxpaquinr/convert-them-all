/*
 * The Report a bug and About panes: the outbound links and the build line.
 * Mounted by app.js.
 */
(() => {
  // Set this to the branch name while testing a dev build, and the About pane shows
  // it, so reloading a temporary add-on visibly confirms which build Firefox took:
  //   const BRANCH = "0.1.0/app-window-ui";
  // Empty, or "main", shows the version alone.
  const BRANCH = "";

  const REPO = "https://github.com/cadieuxpaquinr/convert-them-all";
  const ISSUES = `${REPO}/issues`;
  const AUTHOR = "https://www.linkedin.com/in/raphael-cadieux-paquin";

  // The app window is a popup: the background script places the tab in a normal
  // window instead of navigating the app away from itself.
  function open(url) {
    browser.runtime.sendMessage({ type: "open-url", url }).catch(() => {});
  }

  function mount() {
    document.getElementById("issues").addEventListener("click", () => open(ISSUES));
    document.getElementById("source").addEventListener("click", () => open(REPO));
    document.getElementById("follow").addEventListener("click", () => open(AUTHOR));

    const manifest = browser.runtime.getManifest();
    document.getElementById("build").textContent =
      BRANCH && BRANCH !== "main"
        ? `${manifest.name} v${manifest.version} · ${BRANCH}`
        : `${manifest.name} v${manifest.version}`;
  }

  window.CTAAbout = { mount };
})();
