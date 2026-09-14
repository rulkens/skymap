/**
 * buildEnvBrdfLut — bakes `public/lut/envBrdf.{bin,json}`, the split-sum
 * environment BRDF the mesh-body shader samples at (NoV, roughness).
 *
 * Committed to git like the MSDF font atlases: 64 KB, deterministic, and
 * rebuilt by hand via `npm run build-env-brdf-lut` — it carries no catalog
 * data, so it never goes near the R2 manifest.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { f32ToF16Bits } from '../../src/utils/math/f32ToF16Bits';
import { envBrdfLut } from './envBrdfLut';

export type EnvBrdfLutMeta = {
  readonly width: number;
  readonly height: number;
  readonly format: 'rg16float';
  readonly samples: number;
};

const SIZE = 128;
const SAMPLE_COUNT = 1024;
const OUTPUT_DIR = 'public/lut';

function main(): void {
  const values = envBrdfLut(SIZE, SAMPLE_COUNT);
  const texels = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i += 1) texels[i] = f32ToF16Bits(values[i]!);

  const meta: EnvBrdfLutMeta = {
    width: SIZE,
    height: SIZE,
    format: 'rg16float',
    samples: SAMPLE_COUNT,
  };
  const dir = resolve(OUTPUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'envBrdf.bin'), Buffer.from(texels.buffer));
  writeFileSync(resolve(dir, 'envBrdf.json'), `${JSON.stringify(meta, null, 2)}\n`);
  process.stderr.write(`wrote ${SIZE}x${SIZE} env-BRDF LUT (${texels.byteLength} bytes)\n`);
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
