/**
 * Generate `public/apple-touch-icon.png` (180×180) from `public/favicon.svg`.
 *
 * iOS doesn't render SVG home-screen icons, so we ship a PNG fallback at
 * the standard apple-touch-icon size.  The build is a one-shot — re-run
 * this script (`npx tsx tools/makeFavicon.ts`) only when `favicon.svg`
 * changes.  The output is committed to git so a fresh clone doesn't have
 * to install sharp on cold-start, and so deploys don't depend on the
 * script running in CI.
 *
 * Density 1024 oversamples the SVG before downscaling to 180 px so the
 * radial halo composites cleanly without aliasing.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg');
const buf = await sharp(svg, { density: 1024 })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync('public/apple-touch-icon.png', buf);
console.log(`wrote ${buf.length} bytes to public/apple-touch-icon.png`);
