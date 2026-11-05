/**
 * Subset the site's display face. The app's copy of Cormorant Garamond is the
 * whole font (37.6 KB); the site sets a few dozen words in it, so it ships
 * only the characters in `DISPLAY_FONT_UNICODES` (about 16 KB), as a hashed
 * asset the long-cache rule covers. Needs `pyftsubset` (pip install fonttools brotli).
 *
 *   npx tsx tools/site/subsetDisplayFont.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import { DISPLAY_FONT_UNICODES } from '../../packages/website/src/data/displayFontUnicodes';

const SOURCE = 'tools/site/fonts/CormorantGaramond-SemiBold.ttf';
const OUTPUT = 'packages/website/src/assets/fonts/cormorant-garamond-600-site.woff2';

mkdirSync(dirname(OUTPUT), { recursive: true });
execFileSync(
  'pyftsubset',
  [
    SOURCE,
    `--unicodes=${DISPLAY_FONT_UNICODES}`,
    '--flavor=woff2',
    '--layout-features=kern,liga,clig,calt,locl',
    `--output-file=${OUTPUT}`,
  ],
  { stdio: 'inherit' },
);
console.log(`${OUTPUT}  ${statSync(OUTPUT).size} B`);
