/**
 * CodexZip - dependency-free ZIP writer (STORE, no compression).
 *   CodexZip.build([{ name, content }]) -> Blob (application/zip)
 * Used by Nova's coding workspace to export generated projects.
 */
(function (w) {
  "use strict";

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function u8(arr) { return new Uint8Array(arr); }

  function build(files) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    var d = new Date();
    var time = ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF;
    var date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    var count = 0;

    (files || []).forEach(function (f) {
      var name = enc.encode(String(f.name || "file.txt").replace(/^\/+/, ""));
      var data = enc.encode(String(f.content == null ? "" : f.content));
      var crc = crc32(data);

      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      parts.push(u8(local), name, data);

      var cd = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(crc), u32(data.length), u32(data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      central.push(u8(cd), name);

      offset += local.length + name.length + data.length;
      count++;
    });

    var cdSize = central.reduce(function (n, a) { return n + a.length; }, 0);
    var end = u8([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
      u32(cdSize), u32(offset), u16(0)
    ));

    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }

  w.CodexZip = { build: build, crc32: crc32 };
})(window);
