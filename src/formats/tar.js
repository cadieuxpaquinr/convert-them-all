/*
 * Reading and writing tar, and the gzip around it.
 *
 * A tar is the simplest container there is: a 512-byte header per file, the
 * file rounded up to 512, and two empty blocks at the end. Every number in the
 * header is written as octal text, which is why the format outlived the tape
 * drives it was named for.
 *
 * Compression is not tar's business, and it is not this file's either: gzip
 * comes from the browser through CompressionStream, so a .tar.gz is one call
 * on top of the other.
 *
 * ustar is written, which splits a long name into a prefix and a name. A name
 * too long for even that is refused rather than silently cut.
 */
(() => {
  const BLOCK = 512;
  const NAME = 100;
  const PREFIX = 155;
  const FILE = "0";
  const FOLDER = "5";

  function octal(value, width) {
    const text = Math.floor(value).toString(8);
    if (text.length > width - 1) throw new Error("that number is too big for a tar");
    return text.padStart(width - 1, "0") + "\0";
  }

  function put(block, at, text) {
    const bytes = new TextEncoder().encode(text);
    block.set(bytes, at);
    return bytes.length;
  }

  // A name over 100 characters is split at a slash, with the front half in the
  // prefix field. One with no slash to split at will not fit at all.
  function split(name) {
    const bytes = new TextEncoder().encode(name);
    if (bytes.length <= NAME) return { prefix: "", name };
    const at = name.lastIndexOf("/", name.length - NAME);
    const prefix = at > 0 ? name.slice(0, at) : "";
    const rest = at > 0 ? name.slice(at + 1) : name;
    if (new TextEncoder().encode(rest).length > NAME
      || new TextEncoder().encode(prefix).length > PREFIX) {
      throw new Error(`${name} is too long for a tar`);
    }
    return { prefix, name: rest };
  }

  // The checksum is the sum of every byte of the header, worked out with the
  // checksum field itself read as spaces. It is the one field that cannot be
  // written before the rest.
  function sign(block) {
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) {
      sum += i >= 148 && i < 156 ? 32 : block[i];
    }
    put(block, 148, `${octal(sum, 7)} `);
  }

  function header(entry) {
    const block = new Uint8Array(BLOCK);
    const folder = String(entry.name).endsWith("/");
    const parts = split(String(entry.name));
    put(block, 0, parts.name);
    put(block, 100, octal(entry.mode || (folder ? 0o755 : 0o644), 8));
    put(block, 108, octal(0, 8));
    put(block, 116, octal(0, 8));
    put(block, 124, octal(entry.bytes ? entry.bytes.length : 0, 12));
    put(block, 136, octal(Math.floor((entry.modified || Date.now()) / 1000), 12));
    put(block, 156, folder ? FOLDER : FILE);
    put(block, 257, "ustar\0");
    put(block, 263, "00");
    put(block, 265, "convert-them-all");
    put(block, 297, "convert-them-all");
    if (parts.prefix) put(block, 345, parts.prefix);
    sign(block);
    return block;
  }

  function write(entries) {
    const parts = [];
    let total = 0;
    for (const entry of entries || []) {
      const body = entry.bytes instanceof Uint8Array
        ? entry.bytes
        : new Uint8Array(entry.bytes || 0);
      parts.push(header({ name: entry.name, bytes: body,
        modified: entry.modified, mode: entry.mode }));
      total += BLOCK;
      if (body.length) {
        parts.push(body);
        const padding = (BLOCK - (body.length % BLOCK)) % BLOCK;
        if (padding) parts.push(new Uint8Array(padding));
        total += body.length + padding;
      }
    }
    // Two empty blocks say the archive is over, and tar wants them.
    parts.push(new Uint8Array(BLOCK * 2));
    total += BLOCK * 2;
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  function readText(bytes, at, length) {
    const end = bytes.indexOf(0, at);
    const stop = end === -1 || end > at + length ? at + length : end;
    return new TextDecoder().decode(bytes.subarray(at, stop)).trim();
  }

  function readOctal(bytes, at, length) {
    const text = readText(bytes, at, length).replace(/[^0-7]/g, "");
    return text ? parseInt(text, 8) : 0;
  }

  function list(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < BLOCK) throw new Error("that file is too small to be a tar");
    const entries = [];
    let at = 0;
    while (at + BLOCK <= bytes.length) {
      // An all-zero block is the end of the archive.
      if (bytes[at] === 0) break;
      const magic = readText(bytes, 257, 6);
      if (at === 0 && !magic.startsWith("ustar") && magic !== "") {
        throw new Error("that does not look like a tar");
      }
      const name = readText(bytes, at, NAME);
      const prefix = readText(bytes, at + 345, PREFIX);
      const size = readOctal(bytes, at + 124, 12);
      const type = String.fromCharCode(bytes[at + 156] || 0x30);
      const full = prefix ? `${prefix}/${name}` : name;
      if (!full) break;
      entries.push({
        name: full,
        size,
        offset: at + BLOCK,
        folder: type === FOLDER || full.endsWith("/"),
        modified: new Date(readOctal(bytes, at + 136, 12) * 1000)
      });
      at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    }
    return entries;
  }

  function read(input, entry) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    return bytes.slice(entry.offset, entry.offset + entry.size);
  }

  async function gzip(bytes) {
    const packed = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(packed).arrayBuffer());
  }

  async function gunzip(bytes) {
    const loose = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(loose).arrayBuffer());
  }

  function isGzip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  }

  // A tar has no magic number at the front; the word ustar sits 257 bytes in.
  function isTar(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < 265) return false;
    return new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar";
  }

  window.CTATar = {
    BLOCK, write, list, read, gzip, gunzip, isGzip, isTar, split
  };
})();
