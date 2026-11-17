/**
 * Build the press kit the About page offers: `public/data/site/skymap-press-kit.zip` (gitignored; it ships to
 * R2, see docs/DEPLOY.md "Site media") and `packages/website/src/data/pressKit.json`, its name and size for the
 * page (committed). The pictures come from the shot masters (`data/shots/site/`), the film from the owner's
 * hero recording, which lives only in the main checkout: a worktree run passes its absolute path.
 *
 *   npm run site:press-kit -- [--recording path/to/recording.mp4]
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import { PRESS_PICTURES } from '../../packages/website/src/data/pressPictures';
import { siteShot } from '../../packages/website/src/data/siteShot';
import { skymapIcon } from '../../packages/website/src/utils/skymapIcon';
import { PRESS_KIT } from './pressKitPlan';
import { SITE_SHOTS_DIR } from './SITE_SHOTS_DIR';
import { pressCredits } from './utils/pressCredits';
import { pressFactSheet } from './utils/pressFactSheet';
import { pressPicturePath } from './utils/pressPicturePath';
import { shotFileIndex } from './utils/shotFileIndex';
import { scrubVideoArgs } from './utils/scrubVideoArgs';
import { wordmarkSvg } from './utils/wordmarkSvg';

const OUT_DIR = 'public/data/site';
const SIZE_FILE = 'packages/website/src/data/pressKit.json';
const MASTERS = 'data/shots/site';
const FONT = 'tools/site/fonts/CormorantGaramond-SemiBold.ttf';
const GROUNDS = { light: '#000000', dark: '#ffffff' } as const;

const { values } = parseArgs({
  options: {
    recording: {
      type: 'string',
      default: 'recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4',
    },
  },
});
if (!existsSync(values.recording)) {
  console.error(
    `Recording not found: ${values.recording}\nPass --recording <absolute path> from a worktree.`,
  );
  process.exit(1);
}

const kit = mkdtempSync(join(tmpdir(), 'skymap-press-kit-'));
const put = (path: string, data: string | Buffer) => {
  mkdirSync(dirname(join(kit, path)), { recursive: true });
  writeFileSync(join(kit, path), data);
};
const jpeg = { quality: PRESS_KIT.jpegQuality, chromaSubsampling: '4:4:4', mozjpeg: true } as const;

try {
  const font = readFileSync(FONT);
  for (const [name, ink] of Object.entries(PRESS_KIT.inks) as [
    keyof typeof GROUNDS,
    (typeof PRESS_KIT.inks)['light'],
  ][]) {
    const svg = wordmarkSvg(font, ink);
    put(`logo/skymap-wordmark-${name}.svg`, svg);
    // Rasterised well above the target width, then brought down, so the trail's thin stroke stays smooth.
    const png = await sharp(Buffer.from(svg), { density: 600 })
      .resize({ width: PRESS_KIT.logoWidth })
      .png()
      .toBuffer();
    put(`logo/skymap-wordmark-${name}.png`, png);
    const margin = Math.round(PRESS_KIT.logoWidth * 0.15);
    put(
      `logo/skymap-wordmark-${name}-on-${name === 'light' ? 'black' : 'white'}.png`,
      await sharp(png)
        .extend({
          top: margin,
          bottom: margin,
          left: margin,
          right: margin,
          background: GROUNDS[name],
        })
        .flatten({ background: GROUNDS[name] })
        .png()
        .toBuffer(),
    );
  }

  // The app icon as macOS draws it, on Apple's 1024 grid with its shadow.
  const icon = Buffer.from(skymapIcon('mac', 'large'));
  put('icon/skymap-icon.svg', icon);
  for (const size of PRESS_KIT.iconSizes) {
    put(
      `icon/skymap-icon-${size}.png`,
      await sharp(icon, { density: (72 * size) / 1024 })
        .resize(size, size)
        .png()
        .toBuffer(),
    );
  }

  const shots = shotFileIndex(readdirSync(SITE_SHOTS_DIR));
  for (const row of PRESS_PICTURES) {
    // The master is the shot at twice its size; without it, the widest file the site holds.
    const master = join(MASTERS, `${row.shot}.png`);
    const source = existsSync(master)
      ? master
      : join(SITE_SHOTS_DIR, shots[`${row.shot}-${siteShot(row.shot).widths[0]}.webp`]!);
    put(
      pressPicturePath(row),
      await sharp(source).flatten({ background: '#000000' }).jpeg(jpeg).toBuffer(),
    );
  }

  put(PRESS_KIT.portraitFile, await sharp(PRESS_KIT.portrait).jpeg(jpeg).toBuffer());

  mkdirSync(join(kit, dirname(PRESS_KIT.filmFile)), { recursive: true });
  execFileSync('ffmpeg', [
    '-v',
    'error',
    ...scrubVideoArgs(PRESS_KIT.film, values.recording, join(kit, PRESS_KIT.filmFile)),
  ]);

  put('fact-sheet.md', pressFactSheet(PRESS_KIT));
  put('credits.txt', pressCredits(PRESS_PICTURES, PRESS_KIT));

  // zip adds to an archive that exists, so the old one goes first.
  const zip = join(process.cwd(), OUT_DIR, PRESS_KIT.file);
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: kit });

  const bytes = statSync(zip).size;
  writeFileSync(SIZE_FILE, `${JSON.stringify({ file: PRESS_KIT.file, bytes }, null, 2)}\n`);
  for (const path of readdirSync(kit, { recursive: true, encoding: 'utf8' }).sort()) {
    const full = join(kit, path);
    if (statSync(full).isFile())
      console.log(
        `${String(Math.round(statSync(full).size / 1024)).padStart(7)} KB  ${relative(kit, full)}`,
      );
  }
  console.log(
    `${(bytes / 1e6).toFixed(1)} MB  ${relative(process.cwd(), zip)}; size written to ${SIZE_FILE}`,
  );
} finally {
  rmSync(kit, { recursive: true, force: true });
}
