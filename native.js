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

  window.CTANative = { HOST, ask, ping };
})();
