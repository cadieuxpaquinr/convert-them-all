/*
 * A page as Markdown.
 *
 * Hand-written on purpose: a converter that covers headings, lists, links,
 * code, quotes and simple tables fits in one file and needs nothing bundled.
 * What it does not cover it renders as its text, so a page always comes out
 * readable even when it comes out plain.
 *
 * The document handed in is already parsed and inert: DOMParser builds a tree
 * and runs nothing.
 */
(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD",
    "NAV", "FOOTER", "IFRAME", "OBJECT", "CANVAS"]);
  const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "MAIN",
    "ASIDE", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "ADDRESS", "FORM"]);

  function clean(text) {
    return String(text).replace(/\s+/g, " ");
  }

  // The characters that would otherwise turn into Markdown of their own.
  function escape(text) {
    return text.replace(/([\\`*_[\]<>])/g, "\\$1");
  }

  function absolute(value, base) {
    if (!value) return "";
    try {
      return new URL(value, base).href;
    } catch (e) {
      return value;
    }
  }

  function tableRow(cells, walk) {
    return `| ${cells.map((cell) => walk(cell).trim().replace(/\|/g, "\\|") || " ")
      .join(" | ")} |`;
  }

  function of(doc, base) {
    const root = doc.body || doc;

    function children(node) {
      return Array.from(node.childNodes).map(walk).join("");
    }

    function walk(node) {
      if (node.nodeType === 3) return escape(clean(node.nodeValue));
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return "";

      switch (tag) {
        case "BR":
          return "\n";
        case "HR":
          return "\n\n---\n\n";
        case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
          const hashes = "#".repeat(Number(tag[1]));
          return `\n\n${hashes} ${children(node).trim()}\n\n`;
        }
        case "STRONG": case "B": {
          const inner = children(node).trim();
          return inner ? `**${inner}**` : "";
        }
        case "EM": case "I": {
          const inner = children(node).trim();
          return inner ? `*${inner}*` : "";
        }
        case "CODE": {
          // Inside a pre, the pre writes the fence.
          if (node.parentNode && node.parentNode.tagName === "PRE") {
            return node.textContent;
          }
          return `\`${clean(node.textContent)}\``;
        }
        case "PRE": {
          const body = node.textContent.replace(/\n+$/, "");
          return `\n\n\`\`\`\n${body}\n\`\`\`\n\n`;
        }
        case "BLOCKQUOTE": {
          const body = children(node).trim().split("\n")
            .map((line) => `> ${line}`.trimEnd()).join("\n");
          return `\n\n${body}\n\n`;
        }
        case "A": {
          const text = children(node).trim();
          const href = absolute(node.getAttribute("href"), base);
          if (!text) return "";
          return href ? `[${text}](${href})` : text;
        }
        case "IMG": {
          const alt = clean(node.getAttribute("alt") || "");
          const src = absolute(node.getAttribute("src"), base);
          return src ? `![${alt}](${src})` : "";
        }
        case "UL": case "OL": {
          const ordered = tag === "OL";
          const items = Array.from(node.children)
            .filter((child) => child.tagName === "LI")
            .map((child, i) => {
              const mark = ordered ? `${i + 1}. ` : "- ";
              // A nested list is indented under its item rather than restarted.
              const body = children(child).trim()
                .split("\n").map((line, at) => (at ? `  ${line}` : line)).join("\n");
              return `${mark}${body}`;
            });
          return `\n\n${items.join("\n")}\n\n`;
        }
        case "TABLE": {
          const rows = Array.from(node.querySelectorAll("tr"));
          if (!rows.length) return "";
          const head = Array.from(rows[0].children);
          const lines = [tableRow(head, children),
            `| ${head.map(() => "---").join(" | ")} |`];
          for (const row of rows.slice(1)) {
            lines.push(tableRow(Array.from(row.children), children));
          }
          return `\n\n${lines.join("\n")}\n\n`;
        }
        default:
          return BLOCK.has(tag) ? `\n\n${children(node)}\n\n` : children(node);
      }
    }

    const title = (doc.title || "").trim();
    const body = children(root)
      // Three or more blank lines are a side effect of blocks inside blocks.
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return title ? `# ${escape(title)}\n\n${body}\n` : `${body}\n`;
  }

  window.CTAMarkdown = { of };
})();
