/*
 * Writing a PDF by hand.
 *
 * A PDF is a list of numbered objects, a table saying where each one starts,
 * and a trailer pointing at the catalogue. Nothing here needs a library: the
 * hard parts of the format are the ones this does not use.
 *
 * Two shapes come out of it:
 *
 *   images  one picture per page, the page cut to the picture. A JPEG is
 *           embedded exactly as it arrived, because DCTDecode is the same
 *           compression a JPEG already uses; anything else is deflated, which
 *           is FlateDecode, and Firefox does the deflating.
 *   text    headings, paragraphs and lists laid out on A4 in Helvetica. There
 *           is no CSS here and there never will be: a page inside an add-on
 *           has no print engine, so this is the text, not the design.
 *
 * Helvetica is one of the fourteen fonts every reader already has, so nothing
 * is embedded. That also means WinAnsi: a character outside it is written as a
 * question mark rather than as a wrong glyph.
 */
(() => {
  const PAGE = { width: 595, height: 842 };
  const MARGIN = 56;
  const LEADING = 1.32;

  const STYLES = {
    h1: { size: 20, bold: true, before: 18, after: 8 },
    h2: { size: 16, bold: true, before: 14, after: 6 },
    h3: { size: 13, bold: true, before: 12, after: 5 },
    p: { size: 11, bold: false, before: 0, after: 9 },
    li: { size: 11, bold: false, before: 0, after: 4, indent: 18, bullet: "- " },
    pre: { size: 9.5, bold: false, before: 6, after: 9, mono: true, indent: 12 }
  };

  // Helvetica's own widths, in thousandths of the point size, for the
  // characters a WinAnsi document can hold. Wrapping without them is a guess,
  // and a guess shows up as a ragged right edge on every line.
  const WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
    584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
    278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
    500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
    500, 334, 260, 334, 584
  ];
  const BOLD_WIDTHS = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
    584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
    278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
    556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
    500, 389, 280, 389, 584
  ];
  const MONO = 600;

  function widthOf(text, size, style) {
    let total = 0;
    for (const character of String(text)) {
      const code = character.charCodeAt(0);
      if (style.mono) {
        total += MONO;
      } else {
        const table = style.bold ? BOLD_WIDTHS : WIDTHS;
        total += code >= 32 && code <= 126 ? table[code - 32] : 556;
      }
    }
    return (total * size) / 1000;
  }

  // Outside WinAnsi there is no glyph to show, and a reader given a byte it
  // cannot map draws something arbitrary. A question mark is at least honest.
  function latin(text) {
    let out = "";
    for (const character of String(text)) {
      const code = character.charCodeAt(0);
      out += code >= 32 && code <= 255 ? character : "?";
    }
    return out;
  }

  function escape(text) {
    return latin(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function wrap(text, size, style, room) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (widthOf(candidate, size, style) <= room) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    return lines;
  }

  function bytesOf(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  // Deflate, with the zlib wrapper FlateDecode expects. "deflate-raw" is the
  // bare stream a zip entry wants and is the wrong one here.
  async function deflate(bytes) {
    const packed = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(packed).arrayBuffer());
  }

  // A document is built as a list of objects; this keeps their order, their
  // numbers and their byte offsets together, because the xref table at the end
  // is nothing but those offsets. A slot can be reserved and filled in later,
  // which is what the page tree needs: it has to name children that do not
  // exist when it is written.
  function document() {
    const objects = [];
    return {
      reserve() {
        objects.push(null);
        return objects.length;
      },
      set(number, body) {
        objects[number - 1] = body;
        return number;
      },
      add(body) {
        objects.push(body);
        return objects.length;
      },
      finish() {
        const parts = [bytesOf("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
        const offsets = [];
        let at = parts[0].length;
        objects.forEach((body, index) => {
          if (body === null) throw new Error(`object ${index + 1} was never filled in`);
          offsets.push(at);
          const head = bytesOf(`${index + 1} 0 obj\n`);
          const tail = bytesOf("\nendobj\n");
          const chunks = Array.isArray(body) ? body : [bytesOf(body)];
          parts.push(head, ...chunks, tail);
          at += head.length + tail.length;
          for (const chunk of chunks) at += chunk.length;
        });
        const xrefAt = at;
        let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        for (const offset of offsets) {
          xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
        }
        xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
          + `startxref\n${xrefAt}\n%%EOF\n`;
        parts.push(bytesOf(xref));
        return new Blob(parts, { type: "application/pdf" });
      }
    };
  }

  function stream(dictionary, bytes) {
    return [bytesOf(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`),
      bytes, bytesOf("\nendstream")];
  }

  // One picture to a page, the page cut to the picture, so nothing is
  // letterboxed and nothing is cropped.
  async function fromImages(images) {
    if (!images || !images.length) throw new Error("there is nothing to put in a PDF");
    const doc = document();
    doc.add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesAt = doc.reserve();
    const kids = [];

    for (const image of images) {
      const jpeg = image.mime === "image/jpeg";
      const body = jpeg ? image.bytes : await deflate(image.bytes);
      const imageAt = doc.add(stream(
        `/Type /XObject /Subtype /Image /Width ${image.width} `
        + `/Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
        + `/Filter ${jpeg ? "/DCTDecode" : "/FlateDecode"}`, body));
      const contentAt = doc.add(stream("", bytesOf(
        `q ${image.width} 0 0 ${image.height} 0 0 cm /X0 Do Q`)));
      kids.push(doc.add(
        `<< /Type /Page /Parent ${pagesAt} 0 R `
        + `/MediaBox [0 0 ${image.width} ${image.height}] `
        + `/Resources << /XObject << /X0 ${imageAt} 0 R >> >> `
        + `/Contents ${contentAt} 0 R >>`));
    }

    doc.set(pagesAt, `<< /Type /Pages /Count ${kids.length} /Kids [`
      + `${kids.map((k) => `${k} 0 R`).join(" ")}] >>`);
    return doc.finish();
  }

  // Blocks in, pages out. A block is { type, text }, where type is one of the
  // styles above; anything else is treated as a paragraph.
  function layout(blocks) {
    const room = PAGE.width - MARGIN * 2;
    const pages = [];
    let lines = [];
    let y = PAGE.height - MARGIN;

    const push = () => {
      if (lines.length) pages.push(lines);
      lines = [];
      y = PAGE.height - MARGIN;
    };

    for (const block of blocks || []) {
      const style = STYLES[block.type] || STYLES.p;
      const indent = style.indent || 0;
      const text = style.bullet ? `${style.bullet}${block.text}` : block.text;
      // A pre block keeps the lines it was given; everything else is wrapped.
      const wrapped = style.mono
        ? String(text).split("\n")
        : wrap(text, style.size, style, room - indent);
      if (!wrapped.length) continue;
      y -= style.before;
      for (const line of wrapped) {
        const step = style.size * LEADING;
        if (y - step < MARGIN) push();
        y -= step;
        lines.push({ x: MARGIN + indent, y, text: line, style });
      }
      y -= style.after;
    }
    push();
    return pages;
  }

  function paint(lines) {
    const out = [];
    for (const line of lines) {
      const font = line.style.mono ? "/F3" : (line.style.bold ? "/F2" : "/F1");
      out.push(`BT ${font} ${line.style.size} Tf `
        + `${line.x.toFixed(2)} ${line.y.toFixed(2)} Td (${escape(line.text)}) Tj ET`);
    }
    return out.join("\n");
  }

  async function fromText(options) {
    const blocks = (options && options.blocks) || [];
    const title = (options && options.title) || "";
    // A page whose first heading is its own title would otherwise print the
    // same line twice.
    const body = blocks.length && /^h/.test(blocks[0].type || "")
      && blocks[0].text.trim() === title.trim()
      ? blocks.slice(1)
      : blocks;
    const titled = title ? [{ type: "h1", text: title }].concat(body) : body;
    const pages = layout(titled);
    if (!pages.length) pages.push([]);

    const doc = document();
    doc.add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesAt = doc.reserve();
    const regular = doc.add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const bold = doc.add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const mono = doc.add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");

    const kids = [];
    for (const lines of pages) {
      const contentAt = doc.add(stream("", bytesOf(paint(lines))));
      kids.push(doc.add(
        `<< /Type /Page /Parent ${pagesAt} 0 R `
        + `/MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
        + `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R `
        + `/F3 ${mono} 0 R >> >> /Contents ${contentAt} 0 R >>`));
    }
    doc.set(pagesAt, `<< /Type /Pages /Count ${kids.length} /Kids [`
      + `${kids.map((k) => `${k} 0 R`).join(" ")}] >>`);
    return doc.finish();
  }

  window.CTAPdf = {
    PAGE, MARGIN, LEADING, STYLES, widthOf, wrap, escape, latin, deflate,
    document, stream, bytesOf, layout, fromImages, fromText
  };
})();
