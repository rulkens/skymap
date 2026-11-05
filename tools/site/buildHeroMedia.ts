/**
 * Cut the website's hero media from the owner's Earth-to-universe recording:
 * one still per flight stop, landscape and portrait, into
 * `packages/website/src/assets/flight/` (committed: they are the flight at
 * every width) and the scrub video into `public/data/site/` (gitignored; it
 * ships to R2, see docs/DEPLOY.md "Site media").
 *
 *   npm run site:media -- [path/to/recording.mp4]
 *
 * `recordings/` is gitignored and lives only in the main checkout, so a
 * worktree run passes that checkout's absolute path.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { FLIGHT_STOPS } from '../../packages/website/src/data/flightStops';
import { HERO_MEDIA } from './heroMediaPlan';
import { portraitCrop } from './utils/portraitCrop';
import { scrubVideoArgs } from './utils/scrubVideoArgs';
import { stillFrameArgs } from './utils/stillFrameArgs';

const DEFAULT_RECORDING = 'recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4';
const VIDEO_DIR = 'public/data/site';
const STILLS_DIR = 'packages/website/src/assets/flight';
const BLACK = { r: 0, g: 0, b: 0 };

const input = process.argv[2] ?? DEFAULT_RECORDING;
if (!existsSync(input)) {
  console.error(`Recording not found: ${input}\nPass the path as the first argument.`);
  process.exit(1);
}

mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(STILLS_DIR, { recursive: true });

const avif = { quality: HERO_MEDIA.stillQuality, effort: 9 };
const tall = {
  width: HERO_MEDIA.stillPortraitWidth,
  height: Math.round((HERO_MEDIA.stillPortraitWidth * 16) / 9),
};
let stillBytes = 0;

const scratch = mkdtempSync(join(tmpdir(), 'skymap-hero-'));
try {
  for (const stop of FLIGHT_STOPS) {
    const png = join(scratch, `${stop.id}.png`);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      ...stillFrameArgs(HERO_MEDIA.inSec + stop.atSec, input, png),
    ]);
    const meta = await sharp(png).metadata();
    const crop = portraitCrop(meta, tall, stop.portraitX, stop.portraitZoom);

    const landscape = join(STILLS_DIR, `${stop.id}-landscape.avif`);
    await sharp(png).resize({ width: HERO_MEDIA.stillLandscapeWidth }).avif(avif).toFile(landscape);

    const portrait = join(STILLS_DIR, `${stop.id}-portrait.avif`);
    await sharp(png)
      .extract({ left: crop.left, top: 0, width: crop.width, height: crop.height })
      .resize({ width: tall.width, height: crop.scaledHeight, fit: 'fill' })
      .extend({ top: crop.padTop, bottom: crop.padBottom, background: BLACK })
      .avif(avif)
      .toFile(portrait);

    const sizes = [landscape, portrait].map((file) => statSync(file).size);
    stillBytes += sizes[0]! + sizes[1]!;
    console.log(`still  ${stop.id}  landscape ${sizes[0]} B  portrait ${sizes[1]} B`);
  }
  console.log(`stills ${stillBytes} B in ${STILLS_DIR}`);

  // The name is versioned and the published copy immutable, so an existing file is never re-cut.
  const video = join(VIDEO_DIR, HERO_MEDIA.videoFile);
  if (existsSync(video)) {
    console.log(`video  ${video} exists, kept (bump videoFile to re-cut)`);
  } else {
    execFileSync('ffmpeg', ['-v', 'error', ...scrubVideoArgs(HERO_MEDIA, input, video)], {
      stdio: 'inherit',
    });
    console.log(`video  ${video}  ${(statSync(video).size / 1024 / 1024).toFixed(1)} MB`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
