/*
 * Markdown and HTML, in both directions, over the same blocks everything else
 * here speaks: { type, text } with type h1, h2, h3, p, li, pre or row.
 *
 * markdown.js already walks a DOM into Markdown, and is used for a whole web
 * page. This is the smaller, stricter pair: a document rather than a page, so
 * the output is plain and predictable and round-trips without drifting.
 */
(() => {
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // The inline marks, kept small on purpose: bold, italic, code and links.
  // Anything else is text, which is what a converter should do with what it
  // does not understand.
  function inlineHtml(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }

  // A line-based reader. Markdown has no shortage of corners; these are the
  // ones a document written by a person actually uses.
  function fromMarkdown(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let fence = null;

    const flush = () => {
      if (paragraph.length) {
        blocks.push({ type: "p", text: paragraph.join(" ").trim() });
        paragraph = [];
      }
    };

    for (const line of lines) {
      if (fence !== null) {
        if (/^\s*```/.test(line)) {
          blocks.push({ type: "pre", text: fence.join("\n") });
          fence = null;
        } else {
          fence.push(line);
        }
        continue;
      }
      if (/^\s*```/.test(line)) {
        flush();
        fence = [];
        continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        const level = Math.min(3, heading[1].length);
        blocks.push({ type: `h${level}`, text: heading[2].trim() });
        continue;
      }
      const item = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (item) {
        flush();
        blocks.push({ type: "li", text: item[1].trim() });
        continue;
      }
      const quote = /^\s*>\s?(.*)$/.exec(line);
      if (quote) {
        flush();
        blocks.push({ type: "p", text: quote[1].trim() });
        continue;
      }
      if (!line.trim()) {
        flush();
        continue;
      }
      paragraph.push(line.trim());
    }
    if (fence !== null) blocks.push({ type: "pre", text: fence.join("\n") });
    flush();
    return blocks;
  }

  function toMarkdown(blocks, title) {
    const out = [];
    if (title) out.push(`# ${title}`);
    for (const block of blocks || []) {
      if (block.type === "h1") out.push(`# ${block.text}`);
      else if (block.type === "h2") out.push(`## ${block.text}`);
      else if (block.type === "h3") out.push(`### ${block.text}`);
      else if (block.type === "li") out.push(`- ${block.text}`);
      else if (block.type === "pre") out.push("```\n" + block.text + "\n```");
      else if (block.type === "row") out.push(`| ${(block.cells || [block.text]).join(" | ")} |`);
      else out.push(block.text);
    }
    return `${out.join("\n\n")}\n`;
  }

  function toHtml(blocks, title) {
    const body = [];
    let list = false;
    const closeList = () => {
      if (list) {
        body.push("</ul>");
        list = false;
      }
    };
    for (const block of blocks || []) {
      if (block.type === "li") {
        if (!list) {
          body.push("<ul>");
          list = true;
        }
        body.push(`<li>${inlineHtml(block.text)}</li>`);
        continue;
      }
      closeList();
      if (/^h[123]$/.test(block.type)) {
        body.push(`<${block.type}>${inlineHtml(block.text)}</${block.type}>`);
      } else if (block.type === "pre") {
        body.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);
      } else if (block.type === "row") {
        body.push(`<p>${inlineHtml((block.cells || [block.text]).join(" | "))}</p>`);
      } else {
        body.push(`<p>${inlineHtml(block.text)}</p>`);
      }
    }
    closeList();
    const head = title ? `<title>${escapeHtml(title)}</title>` : "";
    return `<!DOCTYPE html>\n<html><head><meta charset="utf-8">${head}</head>\n`
      + `<body>\n${body.join("\n")}\n</body></html>\n`;
  }

  // An HTML document back to blocks, reusing the walk the Websites pane uses
  // so a page and a document are read the same way.
  function fromHtml(html) {
    return CTAWeb.blocksOf(CTAWeb.parse(html));
  }

  window.CTADocText = {
    fromMarkdown, toMarkdown, toHtml, fromHtml, inlineHtml, escapeHtml
  };
})();
