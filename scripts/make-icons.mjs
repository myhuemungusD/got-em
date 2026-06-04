#!/usr/bin/env node
// Build PWA icon PNGs from scratch using only Node core. No deps.
// Output: public/icons/{icon-192, icon-512, icon-maskable-512, apple-touch-icon}.png
//
// Each PNG is constructed by hand: an 8-bit RGB raster (color type 2) with the
// orange wordmark "SD" rendered from a hand-pixeled 32x32 glyph map. The glyph
// is nearest-neighbor upscaled to the target size. For the maskable variant
// the background covers the full canvas (safe area = center 80%).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const ORANGE = [0xff, 0x6b, 0x00];
const BLACK = [0x0a, 0x0a, 0x0a];

// 32x32 glyph map: "SD" on a dark field. 1 = orange, 0 = black.
// Wide letters with a 1-px gutter, designed to read at favicon scale.
// prettier-ignore
const GLYPH_32 = [
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000111111110000001111111100000",
  "00001111111111000011111111110000",
  "00011110000011100011110000111000",
  "00111100000001100011110000011100",
  "00111100000000000011110000011100",
  "00111100000000000011110000011100",
  "00111110000000000011110000011100",
  "00011111100000000011110000011100",
  "00001111111000000011110000011100",
  "00000111111110000011110000011100",
  "00000011111111000011110000011100",
  "00000000011111100011110000011100",
  "00000000001111100011110000011100",
  "00000000000111100011110000011100",
  "00000000000111100011110000011100",
  "00000000000111100011110000011100",
  "00111100000111100011110000011100",
  "00111100000111100011110000011100",
  "00111110000111000011110000111000",
  "00011110000111000011110000111000",
  "00011111111110000011111111110000",
  "00001111111100000001111111100000",
  "00000111110000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
];

const GLYPH_SIZE = 32;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function ihdr(width, height) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = 8;     // bit depth
  buf[9] = 2;     // color type: RGB
  buf[10] = 0;    // compression
  buf[11] = 0;    // filter
  buf[12] = 0;    // interlace
  return chunk("IHDR", buf);
}

function buildRaster(size, paint) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y);
      const o = rowStart + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return raw;
}

function idat(raster) {
  return chunk("IDAT", deflateSync(raster, { level: 9 }));
}

function iend() {
  return chunk("IEND", Buffer.alloc(0));
}

function encodePng(size, paint) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const raster = buildRaster(size, paint);
  return Buffer.concat([sig, ihdr(size, size), idat(raster), iend()]);
}

function paintFlat(size, kind) {
  // kind: "any" -> dark bg with orange glyph; "maskable" -> orange bg with
  // dark glyph so the icon still reads if a platform clips to a circle. The
  // glyph is centered in a safe area (smaller for maskable to survive crop).
  const safeFraction = kind === "maskable" ? 0.7 : 0.86;
  const safePx = Math.floor(size * safeFraction);
  const offset = Math.floor((size - safePx) / 2);
  const scale = safePx / GLYPH_SIZE;
  const bg = kind === "maskable" ? ORANGE : BLACK;
  const fg = kind === "maskable" ? BLACK : ORANGE;
  return (x, y) => {
    const gx = Math.floor((x - offset) / scale);
    const gy = Math.floor((y - offset) / scale);
    if (gx < 0 || gx >= GLYPH_SIZE || gy < 0 || gy >= GLYPH_SIZE) return bg;
    const row = GLYPH_32[gy];
    return row[gx] === "1" ? fg : bg;
  };
}

const targets = [
  { name: "icon-192.png", size: 192, kind: "any" },
  { name: "icon-512.png", size: 512, kind: "any" },
  { name: "icon-maskable-512.png", size: 512, kind: "maskable" },
  { name: "apple-touch-icon.png", size: 180, kind: "any" },
];

for (const t of targets) {
  const png = encodePng(t.size, paintFlat(t.size, t.kind));
  const path = resolve(outDir, t.name);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
