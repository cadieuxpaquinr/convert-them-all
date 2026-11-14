/*
 * Reading and writing docx.
 *
 * A docx is a zip whose important part is word/document.xml: paragraphs of
 * runs, where a run is a stretch of text with the same formatting. A heading
 * is a paragraph wearing a named style, a list item is a paragraph with
 * numbering on it, and a link is a paragraph child pointing at a relationship
 * id that another file resolves. None of that is hard; it is only wordy.
 *
 * What is written is the smallest package Word and LibreOffice both open:
 * the content types, one relationship, the document, and a styles file naming
 * the headings. Nothing else is invented.
 *
 * Blocks are the shape both directions speak, the same ones the PDF writer
 * takes: { type, text } with type h1, h2, h3, p, li or pre.
 */
(() => {
  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // The styles part has to be related to the document, not merely present in
  // the package. Without this a reader loads no styles at all and every
  // heading arrives as an ordinary paragraph, which is what LibreOffice did.
  const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Heading styles have to exist in the package or a reader ignores the names.
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="PreformattedText"><w:name w:val="Preformatted Text"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:style>
</w:styles>`;

  const STYLE_TO_TYPE = {
    heading1: "h1", heading2: "h2", heading3: "h3",
    heading4: "h3", heading5: "h3", heading6: "h3",
    title: "h1", subtitle: "h2",
    listparagraph: "li", listbullet: "li", listnumber: "li",
    preformattedtext: "pre", sourcecode: "pre", quotations: "p"
  };

  const TYPE_TO_STYLE = {
    h1: "Heading1", h2: "Heading2", h3: "Heading3",
    li: "ListParagraph", pre: "PreformattedText", p: "Normal"
  };

  function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function localTags(node, name) {
    return Array.from(node.getElementsByTagName("*"))
      .filter((child) => child.localName === name);
  }

  function attribute(node, name) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === name) return attr.value;
    }
    return null;
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("the XML inside is damaged");
    }
    return doc;
  }

  function textOfParagraph(node) {
    // w:tab and w:br carry no text of their own but are real whitespace.
    let out = "";
    for (const child of Array.from(node.getElementsByTagName("*"))) {
      if (child.localName === "t") out += child.textContent;
      else if (child.localName === "tab") out += "\t";
      else if (child.localName === "br") out += "\n";
    }
    return out;
  }

  function typeOf(node) {
    const style = localTags(node, "pStyle")[0];
    const named = style ? String(attribute(style, "val") || "").toLowerCase() : "";
    if (STYLE_TO_TYPE[named]) return STYLE_TO_TYPE[named];
    // A paragraph with numbering on it is a list item whatever it is called.
    if (localTags(node, "numPr").length) return "li";
    return "p";
  }

  async function read(bytes) {
    const entries = CTAZip.list(bytes);
    const main = entries.find((e) => e.name === "word/document.xml");
    if (!main) throw new Error("that zip is not a docx");
    const doc = parseXml(new TextDecoder().decode(await CTAZip.read(bytes, main)));

    const body = localTags(doc, "body")[0];
    if (!body) return [];
    const blocks = [];
    for (const node of Array.from(body.children)) {
      if (node.localName === "p") {
        const text = textOfParagraph(node).replace(/[ \t]+/g, " ").trim();
        if (text) blocks.push({ type: typeOf(node), text });
      } else if (node.localName === "tbl") {
        // A table becomes its rows, one line each, which is what a plain
        // document can hold without pretending to be a spreadsheet.
        for (const row of localTags(node, "tr")) {
          const cells = localTags(row, "tc")
            .map((cell) => textOfParagraph(cell).replace(/\s+/g, " ").trim());
          if (cells.some(Boolean)) {
            blocks.push({ type: "row", text: cells.join(" | "), cells });
          }
        }
      }
    }
    return blocks;
  }

  function paragraph(block) {
    const style = TYPE_TO_STYLE[block.type] || "Normal";
    const text = block.type === "li" ? `- ${block.text}` : block.text;
    // A docx keeps no newlines inside a run, so each line becomes a break.
    const runs = String(text).split("\n").map((line, at) =>
      `${at ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t>`)
      .join("");
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${runs}</w:r></w:p>`;
  }

  async function write(blocks) {
    const body = (blocks || []).map(paragraph).join("");
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`;

    const encode = (text) => new TextEncoder().encode(text);
    return await CTAZip.write([
      { name: "[Content_Types].xml", bytes: encode(CONTENT_TYPES) },
      { name: "_rels/.rels", bytes: encode(ROOT_RELS) },
      { name: "word/document.xml", bytes: encode(document) },
      { name: "word/_rels/document.xml.rels", bytes: encode(DOCUMENT_RELS) },
      { name: "word/styles.xml", bytes: encode(STYLES) }
    ]);
  }

  function isDocx(names) {
    return names.includes("word/document.xml");
  }

  window.CTADocx = { read, write, isDocx, STYLE_TO_TYPE, TYPE_TO_STYLE };
})();
