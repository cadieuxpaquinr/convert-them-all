/*
 * The Documents pane: Markdown, HTML and docx between each other, and EPUB
 * out of any of them.
 *
 * Everything meets in the middle as blocks, the same { type, text } the PDF
 * writer and the EPUB writer take, so three formats in and five out is one
 * reader and five writers rather than fifteen conversions.
 *
 * EPUB is one way only. A reader that will not open a book is a worse outcome
 * than a format that was never offered, and reading one means handling every
 * way a publisher has ever laid out a spine.
 */
(() => {
  const OUTPUTS = [
    { id: "md", label: "Markdown", ext: "md", mime: "text/markdown" },
    { id: "html", label: "HTML", ext: "html", mime: "text/html" },
    { id: "docx", label: "DOCX", ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { id: "epub", label: "EPUB", ext: "epub", mime: "application/epub+zip" },
    { id: "pdf", label: "PDF", ext: "pdf", mime: "application/pdf" },
    { id: "txt", label: "Plain text", ext: "txt", mime: "text/plain" }
  ];

  const el = {};
  let placeholder = "";
  let doc = null;
  let picked = null;

  function enable(on) {
    for (const node of [el.format, el.name, el.save]) node.disabled = !on;
  }

  function describe() {
    if (!doc) {
      el.selection.textContent = placeholder;
      el.outline.textContent = "";
      return;
    }
    const headings = doc.blocks.filter((b) => /^h[123]$/.test(b.type)).length;
    el.selection.textContent = `${doc.name}: ${doc.blocks.length} `
      + `${doc.blocks.length === 1 ? "block" : "blocks"}, ${headings} `
      + `${headings === 1 ? "heading" : "headings"}, read as ${doc.kind}.`;

    el.outline.textContent = "";
    for (const block of doc.blocks.slice(0, 200)) {
      const line = document.createElement("div");
      const kind = document.createElement("span");
      kind.className = "size";
      kind.textContent = block.type;
      const text = document.createElement("span");
      text.className = "path";
      text.textContent = block.text.slice(0, 90);
      line.append(kind, text);
      el.outline.appendChild(line);
    }
  }

  // What a file is, from its bytes. A docx is a zip, Markdown and HTML are
  // text, and which of those two it is shows in the first tag.
  async function load(file) {
    if (!el.outline) return;
    doc = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (CTAZip.isZip(bytes)) {
        const names = CTAZip.list(bytes).map((e) => e.name);
        if (!CTADocx.isDocx(names)) throw new Error("that zip is not a document");
        doc = { name: file.name, kind: "docx", blocks: await CTADocx.read(bytes),
          title: CTAConvert.nameFrom(file.name) };
      } else {
        if (bytes.subarray(0, 4096).includes(0)) {
          throw new Error("that is not a document, and not text either");
        }
        const text = new TextDecoder().decode(bytes);
        const html = /^\s*(<!doctype html|<html|<body|<div|<h[1-6]|<p[\s>])/i.test(text);
        doc = {
          name: file.name,
          kind: html ? "html" : "markdown",
          blocks: html ? CTADocText.fromHtml(text) : CTADocText.fromMarkdown(text),
          title: html ? (CTAWeb.titleOf(text) || CTAConvert.nameFrom(file.name))
            : CTAConvert.nameFrom(file.name)
        };
      }
    } catch (e) {
      CTAMessages.say(`Could not read ${file.name}: ${e.message}`, true);
    }
    el.name.value = doc ? CTAConvert.nameFrom(file.name) : "";
    enable(!!doc);
    describe();
  }

  async function body(target) {
    if (target.id === "md") return CTADocText.toMarkdown(doc.blocks, "");
    if (target.id === "html") return CTADocText.toHtml(doc.blocks, doc.title);
    if (target.id === "txt") {
      return `${doc.blocks.map((b) => b.text).join("\n\n")}\n`;
    }
    if (target.id === "docx") return await CTADocx.write(doc.blocks);
    if (target.id === "pdf") {
      return await CTAPdf.fromText({ title: doc.title, blocks: doc.blocks });
    }
    // One chapter per first-level heading, so a book has a table of contents
    // worth opening. A document with no headings is one chapter.
    const chapters = [];
    for (const block of doc.blocks) {
      if (block.type === "h1" || !chapters.length) {
        chapters.push({ title: block.type === "h1" ? block.text : doc.title,
          blocks: [] });
      }
      if (block.type !== "h1") chapters[chapters.length - 1].blocks.push(block);
    }
    return await CTAEpub.write({ title: doc.title, chapters });
  }

  async function save() {
    const target = OUTPUTS.find((o) => o.id === el.format.value) || OUTPUTS[0];
    enable(false);
    try {
      const made = await body(target);
      const blob = made instanceof Blob
        ? made
        : new Blob([made], { type: `${target.mime};charset=utf-8` });
      const name = CTAConvert.fileName(el.name.value || "document", target.ext);
      const url = URL.createObjectURL(blob);
      try {
        await browser.downloads.download({ url, filename: name, saveAs: false,
          conflictAction: "overwrite" });
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      CTAMessages.say(`Saved ${name}.`);
    } catch (e) {
      CTAMessages.say(`Could not save that: ${e.message}`, true);
    }
    enable(true);
  }

  function mount() {
    el.selection = document.getElementById("doc-selection");
    el.outline = document.getElementById("doc-outline");
    el.pick = document.getElementById("pick-doc");
    el.file = document.getElementById("doc-file");
    el.format = document.getElementById("doc-format");
    el.name = document.getElementById("doc-name");
    el.save = document.getElementById("doc-save");

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
      if (file && picked) picked(file, "documents");
    });
    el.save.addEventListener("click", () => save().catch(() => {}));

    enable(false);
  }

  function onPick(handler) {
    picked = handler;
  }

  window.CTADocuments = { mount, file: load, onPick };
})();
