import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

// Standard PNG Encoder with CRC32
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
  return buf;
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanOffset++] = 0; // Filter: None
    const rowOffset = y * width * 4;
    rgbaBuffer.copy(scanlines, scanOffset, rowOffset, rowOffset + width * 4);
    scanOffset += width * 4;
  }

  const idat = deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// 2D Signed Distance Primitives
function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

// Color blend helper (over operator)
function blendOver(dst, r, g, b, a) {
  const alpha = a / 255;
  const outA = alpha + dst.a * (1 - alpha);
  if (outA > 0) {
    dst.r = (r * alpha + dst.r * dst.a * (1 - alpha)) / outA;
    dst.g = (g * alpha + dst.g * dst.a * (1 - alpha)) / outA;
    dst.b = (b * alpha + dst.b * dst.a * (1 - alpha)) / outA;
    dst.a = outA;
  }
}

// Evaluate normalized point (u: 0..1, v: 0..1)
function sampleLogo(u, v) {
  // Center coordinates: -0.5 .. 0.5
  const x = u - 0.5;
  const y = v - 0.5;

  const color = { r: 0, g: 0, b: 0, a: 0 };

  // 1. Base Squircle Badge (dark obsidian #0d1117 with crisp slate border #30363d)
  const dBase = sdRoundedBox(x, y, 0.44, 0.44, 0.12);
  if (dBase <= 0.005) {
    if (dBase > -0.02) {
      // Crisp outer border #30363d
      blendOver(color, 48, 54, 61, 255);
    } else {
      // Fill #0d1117
      blendOver(color, 13, 17, 23, 255);
    }
  }

  // 2. Back Document Sheet (dark steel #161b22, subtle border #30363d)
  const dDocBack = sdRoundedBox(x - (-0.08), y - (-0.02), 0.20, 0.26, 0.035);
  if (dDocBack <= 0.002) {
    if (dDocBack > -0.015) {
      blendOver(color, 48, 54, 61, 220);
    } else {
      blendOver(color, 22, 27, 34, 255);
    }
  }

  // 3. Front Document Sheet (#0d1117 with electric border #58a6ff)
  const dDocFront = sdRoundedBox(x - (-0.02), y - 0.05, 0.22, 0.27, 0.04);
  if (dDocFront <= 0.002) {
    if (dDocFront > -0.016) {
      // Crisp blue accent border #58a6ff
      blendOver(color, 88, 166, 255, 255);
    } else {
      blendOver(color, 13, 17, 23, 255);
    }
  }

  // 4. Document Content Lines (clean muted text lines #8b949e)
  const dLine1 = sdSegment(x, y, -0.14, -0.08, 0.04, -0.08) - 0.012;
  const dLine2 = sdSegment(x, y, -0.14, -0.01, 0.08, -0.01) - 0.012;
  const dLine3 = sdSegment(x, y, -0.14, 0.06, 0.00, 0.06) - 0.012;
  const dLine4 = sdSegment(x, y, -0.14, 0.13, 0.06, 0.13) - 0.012;

  if (dLine1 <= 0 || dLine2 <= 0 || dLine3 <= 0 || dLine4 <= 0) {
    blendOver(color, 139, 148, 158, 220);
  }

  // 5. Harvest Emblem Arc (sweeping vibrant emerald #238636 to #3fb950)
  // Outer circle cut by inner circle
  const dOuterArc = sdCircle(x, y, 0.12, -0.06, 0.28);
  const dInnerArc = sdCircle(x, y, 0.04, -0.02, 0.24);
  const dCutBottom = y - 0.22;
  const dCutLeft = -(x - (-0.02));

  const dSickle = Math.max(dOuterArc, -dInnerArc, dCutBottom, dCutLeft);
  if (dSickle <= 0.003) {
    // Gradient from emerald #2ea043 to bright green #3fb950
    const grad = Math.min(1, Math.max(0, (x + 0.1) * 2));
    const r = Math.round(35 * (1 - grad) + 63 * grad);
    const g = Math.round(134 * (1 - grad) + 185 * grad);
    const b = Math.round(54 * (1 - grad) + 80 * grad);
    blendOver(color, r, g, b, 255);
  }

  // 6. Harvest Leaf / Sprout Center (#56d364)
  const dLeaf1 = sdCircle(x, y, 0.16, -0.12, 0.12);
  const dLeaf2 = sdCircle(x, y, 0.22, -0.06, 0.12);
  const dLeaf = Math.max(dLeaf1, dLeaf2);
  if (dLeaf <= 0.002) {
    blendOver(color, 86, 211, 100, 255);
  }

  // 7. Data Spark Point (#ffffff core)
  const dSpark = sdCircle(x, y, 0.26, -0.18, 0.025);
  if (dSpark <= 0.002) {
    blendOver(color, 255, 255, 255, 255);
  }

  return color;
}

// Generate icon of given resolution with 4x supersampling (16 sub-samples per pixel)
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const subSamples = 4;
  const totalSub = subSamples * subSamples;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let accR = 0, accG = 0, accB = 0, accA = 0;

      for (let sy = 0; sy < subSamples; sy++) {
        for (let sx = 0; sx < subSamples; sx++) {
          const u = (px + (sx + 0.5) / subSamples) / size;
          const v = (py + (sy + 0.5) / subSamples) / size;
          const c = sampleLogo(u, v);
          accR += c.r * c.a;
          accG += c.g * c.a;
          accB += c.b * c.a;
          accA += c.a;
        }
      }

      const offset = (py * size + px) * 4;
      const alpha = accA / totalSub;
      if (alpha > 0.001) {
        buf[offset + 0] = Math.round(accR / accA);
        buf[offset + 1] = Math.round(accG / accA);
        buf[offset + 2] = Math.round(accB / accA);
        buf[offset + 3] = Math.min(255, Math.max(0, Math.round(alpha * 255)));
      } else {
        buf[offset + 0] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        buf[offset + 3] = 0;
      }
    }
  }

  return encodePng(size, size, buf);
}

// Generate icons for Chrome Extension
mkdirSync('public', { recursive: true });
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  console.log(`Generating icon-${size}.png...`);
  const pngData = renderIcon(size);
  writeFileSync(`public/icon-${size}.png`, pngData);
  console.log(`Saved public/icon-${size}.png (${pngData.length} bytes)`);
}

console.log('All extension icons successfully generated!');
