/*
 * Talking to the helper.
 *
 * A dead or missing helper is not an exception here: it is an answer. Firefox
 * reports a host that is absent, refused or crashed through the same
 * disconnect, so every one of those becomes null and readiness.js turns that
 * into something a person can act on.
 */
(() => {
  const HOST = "convert_them_all";
  const REPLY_TIMEOUT = 8000;

  function ask(request, timeout) {
    return new Promise((resolve) => {
      let port = null;
      let answered = false;

      const finish = (value) => {
        if (answered) return;
        answered = true;
        try {
          if (port) port.disconnect();
        } catch (e) {
          // Already gone, which is the case we are reporting anyway.
        }
        resolve(value);
      };

      try {
        port = browser.runtime.connectNative(HOST);
      } catch (e) {
        finish(null);
        return;
      }

      port.onMessage.addListener(finish);
      // Fires when the host is not installed, is not allowed to talk to this
      // add-on, or died on startup. Firefox puts the reason in port.error.
      port.onDisconnect.addListener(() => finish(null));
      setTimeout(() => finish(null), timeout || REPLY_TIMEOUT);

      try {
        port.postMessage(request);
      } catch (e) {
        finish(null);
      }
    });
  }

  function ping() {
    return ask({ type: "ping" });
  }

  // One job at a time, kept here so it can be stopped. A download reports as it
  // goes, so this cannot use ask(), which keeps only the first answer.
  let running = null;

  function job(request, onProgress) {
    return new Promise((resolve) => {
      let port = null;
      let answered = false;

      const finish = (value) => {
        if (answered) return;
        answered = true;
        running = null;
        try {
          if (port) port.disconnect();
        } catch (e) {
          // Already gone.
        }
        resolve(value);
      };

      try {
        port = browser.runtime.connectNative(HOST);
      } catch (e) {
        finish({ type: "error", reason: "no-helper" });
        return;
      }

      running = () => finish({ type: "error", reason: "cancelled" });

      port.onMessage.addListener((message) => {
        if (message && message.type === "progress") {
          if (onProgress) onProgress(message);
          return;
        }
        finish(message || { type: "error", reason: "no-answer" });
      });

      // Dropping the port is what stops yt-dlp: Firefox ends the helper, and
      // the helper takes the download with it.
      port.onDisconnect.addListener(() => finish({
        type: "error", reason: "helper-stopped"
      }));

      try {
        port.postMessage(request);
      } catch (e) {
        finish({ type: "error", reason: "no-helper" });
      }
    });
  }

  function stop() {
    if (running) running();
  }

  window.CTANative = { HOST, ask, ping, job, stop };
})();
