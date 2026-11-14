/*
 * The Archives pane: what is inside, what to take out, and what to pack.
 *
 * Nothing is written until it is asked for. An archive can hold hundreds of
 * files, and each one saved is a download of its own, so the pane lists them
 * first with a tick each and waits. The obvious noise a packer leaves behind
 * starts unticked.
 *
 * A name inside an archive comes from whoever made it, which means it cannot
 * be trusted: ../../etc/passwd is a legal entry name. Every name is rebuilt
 * from safe parts before anything lands on disk.
 */
(() => {
  const NOISE = [/^__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];

  const OUTPUTS = [
    { id: "zip", label: "zip", ext: "zip" },
    { id: "tar", label: "tar", ext: "tar" },
    { id: "tgz", label: "tar.gz", ext: "tar.gz" }
  ];

  const el = {};
  let placeholder = "";
  // The archive on screen: its bytes, its kind, and what is in it.
  let open = null;
  // Files picked to be packed, which is the other direction.
  let loose = [];
  let picked = null;

  function size(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.round(kb)} kB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  function noise(name) {
    return NOISE.some((pattern) => pattern.test(name));
  }

  function enable(on) {
    for (const node of [el.extract, el.pack, el.format, el.name, el.all, el.none]) {
      node.disabled = !on;
    }
  }

  function rows() {
    return Array.from(el.list.querySelectorAll("input[type=checkbox]"));
  }

  function ticked() {
    return rows().filter((box) => box.checked).map((box) => Number(box.dataset.at));
  }

  function paint(entries, kind) {
    el.list.textContent = "";
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = kind === "pack"
        ? "Nothing chosen yet."
        : "This archive is empty.";
      el.list.appendChild(empty);
      return;
    }
    entries.forEach((entry, at) => {
      const row = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.at = String(at);
      // A folder holds nothing of its own, and the files inside it carry their
      // own path, so there is nothing to take out of one.
      box.checked = !entry.folder && !noise(entry.name);
      box.disabled = !!entry.folder;
      const path = document.createElement("span");
      path.className = entry.folder ? "path folder" : "path";
      path.textContent = entry.name;
      const bytes = document.createElement("span");
      bytes.className = "size";
      bytes.textContent = entry.folder ? "" : size(entry.size);
      row.append(box, path, bytes);
      el.list.appendChild(row);
    });
  }

  function describe() {
    if (open) {
      const files = open.entries.filter((e) => !e.folder);
      const total = files.reduce((sum, e) => sum + e.size, 0);
      el.selection.textContent = `${open.name}: ${files.length} `
        + `${files.length === 1 ? "file" : "files"}, ${size(total)} unpacked.`;
      return;
    }
    if (loose.length) {
      const total = loose.reduce((sum, file) => sum + file.size, 0);
      el.selection.textContent = `${loose.length} `
        + `${loose.length === 1 ? "file" : "files"} to pack, ${size(total)}.`;
      return;
    }
    el.selection.textContent = placeholder;
  }

  // One way in for an archive: the bytes decide what it is, not the name.
  async function load(file) {
    if (!el.list) return;
    loose = [];
    open = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const gzipped = CTATar.isGzip(bytes);
      const plain = gzipped ? await CTATar.gunzip(bytes) : bytes;
      if (CTAZip.isZip(plain)) {
        open = { name: file.name, kind: "zip", bytes: plain,
          entries: CTAZip.list(plain) };
      } else if (CTATar.isTar(plain)) {
        open = { name: file.name, kind: gzipped ? "tgz" : "tar", bytes: plain,
          entries: CTATar.list(plain) };
      } else {
        throw new Error("that is not a zip, a tar or a tar.gz");
      }
    } catch (e) {
      CTAMessages.say(`Could not open ${file.name}: ${e.message}`, true);
      paint([], "open");
      enable(false);
      describe();
      return;
    }
    el.name.value = open.name.replace(/\.(zip|tar|tar\.gz|tgz)$/i, "");
    paint(open.entries, "open");
    enable(true);
    describe();
  }

  // The other direction: loose files waiting to become an archive.
  function take(files) {
    if (!el.list) return;
    open = null;
    loose = Array.from(files || []);
    el.name.value = loose.length === 1
      ? CTAConvert.nameFrom(loose[0].name)
      : "archive";
    paint(loose.map((file) => ({ name: file.name, size: file.size })), "pack");
    enable(loose.length > 0);
    describe();
  }

  async function bytesOf(at) {
    if (open.kind === "zip") return await CTAZip.read(open.bytes, open.entries[at]);
    return CTATar.read(open.bytes, open.entries[at]);
  }

  // Every segment is rebuilt from safe parts, so an entry calling itself
  // ../../etc/passwd lands inside the folder like everything else.
  function safePath(root, name) {
    const parts = String(name).split("/")
      // A dot or a double dot is a direction, not a name, and neither belongs
      // in a path this writes.
      .filter((segment) => segment && segment !== "." && segment !== "..")
      .map((segment) => CTASitePath.safe(segment));
    return [CTASitePath.ROOT, root, ...(parts.length ? parts : ["file"])].join("/");
  }

  async function extract() {
    const chosen = ticked();
    if (!open || !chosen.length) {
      CTAMessages.say("Tick something to extract first.", true);
      return;
    }
    const root = CTASitePath.safe(el.name.value || open.name);
    let done = 0;
    enable(false);
    for (const at of chosen) {
      const entry = open.entries[at];
      try {
        const bytes = await bytesOf(at);
        const url = URL.createObjectURL(new Blob([bytes]));
        await browser.downloads.download({
          url, filename: safePath(root, entry.name), saveAs: false,
          conflictAction: "overwrite"
        });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        done += 1;
      } catch (e) {
        CTAMessages.say(`Could not extract ${entry.name}: ${e.message}`, true);
      }
    }
    enable(true);
    CTAMessages.say(`Extracted ${done} ${done === 1 ? "file" : "files"} to `
      + `Downloads/${CTASitePath.ROOT}/${root}.`);
  }

  // What goes into a new archive: either the loose files, or the ticked
  // entries of the one already open, which is how a zip becomes a tar.gz.
  async function gather() {
    const chosen = ticked();
    if (open) {
      const out = [];
      for (const at of chosen) {
        const entry = open.entries[at];
        out.push({ name: entry.name, bytes: await bytesOf(at),
          modified: entry.modified ? entry.modified.getTime() : Date.now() });
      }
      return out;
    }
    const out = [];
    for (const at of chosen) {
      const file = loose[at];
      out.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
        modified: file.lastModified });
    }
    return out;
  }

  async function pack() {
    if (!ticked().length) {
      CTAMessages.say("Tick something to pack first.", true);
      return;
    }
    const target = OUTPUTS.find((o) => o.id === el.format.value) || OUTPUTS[0];
    enable(false);
    try {
      const entries = await gather();
      let blob = null;
      if (target.id === "zip") {
        blob = await CTAZip.write(entries);
      } else {
        const tar = CTATar.write(entries);
        blob = target.id === "tgz"
          ? new Blob([await CTATar.gzip(tar)], { type: "application/gzip" })
          : new Blob([tar], { type: "application/x-tar" });
      }
      const name = CTAConvert.fileName(el.name.value || "archive", target.ext);
      const url = URL.createObjectURL(blob);
      await browser.downloads.download({ url, filename: name, saveAs: false });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      CTAMessages.say(`Packed ${entries.length} `
        + `${entries.length === 1 ? "file" : "files"} into ${name}, ${size(blob.size)}.`);
    } catch (e) {
      CTAMessages.say(`Could not pack that: ${e.message}`, true);
    }
    enable(true);
  }

  function mount() {
    el.selection = document.getElementById("archive-selection");
    el.list = document.getElementById("archive-list");
    el.pick = document.getElementById("pick-archive");
    el.file = document.getElementById("archive-file");
    el.pickInto = document.getElementById("pick-into");
    el.into = document.getElementById("into-file");
    el.extract = document.getElementById("archive-extract");
    el.pack = document.getElementById("archive-pack");
    el.format = document.getElementById("archive-format");
    el.name = document.getElementById("archive-name");
    el.all = document.getElementById("archive-all");
    el.none = document.getElementById("archive-none");

    placeholder = el.selection.textContent;

    for (const output of OUTPUTS) {
      const option = document.createElement("option");
      option.value = output.id;
      option.textContent = output.label;
      el.format.appendChild(option);
    }

    el.pick.addEventListener("click", () => el.file.click());
    el.file.addEventListener("change", () => {
      const file = el.file.files[0];
      el.file.value = "";
      if (file && picked) picked(file, "archives");
    });
    el.pickInto.addEventListener("click", () => el.into.click());
    el.into.addEventListener("change", () => {
      const files = Array.from(el.into.files);
      el.into.value = "";
      if (files.length) take(files);
    });
    el.extract.addEventListener("click", () => extract().catch(() => {}));
    el.pack.addEventListener("click", () => pack().catch(() => {}));
    el.all.addEventListener("click", () => {
      for (const box of rows()) if (!box.disabled) box.checked = true;
    });
    el.none.addEventListener("click", () => {
      for (const box of rows()) box.checked = false;
    });

    enable(false);
    paint([], "pack");
  }

  function onPick(handler) {
    picked = handler;
  }

  window.CTAArchives = { mount, file: load, take, onPick, safePath, noise };
})();
