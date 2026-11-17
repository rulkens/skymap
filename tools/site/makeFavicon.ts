/**
 * Write the web app's and the site's icons from the Skymap mark (packages/website utils/skymapIcon):
 * `public/favicon.svg`, the small drawing on a rounded tile, which must read at 16 px in a light or a
 * dark tab, and the PNGs, the large drawing on a square tile: 180 px for iOS home-screen shortcuts
 * (iOS renders no SVG icon and rounds the corners itself), 192 and 512 px for the remote's web app
 * manifest (`public/remote.webmanifest`). All are committed, so a deploy does not depend on this
 * running; re-run it (`npx tsx tools/site/makeFavicon.ts`) when the mark changes.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

import { skymapIcon } from '../../packages/website/src/utils/skymapIcon';

const PNGS = [
  [180, 'public/apple-touch-icon.png'],
  [192, 'public/icon-192.png'],
  [512, 'public/icon-512.png'],
] as const;

writeFileSync('public/favicon.svg', skymapIcon('rounded', 'small'));
for (const [size, path] of PNGS) {
  // Drawn at four times the size and brought down, so the thin filaments stay smooth.
  const png = await sharp(Buffer.from(skymapIcon('square', 'large')), {
    density: (72 * 4 * size) / 100,
  })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path, png);
  console.log(`wrote ${png.length} bytes to ${path}`);
}
