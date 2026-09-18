#!/usr/bin/env node
/**
 * buildLocalBubbleShell — bake O'Neill+2024's Local Bubble shell table into an
 * equirectangular radius map, plus preview PNGs to eyeball the surface with.
 *
 * The model is a STAR-SHAPED surface: one radius per sky direction, Sun at the
 * origin. That is why this is a 2D map and not a mesh — there is no topology to
 * import, only r(l, b). Stored in the source's own GALACTIC frame; rotating to
 * skymap's supergalactic draw frame is the renderer's job, not the bake's, so a
 * frame bug stays visible as a rotation rather than baked into the bytes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { parseFitsBinTable } from '../parsers/desiFits';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { resampleSkyToEquirect } from '../utils/geo/resampleSkyToEquirect';
import { smoothEquirectSphere } from '../utils/geo/smoothEquirectSphere';

/** Output grid. 0.35°/px at the equator — a shade coarser than the table's own 13.7′ pixels. */
const WIDTH_PX = 1024;
const HEIGHT_PX = 512;

/** The columns the bake reads, in the order they land in the output planes. */
const CHANNELS = ['d', 'd_inner', 'd_outer', 'thick'] as const;

/**
 * Angular smoothing radius, degrees. The raw fit jumps between candidate dust
 * walls along adjacent sight lines; displaced unsmoothed it renders as radial
 * spikes, not a membrane (docs/screenshots/local-bubble-preview-*.png). Override
 * with --smooth-deg to re-tune against the preview.
 */
const DEFAULT_SMOOTH_DEG = 2.5;

const OUT_DIR = 'public/data/local-bubble/v1';
const PREVIEW_DIR = 'docs/screenshots';

type Column = { readonly byteOffset: number; readonly form: string };

function readColumn(
  view: DataView,
  dataOffset: number,
  rowLengthBytes: number,
  rowCount: number,
  column: Column,
): Float64Array {
  if (column.form !== 'D') {
    throw new Error(`buildLocalBubbleShell: expected a float64 ('D') column, got '${column.form}'`);
  }
  const out = new Float64Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    // FITS is big-endian; getFloat64's default matches, so no byte swap.
    out[i] = view.getFloat64(dataOffset + i * rowLengthBytes + column.byteOffset);
  }
  return out;
}

function describe(name: string, values: Float64Array | Float32Array): string {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let bad = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) {
      bad++;
      continue;
    }
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const good = values.length - bad;
  return `${name.padEnd(8)} min=${min.toFixed(1)} max=${max.toFixed(1)} mean=${(sum / good).toFixed(1)} non-finite=${bad}`;
}

/** Grey preview, linearly stretched over the plane's own range — shape first, absolute scale second. */
async function writePreview(plane: Float32Array, label: string, outPath: string): Promise<void> {
  let min = Infinity;
  let max = -Infinity;
  for (const v of plane) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const grey = Buffer.alloc(plane.length);
  for (let i = 0; i < plane.length; i++) {
    const v = Number.isFinite(plane[i]!) ? plane[i]! : min;
    grey[i] = Math.round(((v - min) / span) * 255);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(grey, { raw: { width: WIDTH_PX, height: HEIGHT_PX, channels: 1 } })
    .png()
    .toFile(outPath);
  console.log(`  ${label}: ${outPath}  [${min.toFixed(1)} … ${max.toFixed(1)} pc]`);
}

async function main(): Promise<void> {
  const fitsPath = rawDataPath('localbubble.shell');
  console.log(`reading ${fitsPath}`);
  const buf = readFileSync(fitsPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const table = parseFitsBinTable(arrayBuffer);
  console.log(
    `  ${table.rowCount} rows × ${table.rowLengthBytes} B, ${table.columns.length} columns`,
  );

  const byName = new Map(table.columns.map((c) => [c.name, c]));
  const need = (name: string): Column => {
    const column = byName.get(name);
    if (!column) throw new Error(`buildLocalBubbleShell: table has no '${name}' column`);
    return column;
  };

  const view = new DataView(arrayBuffer);
  const read = (name: string): Float64Array =>
    readColumn(view, table.dataOffset, table.rowLengthBytes, table.rowCount, need(name));

  const l = read('l');
  const b = read('b');
  const channels = CHANNELS.map(read);

  console.log('source columns:');
  console.log(`  ${describe('l', l)}`);
  console.log(`  ${describe('b', b)}`);
  CHANNELS.forEach((name, i) => console.log(`  ${describe(name, channels[i]!)}`));

  console.log(`resampling → ${WIDTH_PX}×${HEIGHT_PX} equirect (galactic)`);
  const raw = resampleSkyToEquirect(l, b, channels, WIDTH_PX, HEIGHT_PX);

  const smoothArg = process.argv.indexOf('--smooth-deg');
  const smoothDeg = smoothArg >= 0 ? Number(process.argv[smoothArg + 1]) : DEFAULT_SMOOTH_DEG;
  const planes =
    smoothDeg > 0
      ? raw.map((plane) => smoothEquirectSphere(plane, WIDTH_PX, HEIGHT_PX, smoothDeg))
      : raw;
  console.log(`baked planes (smoothing ${smoothDeg}°):`);
  CHANNELS.forEach((name, i) => console.log(`  ${describe(name, planes[i]!)}`));

  // Planes back to back, f32 little-endian, no header yet: the runtime format
  // is the renderer PR's call, and inventing one here would be a guess to undo.
  const bytes = Buffer.alloc(planes.length * planes[0]!.byteLength);
  planes.forEach((plane, i) => Buffer.from(plane.buffer).copy(bytes, i * plane.byteLength));
  mkdirSync(OUT_DIR, { recursive: true });
  const binPath = join(OUT_DIR, 'local-bubble-shell.f32');
  writeFileSync(binPath, bytes);
  console.log(`wrote ${binPath} (${(bytes.length / 1e6).toFixed(2)} MB)`);

  console.log('previews:');
  await writePreview(planes[0]!, 'd_peak', join(PREVIEW_DIR, 'local-bubble-radius.png'));
  await writePreview(planes[3]!, 'thick', join(PREVIEW_DIR, 'local-bubble-thickness.png'));
}

await main();
