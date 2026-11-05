/**
 * Write the web app's and the site's icons from the Skymap mark (packages/website utils/skymapIcon):
 * `public/favicon.svg`, the small drawing on a rounded tile, which must read at 16 px in a light or a
 * dark tab, and `public/apple-touch-icon.png` (180×180), the large drawing on a square tile, since iOS
 * neither renders an SVG home-screen icon nor wants corners it rounds itself. Both are committed, so a
 * deploy does not depend on this running; re-run it (`npx tsx tools/site/makeFavicon.ts`) when the mark
 * changes.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

import { skymapIcon } from '../../packages/website/src/utils/skymapIcon';

const TOUCH_PX = 180;

writeFileSync('public/favicon.svg', skymapIcon('rounded', 'small'));
// Drawn at four times the size and brought down, so the thin filaments stay smooth.
const touch = await sharp(Buffer.from(skymapIcon('square', 'large')), {
  density: (72 * 4 * TOUCH_PX) / 100,
})
  .resize(TOUCH_PX, TOUCH_PX)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync('public/apple-touch-icon.png', touch);
console.log(`wrote public/favicon.svg and public/apple-touch-icon.png (${touch.length} bytes)`);
