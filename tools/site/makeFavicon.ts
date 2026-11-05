/**
 * Render `public/favicon.svg` to the PNG icons: 180 px for iOS home-screen shortcuts (iOS draws
 * no SVG icons), 192 and 512 px for the remote's web app manifest (`public/remote.webmanifest`).
 *
 * Run `npx tsx tools/site/makeFavicon.ts` only when `favicon.svg` changes. The output is committed,
 * so neither a fresh clone nor a deploy needs sharp.
 *
 * Density 1024 oversamples the SVG before downscaling, so the radial halo composites without aliasing.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg');
const outputs = [
  [180, 'public/apple-touch-icon.png'],
  [192, 'public/icon-192.png'],
  [512, 'public/icon-512.png'],
] as const;
for (const [size, path] of outputs) {
  const buf = await sharp(svg, { density: 1024 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path, buf);
  console.log(`wrote ${buf.length} bytes to ${path}`);
}
