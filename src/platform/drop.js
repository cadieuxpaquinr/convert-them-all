/*
 * What a drag over the app window means, and what it leaves behind.
 *
 * A drop carries one of two things. From the computer it is a File, bytes and
 * all. From a page it is only an address, because a page never hands over the
 * image itself. read() tells the two apart and hands back the one thing worth
 * acting on; everything else about the drop is noise.
 *
 * read() touches no DOM, so every shape of drop can be checked without a
 * browser. mount() is the wiring.
 */
(() => {
  const SCHEMES = ["http:", "https:", "data:", "blob:", "file:"];
  // The types worth raising the overlay for. Read from types, not getData,
  // which Firefox refuses to answer during a drag.
  const WANTED = ["Files", "text/html", "text/uri-list", "text/plain"];
  // A folder dropped by mistake can hold thousands of files, and a queue that
  // long is not something anyone meant to start.
  const MAX_FILES = 500;

  function get(transfer, type) {
    try {
      return transfer.getData(type) || "";
    } catch (e) {
      return "";
    }
  }

  function usable(url) {
    try {
      return SCHEMES.includes(new URL(url).protocol) ? url : null;
    } catch (e) {
      return null;
    }
  }

  // A uri-list is one address per line, and a line opening with # is a comment.
  function firstUrl(text) {
    for (const line of String(text).split(/[\r\n]+/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      return usable(trimmed);
    }
    return null;
  }

  // Firefox describes a dragged image as a fragment of the page it came from.
  // The src in it is the image itself, which is not always what uri-list holds.
  function imageIn(html) {
    const found = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i
      .exec(String(html));
    if (!found) return null;
    const src = (found[1] || found[2] || found[3] || "").replace(/&amp;/g, "&");
    return usable(src.trim());
  }

  // A dropped folder arrives as an entry rather than a file, and has to be
  // walked. Firefox gives this through webkitGetAsEntry, which is the name
  // every browser settled on whatever it says about itself.
  async function walk(entry, path, out, depth) {
    if (!entry || depth > 8 || out.length >= MAX_FILES) return;
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve, () => resolve(null)));
      if (file) {
        // The path inside the folder is kept, so a batch can say where a
        // file came from rather than showing forty files called index.html.
        out.push({ file, path: path ? `${path}/${file.name}` : file.name });
      }
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    // readEntries hands back a page at a time and an empty page means the end.
    for (;;) {
      const batch = await new Promise((resolve) =>
        reader.readEntries(resolve, () => resolve([])));
      if (!batch.length) break;
      for (const child of batch) {
        await walk(child, path ? `${path}/${entry.name}` : entry.name, out, depth + 1);
      }
    }
  }

  // Everything a drop carried, folders walked. Used when a pane can take more
  // than one file; read() is still the answer for a single one.
  async function readAll(transfer) {
    if (!transfer) return [];
    const entries = Array.from(transfer.items || [])
      .filter((item) => item.kind === "file")
      .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
      .filter(Boolean);
    const folders = entries.filter((entry) => entry.isDirectory);
    if (folders.length) {
      const out = [];
      for (const entry of entries) await walk(entry, "", out, 0);
      return out.slice(0, MAX_FILES);
    }
    return Array.from(transfer.files || [])
      .slice(0, MAX_FILES)
      .map((file) => ({ file, path: file.name }));
  }

  // null when there is nothing here to act on: text that is not an address, or
  // a drag that carried nothing at all.
  function read(transfer) {
    if (!transfer) return null;

    const files = transfer.files;
    if (files && files.length) {
      return { kind: "file", file: files[0], ignored: files.length - 1 };
    }

    // The page fragment first: a linked image gives the link's address in
    // uri-list and the image's own in the img, and the image is what was
    // dragged.
    const url = imageIn(get(transfer, "text/html"))
      || firstUrl(get(transfer, "text/uri-list"))
      || firstUrl(get(transfer, "text/plain"));
    return url ? { kind: "url", url } : null;
  }

  function carries(transfer) {
    const types = (transfer && transfer.types) || [];
    return WANTED.some((type) => Array.prototype.includes.call(types, type));
  }

  function mount(overlay, handler) {
    // dragenter and dragleave fire again for every element the pointer crosses,
    // so the overlay is held open by how deep the drag is, not by the last event.
    let depth = 0;

    function paint() {
      overlay.hidden = depth <= 0;
    }

    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      if (!carries(e.dataTransfer)) return;
      depth += 1;
      paint();
    });

    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      paint();
    });

    // Always, even for a drag this app will not use: without it Firefox takes
    // the drop itself and sends this window off to the dropped file, which ends
    // the app.
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });

    window.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      paint();
      // Read before anything is awaited: a DataTransfer is emptied as soon as
      // the event handler returns, so the entries have to be taken now.
      const item = read(e.dataTransfer);
      const many = readAll(e.dataTransfer);
      if (item) handler(item, many);
    });

    paint();
  }

  window.CTADrop = { MAX_FILES, read, readAll, mount };
})();
