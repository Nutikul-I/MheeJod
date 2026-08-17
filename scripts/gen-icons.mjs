/* ===================================================================
   gen-icons.mjs — สร้างไอคอน PNG หน้าหมี โดยไม่พึ่งไลบรารีภายนอก
   วาดด้วยการคำนวณพิกเซลเอง แล้วเข้ารหัส PNG ด้วย zlib ของ Node
   รัน: node scripts/gen-icons.mjs
   =================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'icons');
mkdirSync(OUT, { recursive: true });

const C = {
  bg1: [0xF2, 0xB2, 0x3E], bg2: [0xE0, 0x9A, 0x1E],
  fur: [0x8B, 0x5E, 0x3C], furDark: [0x6B, 0x46, 0x2B],
  muzzle: [0xF7, 0xE3, 0xCB], eye: [0x2E, 0x2A, 0x26], nose: [0x3A, 0x2A, 0x1A],
  cream: [0xFF, 0xF8, 0xF0],
};

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** วาดหน้าหมี */
function drawBear(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size;
  const pad = maskable ? S * 0.14 : 0;        // maskable เผื่อขอบให้ระบบครอบ
  const radius = maskable ? S : S * 0.24;      // มุมโค้งของพื้นหลัง

  const put = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const sa = a, da = buf[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / (outA || 1));
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / (outA || 1));
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / (outA || 1));
    buf[i + 3] = Math.round(outA * 255);
  };

  // นุ่มขอบด้วย anti-alias ง่าย ๆ: คืนค่า 0..1 ตามระยะ
  const soft = (d, edge) => Math.max(0, Math.min(1, (edge - d) / 1.4 + 0.5));

  const circle = (cx, cy, r, color, alpha = 1) => {
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++)
      for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
        const d = Math.hypot(x - cx + .5, y - cy + .5);
        const a = soft(d, r) * alpha;
        if (a > 0) put(x, y, color, a);
      }
  };

  const ellipse = (cx, cy, rx, ry, color, alpha = 1) => {
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++)
      for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
        const nx = (x - cx + .5) / rx, ny = (y - cy + .5) / ry;
        const d = Math.hypot(nx, ny) * Math.min(rx, ry);
        const a = soft(d, Math.min(rx, ry)) * alpha;
        if (a > 0) put(x, y, color, a);
      }
  };

  // พื้นหลังไล่สีมุมโค้ง
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const rx = Math.max(radius - x, x - (S - radius), 0);
      const ry = Math.max(radius - y, y - (S - radius), 0);
      const d = Math.hypot(rx, ry);
      const a = radius >= S ? 1 : soft(d, radius);
      if (a <= 0) continue;
      const t = (x + y) / (2 * S);
      const col = [
        Math.round(C.bg1[0] + (C.bg2[0] - C.bg1[0]) * t),
        Math.round(C.bg1[1] + (C.bg2[1] - C.bg1[1]) * t),
        Math.round(C.bg1[2] + (C.bg2[2] - C.bg1[2]) * t),
      ];
      put(x, y, col, a);
    }
  }

  const cx = S / 2, cy = S / 2 + (maskable ? 0 : S * 0.01);
  const headR = (S - pad * 2) * 0.30;

  // หู
  circle(cx - headR * 0.92, cy - headR * 0.88, headR * 0.40, C.fur);
  circle(cx + headR * 0.92, cy - headR * 0.88, headR * 0.40, C.fur);
  circle(cx - headR * 0.92, cy - headR * 0.88, headR * 0.21, C.muzzle);
  circle(cx + headR * 0.92, cy - headR * 0.88, headR * 0.21, C.muzzle);

  // หัว
  circle(cx, cy, headR, C.fur);

  // ปาก
  ellipse(cx, cy + headR * 0.33, headR * 0.55, headR * 0.42, C.muzzle);

  // ตา
  circle(cx - headR * 0.38, cy - headR * 0.14, headR * 0.115, C.eye);
  circle(cx + headR * 0.38, cy - headR * 0.14, headR * 0.115, C.eye);
  circle(cx - headR * 0.34, cy - headR * 0.18, headR * 0.04, C.cream, .9);
  circle(cx + headR * 0.42, cy - headR * 0.18, headR * 0.04, C.cream, .9);

  // จมูก
  ellipse(cx, cy + headR * 0.16, headR * 0.16, headR * 0.12, C.nose);
  // ปากยิ้ม
  for (let a = 0; a < Math.PI; a += 0.02) {
    const r = headR * 0.22;
    const x = cx - r * Math.cos(a), y = cy + headR * 0.36 + r * Math.sin(a) * 0.8;
    circle(x, y, S * 0.008, C.nose, .85);
  }

  return buf;
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

for (const t of targets) {
  const png = encodePNG(t.size, t.size, drawBear(t.size, t.maskable));
  writeFileSync(join(OUT, t.name), png);
  console.log('สร้าง', t.name, (png.length / 1024).toFixed(1) + ' KB');
}
