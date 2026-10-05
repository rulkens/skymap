/**
 * Cut the website's hero media from the owner's Earth-to-universe recording:
 * the scrub video into `public/data/site/` (gitignored, never committed; it
 * ships to R2, see docs/DEPLOY.md "Site media") and the poster and section
 * stills into `packages/website/src/assets/` (committed, so the page is
 * complete without the video).
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

import { HERO_MEDIA } from './heroMediaPlan';
import { scrubVideoArgs } from './utils/scrubVideoArgs';
import { stillFrameArgs } from './utils/stillFrameArgs';

const DEFAULT_RECORDING = 'recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4';
const VIDEO_DIR = 'public/data/site';
const STILLS_DIR = 'packages/website/src/assets';

const input = process.argv[2] ?? DEFAULT_RECORDING;
if (!existsSync(input)) {
  console.error(`Recording not found: ${input}\nPass the path as the first argument.`);
  process.exit(1);
}

mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(STILLS_DIR, { recursive: true });

const scratch = mkdtempSync(join(tmpdir(), 'skymap-hero-'));
try {
  for (const still of HERO_MEDIA.stills) {
    const png = join(scratch, `${still.file}.png`);
    execFileSync('ffmpeg', ['-v', 'error', ...stillFrameArgs(still, input, png)]);
    await sharp(png).webp({ quality: 92, effort: 6 }).toFile(join(STILLS_DIR, still.file));
    console.log(`still  ${still.file}`);
  }

  const video = join(VIDEO_DIR, HERO_MEDIA.videoFile);
  execFileSync('ffmpeg', ['-v', 'error', ...scrubVideoArgs(HERO_MEDIA, input, video)], {
    stdio: 'inherit',
  });
  const mb = (statSync(video).size / 1024 / 1024).toFixed(1);
  console.log(`video  ${video}  ${mb} MB`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
