// Deterministic derivatives of the supplied artwork. Run after `npm ci`.
// Sharp is supplied by Astro's image service; no image generation is involved.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const imageDirectory = path('../public/images/');
await mkdir(imageDirectory, { recursive: true });

// Remove only near-black pixels connected to the canvas edge. Dark eyes,
// clothing details and other enclosed pixels are left intact, as are all RGBs.
async function prepareCharacter() {
  const { data, info } = await sharp(path('../src/assets/brand/character-original.png'))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const count = width * height;
  const background = new Uint8Array(count);
  const queue = new Int32Array(count);
  let start = 0;
  let end = 0;
  const enqueue = (pixel) => {
    if (background[pixel]) return;
    const offset = pixel * 4;
    if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 12) return;
    background[pixel] = 1;
    queue[end++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (start < end) {
    const pixel = queue[start++];
    const x = pixel % width;
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel < count - width) enqueue(pixel + width);
  }

  // Find the remaining silhouette and retain a small transparent safety margin.
  let left = width, top = height, right = 0, bottom = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    if (background[pixel]) {
      data[pixel * 4 + 3] = 0;
    } else {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const padding = 4;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  const crop = {
    left, top,
    width: Math.min(width, right + padding + 1) - left,
    height: Math.min(height, bottom + padding + 1) - top,
  };
  const trimmed = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract(crop).png({ compressionLevel: 9 }).toBuffer();
  // Three times the largest display height keeps high-density screens crisp
  // without shipping the full-resolution source in the navigation.
  await sharp(trimmed).resize({ height: 192, kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(`${imageDirectory}/judo-character.png`);
  return crop;
}

async function prepareFavicons() {
  // This source already has transparency. Trim by alpha, without colour-keying
  // its dark outlines, then centre it on each square at its original proportions.
  const original = sharp(path('../src/assets/brand/favicon-original.png'));
  const { data, info } = await original.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const cropped = await original.extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
  const icons = new Map();
  for (const size of [16, 32, 48, 180]) {
    const pixels = await sharp(cropped).resize(size, size, {
      fit: 'contain', kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png({ compressionLevel: 9 }).toBuffer();
    icons.set(size, pixels);
    await writeFile(path(`../public/favicon-judo-${size}.png`), pixels);
  }
  // ICO directory with lossless PNG entries, supported by current browsers.
  const entries = [16, 32, 48];
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((size, index) => {
    const cursor = 6 + index * 16;
    header[cursor] = size;
    header[cursor + 1] = size;
    header.writeUInt16LE(1, cursor + 4);
    header.writeUInt16LE(32, cursor + 6);
    header.writeUInt32LE(icons.get(size).length, cursor + 8);
    header.writeUInt32LE(offset, cursor + 12);
    offset += icons.get(size).length;
  });
  await writeFile(path('../public/favicon.ico'), Buffer.concat([header, ...entries.map(size => icons.get(size))]));
}

console.log('Character crop:', await prepareCharacter());
await prepareFavicons();
console.log('Prepared supplied character and custom favicon assets.');
