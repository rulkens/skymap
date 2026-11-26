/**
 * buildBlueNoiseMask — bakes `public/lut/blueNoise.bin`, the r8 jitter mask the density march
 * reads its start offset from: BLUE_NOISE_MASK_SLICES slices of BLUE_NOISE_MASK_SIZE², stacked.
 *
 * Committed to git and rebuilt by hand via `npm run build-blue-noise-mask`; seeded, so a rebuild
 * writes identical bytes. No JSON sidecar: the dimensions are the constants. We build our own
 * rather than ship NVIDIA's STBN masks because neither of their licences (NVIDIA Source Code
 * License, RTX SDKs License) allows bundling them in skymap.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLUE_NOISE_MASK_SIZE, BLUE_NOISE_MASK_SLICES } from '../../src/data/volume/blueNoiseMask';
import { blueNoiseMask } from './blueNoiseMask';

const SEED = 1;
const OUTPUT_DIR = 'public/lut';

function main(): void {
  const bytes = blueNoiseMask(BLUE_NOISE_MASK_SIZE, BLUE_NOISE_MASK_SLICES, SEED);
  const dir = resolve(OUTPUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'blueNoise.bin'), bytes);
  process.stderr.write(
    `wrote ${BLUE_NOISE_MASK_SIZE}x${BLUE_NOISE_MASK_SIZE}x${BLUE_NOISE_MASK_SLICES} blue-noise mask (${bytes.byteLength} bytes)\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
