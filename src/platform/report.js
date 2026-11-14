/*
 * The helper's description of the machine, asked for once.
 *
 * Two panes want the same answer: the home page lists what is installed, and
 * Videos holds itself shut when something is missing. Each one calling
 * CTANative.ping() meant starting the helper twice on every open, and the two
 * could disagree for as long as the second call took.
 *
 * One call, one answer, and a refresh that both panes hear about.
 */
(() => {
  let pending = null;
  const listeners = [];

  function tell(answer) {
    for (const listener of listeners) {
      try {
        listener(answer);
      } catch (e) {
        console.error("Convert Them All: a listener failed.", e);
      }
    }
    return answer;
  }

  // The paths from Settings ride along, because the helper looks on the PATH
  // and a program downloaded from its own site is not on it.
  async function ask() {
    const tools = await CTATools.forRequest().catch(() => null);
    return await CTANative.ask(tools ? { type: "ping", tools } : { type: "ping" });
  }

  function get() {
    if (!pending) pending = ask();
    return pending;
  }

  // A new look at the machine, for when the user has just installed something.
  function refresh() {
    pending = ask().then(tell);
    return pending;
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  window.CTAReport = { get, refresh, onChange };
})();
