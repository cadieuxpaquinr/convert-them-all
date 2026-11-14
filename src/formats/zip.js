/*
 * Reading and writing zip files.
 *
 * A zip is a run of entries, each with a small header, followed by a directory
 * repeating those headers with the offset of each one, and an end record
 * pointing at the directory. The compression inside is deflate, and Firefox
 * does deflate: CompressionStream with "deflate-raw", which is the bare stream
 * a zip entry holds, as against the zlib-wrapped one a PDF wants.
 *
 * What is not here, on purpose: zip64, encryption, and the split archives of
 * the floppy disk era. An entry over four gigabytes is refused with a reason
 * rather than written as a file no program can open.
 */
(() => {
  const LOCAL = 0x04034b50;
  const CENTRAL = 0x02014b50;
  const END = 0x06054b50;
  const STORE = 0;
  const DEFLATE = 8;
  // Above this a zip needs the 64-bit extensions, which nothing here writes.
  const MAX = 0xffffffff;
  // Names are written as UTF-8 and the flag says so, which is bit 11.
  const UTF8 = 0x0800;

  const TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Zip keeps the clock of 1980 in two sixteen-bit words, and has no room for
  // odd seconds.
  function dosTime(date) {
    const when = date instanceof Date && !Number.isNaN(date.getTime())
      ? date
      : new Date(1980, 0, 1);
    const year = Math.max(1980, when.getFullYear());
    return {
      time: (when.getHours() << 11) | (when.getMinutes() << 5)
        | (Math.floor(when.getSeconds() / 2)),
      date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
    };
  }

  function fromDos(time, date) {
    return new Date(1980 + ((date >> 9) & 0x7f), ((date >> 5) & 0x0f) - 1,
      date & 0x1f, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2);
  }

  async function deflateRaw(bytes) {
    const packed = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(packed).arrayBuffer());
  }

  async function inflateRaw(bytes) {
    const loose = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(loose).arrayBuffer());
  }

  // A folder is an entry of its own, with a trailing slash and no content.
  function isFolder(name, size) {
    return name.endsWith("/") && size === 0;
  }

  // Entries in: { name, bytes, modified, store }. Bytes may be a Uint8Array or
  // an ArrayBuffer; a name with slashes in it makes folders, which is how a
  // tree gets into a flat format.
  async function write(entries) {
    const parts = [];
    const directory = [];
    let at = 0;

    for (const entry of entries || []) {
      const name = new TextEncoder().encode(String(entry.name));
      const body = entry.bytes instanceof Uint8Array
        ? entry.bytes
        : new Uint8Array(entry.bytes || 0);
      if (body.length > MAX) {
        throw new Error(`${entry.name} is too large for a zip`);
      }

      // Already-compressed bytes get bigger when deflated, and a folder has
      // nothing to compress at all.
      const stored = entry.store || body.length === 0;
      const packed = stored ? body : await deflateRaw(body);
      const method = stored ? STORE : DEFLATE;
      const sum = crc32(body);
      const when = dosTime(entry.modified ? new Date(entry.modified) : new Date());

      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, LOCAL, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, UTF8, true);
      head.setUint16(8, method, true);
      head.setUint16(10, when.time, true);
      head.setUint16(12, when.date, true);
      head.setUint32(14, sum, true);
      head.setUint32(18, packed.length, true);
      head.setUint32(22, body.length, true);
      head.setUint16(26, name.length, true);
      head.setUint16(28, 0, true);
      parts.push(new Uint8Array(head.buffer), name, packed);

      directory.push({ name, method, when, sum, packed: packed.length,
        size: body.length, at });
      at += 30 + name.length + packed.length;
    }

    const start = at;
    for (const entry of directory) {
      const head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, CENTRAL, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, 20, true);
      head.setUint16(8, UTF8, true);
      head.setUint16(10, entry.method, true);
      head.setUint16(12, entry.when.time, true);
      head.setUint16(14, entry.when.date, true);
      head.setUint32(16, entry.sum, true);
      head.setUint32(20, entry.packed, true);
      head.setUint32(24, entry.size, true);
      head.setUint16(28, entry.name.length, true);
      head.setUint32(42, entry.at, true);
      parts.push(new Uint8Array(head.buffer), entry.name);
      at += 46 + entry.name.length;
    }

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, END, true);
    end.setUint16(8, directory.length, true);
    end.setUint16(10, directory.length, true);
    end.setUint32(12, at - start, true);
    end.setUint32(16, start, true);
    parts.push(new Uint8Array(end.buffer));

    return new Blob(parts, { type: "application/zip" });
  }

  // The end record is last, but a comment can follow it, so it is looked for
  // from the back rather than assumed to be at a fixed place.
  function endAt(view, length) {
    const earliest = Math.max(0, length - 22 - 0xffff);
    for (let at = length - 22; at >= earliest; at -= 1) {
      if (view.getUint32(at, true) === END) return at;
    }
    return -1;
  }

  // What is in there, without unpacking any of it: the list a pane shows
  // before the user decides what to take out.
  function list(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 22) throw new Error("that file is too small to be a zip");
    const end = endAt(view, bytes.length);
    if (end < 0) throw new Error("that does not look like a zip");

    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const entries = [];
    for (let i = 0; i < count; i += 1) {
      if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
        throw new Error("this zip's directory is damaged");
      }
      const method = view.getUint16(at + 10, true);
      const time = view.getUint16(at + 12, true);
      const date = view.getUint16(at + 14, true);
      const packed = view.getUint32(at + 20, true);
      const size = view.getUint32(at + 24, true);
      const nameLength = view.getUint16(at + 28, true);
      const extraLength = view.getUint16(at + 30, true);
      const commentLength = view.getUint16(at + 32, true);
      const offset = view.getUint32(at + 42, true);
      const name = new TextDecoder().decode(
        bytes.subarray(at + 46, at + 46 + nameLength));
      entries.push({ name, method, size, packed, offset,
        modified: fromDos(time, date), folder: isFolder(name, size) });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  // One entry's bytes. The local header is read rather than the central one,
  // because only the local header says where the data really starts.
  async function read(input, entry) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(entry.offset, true) !== LOCAL) {
      throw new Error(`${entry.name} is not where the directory says it is`);
    }
    const nameLength = view.getUint16(entry.offset + 26, true);
    const extraLength = view.getUint16(entry.offset + 28, true);
    const from = entry.offset + 30 + nameLength + extraLength;
    const packed = bytes.subarray(from, from + entry.packed);
    if (entry.method === STORE) return packed.slice();
    if (entry.method !== DEFLATE) {
      throw new Error(`${entry.name} uses a compression this cannot read`);
    }
    return await inflateRaw(packed);
  }

  function isZip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
      && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  window.CTAZip = {
    STORE, DEFLATE, crc32, write, list, read, isZip, deflateRaw, inflateRaw
  };
})();
