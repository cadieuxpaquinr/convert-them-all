/*
 * Spreadsheets in, plain data out.
 *
 * An xlsx and an ods are both a zip full of XML, so the archive reader and
 * DOMParser do the opening and this does the understanding. What makes a
 * spreadsheet reader hard is never the container:
 *
 *   shared strings  xlsx keeps text in one table and the cells hold indexes
 *   cached values   a formula cell carries both the formula and its last
 *                   answer; the answer is what a csv wants
 *   dates           are numbers counting days from the last day of 1899, and
 *                   only the cell's format says a number is a date at all
 *   gaps            a row can skip columns, and ods repeats a cell rather
 *                   than writing it twice
 *
 * Nothing is written back yet: a workbook this made and a spreadsheet refused
 * to open would be worse than not offering it.
 */
(() => {
  // Excel counts days from 1900-01-01, which is serial 1, and believes 1900
  // was a leap year. Serial 60 is therefore the 29th of February 1900, a day
  // that never happened; everything after it is shifted by one, which is why
  // the usual epoch of 1899-12-30 works for later dates and not for earlier
  // ones.
  const EPOCH = Date.UTC(1899, 11, 30);
  const EARLY_EPOCH = Date.UTC(1899, 11, 31);
  const PHANTOM = 60;
  const DAY = 86400000;
  // The format numbers Excel reserves for dates and times.
  const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

  const DELIMITERS = { csv: ",", tsv: "\t" };

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const bad = doc.querySelector("parsererror");
    if (bad) throw new Error("the XML inside is damaged");
    return doc;
  }

  // Namespaces make querySelector awkward, so elements are found by their
  // local name, which is what every spreadsheet writer agrees on.
  function tags(node, name) {
    return Array.from(node.getElementsByTagName("*"))
      .filter((child) => child.localName === name);
  }

  function childTags(node, name) {
    return Array.from(node.children).filter((child) => child.localName === name);
  }

  function attribute(node, name) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === name) return attr.value;
    }
    return null;
  }

  // "B3" is column 2, row 3. Only the letters matter here.
  function columnOf(ref) {
    const letters = String(ref || "").replace(/[^A-Z]/gi, "").toUpperCase();
    let at = 0;
    for (const letter of letters) at = at * 26 + (letter.charCodeAt(0) - 64);
    return Math.max(0, at - 1);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  // A date is written the way every other program reads it back, which is ISO.
  function dateFrom(serial) {
    // The day that never was, written as the spreadsheet writes it rather
    // than quietly turned into the 28th.
    if (Math.floor(serial) === PHANTOM) return "1900-02-29";
    const epoch = serial < PHANTOM ? EARLY_EPOCH : EPOCH;
    const when = new Date(epoch + Math.round(serial * DAY));
    const day = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-`
      + `${pad(when.getUTCDate())}`;
    const rest = serial % 1;
    if (!rest) return day;
    return `${day} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:`
      + `${pad(when.getUTCSeconds())}`;
  }

  // Which styles mean a date. A custom format counts when it has day, month or
  // year letters in it and no escape marks pretending otherwise.
  function dateStyles(stylesXml) {
    const dated = new Set();
    if (!stylesXml) return dated;
    const doc = parseXml(stylesXml);
    const custom = new Map();
    for (const node of tags(doc, "numFmt")) {
      const code = attribute(node, "formatCode") || "";
      const stripped = code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
      if (/[dmyhs]/i.test(stripped) && /[dy]/i.test(stripped)) {
        custom.set(attribute(node, "numFmtId"), true);
      }
    }
    const xfs = tags(doc, "cellXfs")[0];
    if (!xfs) return dated;
    childTags(xfs, "xf").forEach((xf, index) => {
      const id = attribute(xf, "numFmtId");
      if (DATE_FORMATS.has(Number(id)) || custom.has(id)) dated.add(index);
    });
    return dated;
  }

  function sharedStrings(xml) {
    if (!xml) return [];
    const doc = parseXml(xml);
    return tags(doc, "si").map((si) => tags(si, "t")
      .map((t) => t.textContent).join(""));
  }

  function sheetRows(xml, strings, dated) {
    const doc = parseXml(xml);
    const rows = [];
    for (const row of tags(doc, "row")) {
      const index = Number(attribute(row, "r") || rows.length + 1) - 1;
      const cells = [];
      for (const cell of childTags(row, "c")) {
        const at = attribute(cell, "r") ? columnOf(attribute(cell, "r")) : cells.length;
        const type = attribute(cell, "t");
        const style = Number(attribute(cell, "s") || -1);
        const value = tags(cell, "v")[0];
        let out = "";
        if (type === "s") {
          out = strings[Number(value ? value.textContent : -1)] || "";
        } else if (type === "inlineStr") {
          out = tags(cell, "t").map((t) => t.textContent).join("");
        } else if (type === "b") {
          out = value && value.textContent === "1" ? "TRUE" : "FALSE";
        } else if (value) {
          // A formula cell keeps its last answer here, which is the thing
          // worth exporting.
          const text = value.textContent;
          out = dated.has(style) && text !== "" && !Number.isNaN(Number(text))
            ? dateFrom(Number(text))
            : text;
        }
        while (cells.length < at) cells.push("");
        cells[at] = out;
      }
      while (rows.length < index) rows.push([]);
      rows[index] = cells;
    }
    return rows;
  }

  async function readXlsx(bytes) {
    const entries = CTAZip.list(bytes);
    const find = (name) => entries.find((e) => e.name === name);
    const textOf = async (entry) => (entry
      ? new TextDecoder().decode(await CTAZip.read(bytes, entry))
      : "");

    const workbook = find("xl/workbook.xml");
    if (!workbook) throw new Error("that zip is not an xlsx");
    const doc = parseXml(await textOf(workbook));

    // The workbook names its sheets and points at them by relationship id;
    // the rels file says which file each id really is.
    const rels = new Map();
    const relsXml = await textOf(find("xl/_rels/workbook.xml.rels"));
    if (relsXml) {
      for (const node of tags(parseXml(relsXml), "Relationship")) {
        rels.set(attribute(node, "Id"),
          String(attribute(node, "Target") || "").replace(/^\/?xl\//, ""));
      }
    }

    const strings = sharedStrings(await textOf(find("xl/sharedStrings.xml")));
    const dated = dateStyles(await textOf(find("xl/styles.xml")));

    const sheets = [];
    const listed = tags(doc, "sheet");
    for (let i = 0; i < listed.length; i += 1) {
      const node = listed[i];
      const target = rels.get(attribute(node, "id"))
        || `worksheets/sheet${i + 1}.xml`;
      const entry = find(`xl/${target}`);
      if (!entry) continue;
      sheets.push({
        name: attribute(node, "name") || `Sheet${i + 1}`,
        rows: sheetRows(await textOf(entry), strings, dated)
      });
    }
    return sheets;
  }

  // ods writes what it means: a cell says its own type, and a run of identical
  // cells is written once with a count.
  function odsRows(table) {
    const rows = [];
    for (const row of childTags(table, "table-row")) {
      const repeatRow = Number(attribute(row, "number-rows-repeated") || 1);
      const cells = [];
      for (const cell of childTags(row, "table-cell")) {
        const repeat = Number(attribute(cell, "number-columns-repeated") || 1);
        const type = attribute(cell, "value-type");
        let out = "";
        if (type === "date") {
          out = String(attribute(cell, "date-value") || "").replace("T", " ")
            .replace(/:00$/, "");
        } else if (type === "boolean") {
          out = attribute(cell, "boolean-value") === "true" ? "TRUE" : "FALSE";
        } else if (type === "float" || type === "percentage"
          || type === "currency") {
          out = String(attribute(cell, "value") || "");
        } else {
          out = childTags(cell, "p").map((p) => p.textContent).join("\n");
        }
        // A thousand empty cells at the end of a row is how ods says "the rest
        // of the row is empty", and they are not data.
        for (let i = 0; i < Math.min(repeat, 1024); i += 1) cells.push(out);
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      for (let i = 0; i < Math.min(repeatRow, 1024); i += 1) rows.push(cells.slice());
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    return rows;
  }

  async function readOds(bytes) {
    const entries = CTAZip.list(bytes);
    const content = entries.find((e) => e.name === "content.xml");
    if (!content) throw new Error("that zip is not an ods");
    const doc = parseXml(new TextDecoder().decode(await CTAZip.read(bytes, content)));
    return tags(doc, "table").map((table, index) => ({
      name: attribute(table, "name") || `Sheet${index + 1}`,
      rows: odsRows(table)
    }));
  }

  // A csv field can hold the delimiter, a quote or a newline, as long as it is
  // quoted; a quote inside a quoted field is written twice.
  function readDelimited(text, delimiter) {
    const clean = String(text).replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < clean.length; i += 1) {
      const character = clean[i];
      if (quoted) {
        if (character === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += character;
        }
        continue;
      }
      if (character === '"' && field === "") {
        quoted = true;
      } else if (character === delimiter) {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (character !== "\r") {
        field += character;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function quote(value, delimiter) {
    const text = value === null || value === undefined ? "" : String(value);
    return new RegExp(`["\n\r${delimiter === "\t" ? "\\t" : delimiter}]`).test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  }

  function toDelimited(rows, delimiter) {
    return `${(rows || []).map((row) => (row || [])
      .map((cell) => quote(cell, delimiter)).join(delimiter)).join("\n")}\n`;
  }

  // Objects keyed by the first row, which is what a header row is for. A sheet
  // with one row has no data under its header, and comes out as an empty list.
  function toJson(sheets, headers) {
    const out = {};
    for (const sheet of sheets) {
      if (!headers) {
        out[sheet.name] = sheet.rows;
        continue;
      }
      const [head, ...rest] = sheet.rows;
      out[sheet.name] = (rest || []).map((row) => {
        const record = {};
        (head || []).forEach((key, at) => {
          record[key || `column${at + 1}`] = row[at] === undefined ? "" : row[at];
        });
        return record;
      });
    }
    return `${JSON.stringify(out, null, 2)}\n`;
  }

  // What a file is, from its bytes rather than its name.
  async function read(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (CTAZip.isZip(bytes)) {
      const names = CTAZip.list(bytes).map((e) => e.name);
      if (names.includes("xl/workbook.xml")) {
        return { kind: "xlsx", sheets: await readXlsx(bytes) };
      }
      if (names.includes("content.xml")) {
        return { kind: "ods", sheets: await readOds(bytes) };
      }
      throw new Error("that zip holds no spreadsheet");
    }
    // A file calling itself a workbook that is not a zip is a broken workbook,
    // not a csv. Falling through to the text reader would turn it into one
    // cell of rubbish and call that a success.
    if (/\.(xlsx|xlsm|ods)$/i.test(file.name)) {
      throw new Error(`that is not a real ${CTAConvert.extensionFrom(file.name)}`);
    }
    // Nor is anything with a zero byte in it: text does not hold those, and a
    // binary file read as text is noise with commas in it.
    if (bytes.subarray(0, 4096).includes(0)) {
      throw new Error("that is not a spreadsheet, and not text either");
    }
    const text = new TextDecoder().decode(bytes);
    const tab = (text.match(/\t/g) || []).length;
    const comma = (text.match(/,/g) || []).length;
    const delimiter = tab > comma ? "\t" : ",";
    return {
      kind: delimiter === "\t" ? "tsv" : "csv",
      sheets: [{ name: CTAConvert.nameFrom(file.name),
        rows: readDelimited(text, delimiter) }]
    };
  }

  window.CTASheet = {
    DELIMITERS, read, readXlsx, readOds, readDelimited, toDelimited, toJson,
    columnOf, dateFrom, quote
  };
})();
