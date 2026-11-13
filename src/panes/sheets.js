/*
 * The Sheets pane: a workbook in, plain data out.
 *
 * What comes out is deliberately dull. A spreadsheet is read for its values,
 * not its formatting, so a formula arrives as the answer it last gave and a
 * date as the day it names. Nothing is written back into a spreadsheet format
 * yet, and the pane says so rather than offering a file that might not open.
 *
 * A workbook with several sheets is several files, so that choice is made
 * before anything is saved.
 */
(() => {
  const OUTPUTS = [
    { id: "csv-each", label: "CSV, one file per sheet", ext: "csv" },
    { id: "csv-first", label: "CSV, the first sheet", ext: "csv" },
    { id: "tsv-each", label: "TSV, one file per sheet", ext: "tsv" },
    { id: "json", label: "JSON, every sheet", ext: "json" }
  ];

  const el = {};
  let placeholder = "";
  let book = null;
  let picked = null;

  function rows(sheet) {
    return sheet.rows.length;
  }

  function describe() {
    if (!book) {
      el.selection.textContent = placeholder;
      return;
    }
    const total = book.sheets.reduce((sum, sheet) => sum + rows(sheet), 0);
    el.selection.textContent = `${book.name}: ${book.sheets.length} `
      + `${book.sheets.length === 1 ? "sheet" : "sheets"}, ${total} `
      + `${total === 1 ? "row" : "rows"}, read as ${book.kind}.`;
  }

  function paint() {
    el.list.textContent = "";
    if (!book) return;
    for (const sheet of book.sheets) {
      const line = document.createElement("div");
      const name = document.createElement("span");
      name.className = "path";
      name.textContent = sheet.name;
      const count = document.createElement("span");
      count.className = "size";
      const wide = sheet.rows.reduce((most, row) => Math.max(most, row.length), 0);
      count.textContent = `${rows(sheet)} × ${wide}`;
      line.append(name, count);
      el.list.appendChild(line);
    }
  }

  function enable(on) {
    for (const node of [el.format, el.name, el.header, el.save]) {
      node.disabled = !on;
    }
  }

  async function load(file) {
    if (!el.list) return;
    book = null;
    try {
      const read = await CTASheet.read(file);
      book = { name: file.name, kind: read.kind, sheets: read.sheets };
    } catch (e) {
      CTAMessages.say(`Could not read ${file.name}: ${e.message}`, true);
    }
    el.name.value = book ? CTAConvert.nameFrom(file.name) : "";
    paint();
    enable(!!book);
    describe();
  }

  // A sheet's own name becomes part of the file name when there is more than
  // one of them, so two sheets cannot overwrite each other.
  function nameFor(target, sheet) {
    const stem = el.name.value || "sheet";
    const full = sheet && book.sheets.length > 1
      ? `${stem}-${CTASitePath.safe(sheet.name)}`
      : stem;
    return CTAConvert.fileName(full, target.ext);
  }

  async function put(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    try {
      await browser.downloads.download({ url, filename: name, saveAs: false,
        conflictAction: "overwrite" });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function save() {
    const target = OUTPUTS.find((o) => o.id === el.format.value) || OUTPUTS[0];
    enable(false);
    try {
      if (target.id === "json") {
        await put(nameFor(target, null),
          CTASheet.toJson(book.sheets, el.header.checked), "application/json");
        CTAMessages.say(`Saved ${book.sheets.length} `
          + `${book.sheets.length === 1 ? "sheet" : "sheets"} as JSON.`);
      } else {
        const delimiter = target.id.startsWith("tsv")
          ? CTASheet.DELIMITERS.tsv
          : CTASheet.DELIMITERS.csv;
        const wanted = target.id === "csv-first"
          ? book.sheets.slice(0, 1)
          : book.sheets;
        for (const sheet of wanted) {
          await put(nameFor(target, sheet),
            CTASheet.toDelimited(sheet.rows, delimiter), "text/plain");
        }
        CTAMessages.say(`Saved ${wanted.length} `
          + `${wanted.length === 1 ? "file" : "files"}.`);
      }
    } catch (e) {
      CTAMessages.say(`Could not save that: ${e.message}`, true);
    }
    enable(true);
  }

  function mount() {
    el.selection = document.getElementById("sheet-selection");
    el.list = document.getElementById("sheet-list");
    el.pick = document.getElementById("pick-sheet");
    el.file = document.getElementById("sheet-file");
    el.format = document.getElementById("sheet-format");
    el.name = document.getElementById("sheet-name");
    el.header = document.getElementById("sheet-header");
    el.save = document.getElementById("sheet-save");

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
      if (file && picked) picked(file, "sheets");
    });
    el.save.addEventListener("click", () => save().catch(() => {}));

    enable(false);
  }

  function onPick(handler) {
    picked = handler;
  }

  window.CTASheets = { mount, file: load, onPick };
})();
