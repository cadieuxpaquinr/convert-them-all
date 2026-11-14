/*
 * Writing an EPUB.
 *
 * An EPUB is a zip with rules. The first entry has to be a file called
 * mimetype, stored rather than deflated, so that a reader can tell what the
 * archive is by looking at a fixed offset. After that it is ordinary: a
 * container pointing at a package file, a package file listing every piece
 * and the order to read them in, and the pieces themselves as XHTML.
 *
 * EPUB 3 is written, with a nav document for the table of contents. The
 * pieces are strict XHTML, so every tag is closed and the namespace is on the
 * html element, which is the part a reader is fussiest about.
 *
 * Nothing here validates against epubcheck, which is not installed on this
 * machine; what is checked is that the archive is sound, the mimetype entry
 * is first and stored, and every file the package names is really in it.
 */
(() => {
  const MIME = "application/epub+zip";

  const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function page(title, body) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escape(title)}</title>
<meta charset="utf-8"/></head>
<body>${body}</body></html>`;
  }

  // The blocks of a chapter as XHTML, which is HTML with every tag closed.
  function bodyOf(blocks) {
    const out = [];
    let list = false;
    const close = () => {
      if (list) {
        out.push("</ul>");
        list = false;
      }
    };
    for (const block of blocks || []) {
      if (block.type === "li") {
        if (!list) {
          out.push("<ul>");
          list = true;
        }
        out.push(`<li>${CTADocText.escapeHtml(block.text)}</li>`);
        continue;
      }
      close();
      if (/^h[123]$/.test(block.type)) {
        out.push(`<${block.type}>${CTADocText.escapeHtml(block.text)}</${block.type}>`);
      } else if (block.type === "pre") {
        out.push(`<pre>${CTADocText.escapeHtml(block.text)}</pre>`);
      } else {
        out.push(`<p>${CTADocText.escapeHtml(block.text)}</p>`);
      }
    }
    close();
    return out.join("\n");
  }

  // Chapters in: { title, blocks }. A book with one chapter is still a book.
  async function write(options) {
    const title = (options && options.title) || "Untitled";
    const chapters = (options && options.chapters) || [];
    if (!chapters.length) throw new Error("there is nothing to put in a book");
    const author = (options && options.author) || "Convert Them All";
    // An identifier has to be stable within the book and unique between
    // books; the title and the number of chapters are enough for that here.
    const id = `cta-${encodeURIComponent(title).replace(/%/g, "")
      .slice(0, 40)}-${chapters.length}`;

    const files = chapters.map((chapter, at) => ({
      id: `ch${at + 1}`,
      href: `ch${at + 1}.xhtml`,
      title: chapter.title || `Chapter ${at + 1}`,
      text: page(chapter.title || `Chapter ${at + 1}`, bodyOf(chapter.blocks))
    }));

    const manifest = files.map((file) =>
      `<item id="${file.id}" href="${file.href}" media-type="application/xhtml+xml"/>`)
      .join("\n");
    const spine = files.map((file) => `<itemref idref="${file.id}"/>`).join("\n");

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escape(id)}</dc:identifier>
<dc:title>${escape(title)}</dc:title>
<dc:creator>${escape(author)}</dc:creator>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest}
</manifest>
<spine>
${spine}
</spine>
</package>`;

    const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escape(title)}</title><meta charset="utf-8"/></head>
<body><nav epub:type="toc"><h1>${escape(title)}</h1><ol>
${files.map((file) => `<li><a href="${file.href}">${escape(file.title)}</a></li>`).join("\n")}
</ol></nav></body></html>`;

    const encode = (text) => new TextEncoder().encode(text);
    // The mimetype entry is first and uncompressed. That is the one rule an
    // EPUB has that an ordinary zip does not.
    const entries = [
      { name: "mimetype", bytes: encode(MIME), store: true },
      { name: "META-INF/container.xml", bytes: encode(CONTAINER) },
      { name: "OEBPS/content.opf", bytes: encode(opf) },
      { name: "OEBPS/nav.xhtml", bytes: encode(nav) }
    ];
    for (const file of files) {
      entries.push({ name: `OEBPS/${file.href}`, bytes: encode(file.text) });
    }
    return await CTAZip.write(entries);
  }

  window.CTAEpub = { MIME, write, bodyOf };
})();
