/*
 * Everything the app has to say, in one corner.
 *
 * Each pane used to keep its own status line, which meant a line was only
 * visible while its own section was open. A download started in Videos finishes
 * while the user is reading Settings, and that was said to nobody. Here a
 * message is seen from any section, dismissed on purpose, and still there in
 * the bell's panel afterwards.
 *
 * The ten are held in memory alone. They are what just happened, not a log.
 */
(() => {
  // Shown at once. A fifth pushes the oldest box out early, so the corner
  // cannot grow over the window.
  const SHOWN = 4;
  const KEPT = 10;

  let life = 15000;
  const kept = [];
  const el = {};
  let open = false;

  function stamp() {
    return new Date().toTimeString().slice(0, 5);
  }

  function remember(text, kind) {
    kept.push({ text, kind, at: stamp() });
    while (kept.length > KEPT) kept.shift();
  }

  function drop(box) {
    if (box.timer) clearTimeout(box.timer);
    if (box.node.parentNode) box.node.remove();
  }

  function hold(box) {
    if (box.timer) clearTimeout(box.timer);
    box.timer = setTimeout(() => drop(box), life);
  }

  function draw(text, kind) {
    const node = document.createElement("div");
    node.className = "toast";
    // A data attribute, not a class: "ok" and "error" are already class names
    // elsewhere in the page and would bring their own colours with them.
    node.dataset.kind = kind;
    const span = document.createElement("span");
    span.className = "text";
    span.textContent = text;
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.title = "Dismiss";
    close.textContent = "×";
    node.append(span, close);

    const box = { node, timer: null };
    close.addEventListener("click", () => drop(box));
    // So a long message can be read: the timer starts again on the way out.
    node.addEventListener("mouseenter", () => clearTimeout(box.timer));
    node.addEventListener("mouseleave", () => hold(box));

    el.stack.prepend(node);
    hold(box);
    while (el.stack.children.length > SHOWN) el.stack.lastElementChild.remove();
  }

  function paint() {
    el.list.textContent = "";
    if (!kept.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No messages yet.";
      el.list.appendChild(empty);
      return;
    }
    for (const message of list()) {
      const item = document.createElement("li");
      item.dataset.kind = message.kind;
      const at = document.createElement("span");
      at.className = "at";
      at.textContent = message.at;
      const text = document.createElement("span");
      text.textContent = message.text;
      item.append(at, text);
      el.list.appendChild(item);
    }
  }

  function show(on) {
    open = on;
    el.panel.hidden = !on;
    el.bell.setAttribute("aria-expanded", String(on));
    if (on) paint();
  }

  // The one way in. An empty text says nothing, which is how the panes used to
  // clear their status line; there is nothing to clear any more.
  function say(text, kind) {
    const words = String(text == null ? "" : text).trim();
    if (!words) return;
    const sort = kind === "error" ? "error" : "ok";
    remember(words, sort);
    if (el.stack) draw(words, sort);
    if (open) paint();
  }

  // Newest first, which is the order the panel reads in.
  function list() {
    return kept.slice().reverse();
  }

  function clear() {
    kept.length = 0;
    if (el.list) paint();
  }

  function last() {
    return kept.length ? kept[kept.length - 1].text : "";
  }

  // Exists so the harness can watch a message go without waiting the fifteen
  // seconds a person gets.
  function config(ms) {
    life = ms;
  }

  function mount() {
    el.stack = document.getElementById("message-stack");
    el.bell = document.getElementById("message-bell");
    el.panel = document.getElementById("message-panel");
    el.list = document.getElementById("message-list");

    el.bell.addEventListener("click", (e) => {
      e.stopPropagation();
      show(!open);
    });
    document.getElementById("message-clear")
      .addEventListener("click", clear);
    // Anywhere else closes it, so it never sits in the way.
    document.addEventListener("click", (e) => {
      if (open && !el.panel.contains(e.target)) show(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) show(false);
    });

    show(false);
  }

  window.CTAMessages = { mount, say, list, clear, last, config };
})();
