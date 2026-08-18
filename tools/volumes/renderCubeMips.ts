/**
 * renderCubeMips.ts — offline eyeball check for a scalar cube: writes a
 * max-intensity projection PNG per axis + prints a value-distribution line.
 * Catches a broken cube (speckle noise, scrambled strides, empty field) in
 * seconds, before an .scfd import or a viewer session.
 *
 * Usage:
 *   npx tsx tools/volumes/renderCubeMips.ts <cube.npy|cube.scfd> [--out-dir <dir>]
 *
 * PNGs land in --out-dir (default cwd) as <stem>.mip{0,1,2}.png.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { PNG } from 'pngjs';
import { decodeScalarField } from '../../src/data/volume/scalarFieldFormat';
import { readNpy } from '../parsers/npyReader';
import { f16BitsToFloat } from '../utils/math/f16BitsToFloat';

// Both sources reduce to values + a C-order shape (last axis fastest).  An
// .scfd payload is x-fastest, so its C-order shape is dims reversed — the
// projections then match the ones a same-source .npy produces, axis for axis.
type Loaded = { values: Float32Array; shape: [number, number, number] };

function loadCube(path: string): Loaded {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (extname(path) === '.scfd') {
    const cube = decodeScalarField(ab);
    if (cube.channels !== 1) {
      throw new Error(`renderCubeMips: ${cube.channels}-channel cube — MIPs assume 1 scalar`);
    }
    const values = new Float32Array(cube.voxels.length);
    for (let i = 0; i < cube.voxels.length; i++) values[i] = f16BitsToFloat(cube.voxels[i]!);
    return { values, shape: [cube.dims[2], cube.dims[1], cube.dims[0]] };
  }
  const npy = readNpy(ab);
  if (npy.shape.length !== 3) {
    throw new Error(`renderCubeMips: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  const shape: [number, number, number] = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];
  const raw = npy.values;
  const values = new Float32Array(shape[0] * shape[1] * shape[2]);
  if (raw instanceof Uint16Array) {
    for (let i = 0; i < raw.length; i++) values[i] = f16BitsToFloat(raw[i]!);
  } else {
    values.set(raw);
  }
  // Raw trace densities span decades; the same log1p ratio the importer's
  // packLogTraceVoxels applies puts the PNGs (and the deadband line below)
  // in the units the shader will actually see.
  let max = 0;
  for (let i = 0; i < values.length; i++) if (values[i]! > max) max = values[i]!;
  const denom = Math.log1p(max);
  if (denom > 0) {
    for (let i = 0; i < values.length; i++) values[i] = Math.log1p(values[i]!) / denom;
  }
  return { values, shape };
}

function writeMip(mip: Float32Array, width: number, height: number, outPath: string): void {
  const png = new PNG({ width, height });
  for (let i = 0; i < mip.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, mip[i]!)) * 255);
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`  wrote ${outPath} (${width}x${height})`);
}

function main(): void {
  const args = process.argv.slice(2);
  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1]! : '.';
  const input = args.find((a) => !a.startsWith('--') && a !== outDir);
  if (!input) {
    console.error(
      'usage: tsx tools/volumes/renderCubeMips.ts <cube.npy|cube.scfd> [--out-dir <dir>]',
    );
    process.exit(1);
  }

  const { values, shape } = loadCube(input);
  const [d0, d1, d2] = shape;

  // One pass fills all three projections; flat index walks C-order.
  const mip0 = new Float32Array(d1 * d2);
  const mip1 = new Float32Array(d0 * d2);
  const mip2 = new Float32Array(d0 * d1);
  let idx = 0;
  for (let i0 = 0; i0 < d0; i0++) {
    for (let i1 = 0; i1 < d1; i1++) {
      for (let i2 = 0; i2 < d2; i2++) {
        const v = values[idx++]!;
        const j0 = i1 * d2 + i2;
        const j1 = i0 * d2 + i2;
        const j2 = i0 * d1 + i1;
        if (v > mip0[j0]!) mip0[j0] = v;
        if (v > mip1[j1]!) mip1[j1] = v;
        if (v > mip2[j2]!) mip2[j2] = v;
      }
    }
  }

  // Distribution line.  Percentiles come from a stride sample of the nonzero
  // values (exact sort of ~50M floats is seconds of wall clock for no
  // diagnostic gain).  0.41 ≈ the MCPM registry's visibility deadband
  // (contrast 1.7 / trim 0.3 → applyContrastWindow's smoothstep edge); voxels
  // below it are invisible in the viewer no matter the gain sliders.
  let zeros = 0;
  let above = 0;
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(values.length / 2_000_000));
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v === 0) zeros++;
    else if (i % stride === 0) sample.push(v);
    if (v > 0.41) above++;
  }
  sample.sort((a, b) => a - b);
  const pct = (q: number): number =>
    sample[Math.min(sample.length - 1, Math.floor(q * sample.length))] ?? 0;
  console.log(
    `${basename(input)}: dims=${d2}x${d1}x${d0} (x-fastest)  zero=${((100 * zeros) / values.length).toFixed(1)}%  ` +
      `nonzero p50/p90/p99=${pct(0.5).toFixed(3)}/${pct(0.9).toFixed(3)}/${pct(0.99).toFixed(3)}  ` +
      `above-deadband(0.41)=${((100 * above) / values.length).toFixed(2)}%`,
  );

  const stem = basename(input, extname(input));
  writeMip(mip0, d2, d1, join(outDir, `${stem}.mip0.png`));
  writeMip(mip1, d2, d0, join(outDir, `${stem}.mip1.png`));
  writeMip(mip2, d1, d0, join(outDir, `${stem}.mip2.png`));
}

main();
