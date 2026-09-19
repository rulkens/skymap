#!/usr/bin/env node
/**
 * buildLocalBubbleShell — bake O'Neill+2024's Local Bubble shell table into
 * the runtime `.shell` mesh (`public/data/local-bubble/v1/local-bubble.shell`),
 * plus preview PNGs of the intermediate radius map.
 *
 * The source table is a STAR-SHAPED surface (one radius per sky direction,
 * Sun at the origin), stored in its own GALACTIC frame; rotating to skymap's
 * draw frame at render time (`FRAME_TO_WORLD.galactic`) is the renderer's
 * job, not the bake's, so a frame bug stays visible as a rotation rather than
 * baked into the bytes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import type { ShellMesh } from '../../src/@types/data/shellMesh/ShellMesh';
import type { ShellMeshDtype } from '../../src/@types/data/shellMesh/ShellMeshDtype';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { encodeShellMesh } from '../../src/data/shellMesh/shellMeshFormat';
import { f32ToF16Bits } from '../../src/utils/math/f32ToF16Bits';
import type { FitsColumn } from '../parsers/@types/FitsColumn';
import { parseFitsBinTable } from '../parsers/parseFitsBinTable';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { icosphere } from '../utils/geo/icosphere';
import { meanDirectionOfLargest } from '../utils/geo/meanDirectionOfLargest';
import { radiusAtDirection } from '../utils/geo/radiusAtDirection';
import { refineMeshByEdgeLength } from '../utils/geo/refineMeshByEdgeLength';
import { resampleSkyToEquirect } from '../utils/geo/resampleSkyToEquirect';
import { smoothEquirectSphere } from '../utils/geo/smoothEquirectSphere';
import { vertexNormals } from '../utils/geo/vertexNormals';

/** Output grid. 0.35°/px at the equator — a shade coarser than the table's own 13.7′ pixels. */
const WIDTH_PX = 1024;
const HEIGHT_PX = 512;

/** The columns the bake reads, in the order they land in the output planes. */
const CHANNELS = ['d', 'd_inner', 'd_outer', 'thick'] as const;

/**
 * Angular smoothing radius, degrees. The raw fit jumps between candidate dust
 * walls along adjacent sight lines; displaced unsmoothed it renders as radial
 * spikes, not a membrane (data/localBubble/previews/local-bubble-preview-*.png). Override
 * with --smooth-deg to re-tune against the preview.
 */
const DEFAULT_SMOOTH_DEG = 2.5;

const OUT_DIR = 'data/localBubble';
const PREVIEW_DIR = 'data/localBubble/previews';
const SHELL_OUT_PATH = 'public/data/local-bubble/v1/local-bubble.shell';

/** Uniform base before adaptive refinement — enough that the first pass sees sane shapes. */
const BASE_SUBDIV = 2;
/**
 * Adaptive target for a displaced edge, pc. The chimney and the steep slopes are
 * what drive this: at a uniform subdivision the same mesh runs 7.6 pc at the
 * median and 148 pc at the tail, and matching that tail uniformly would cost
 * ~21M triangles.
 */
const TARGET_EDGE_PC = 4;
const MAX_REFINE_PASSES = 8;
/** ~570k triangles are needed to hit TARGET_EDGE_PC; headroom above that, not a tight fit. */
const MAX_FACES = 800_000;

/** Chimney assertion: the source table names no frame, so this pins it at the bake. */
const CHIMNEY_FRACTION = 0.05;
const CHIMNEY_MAX_DEG = 30;
const GALACTIC_NORTH: Vec3 = [0, 0, 1];

function readColumn(
  view: DataView,
  dataOffset: number,
  rowLengthBytes: number,
  rowCount: number,
  column: FitsColumn,
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

/** Fills non-finite texels in place with the mean of the finite ones, so a meshed sight line never NaNs a vertex. */
function healNonFinite(plane: Float32Array): number {
  let sum = 0;
  let finiteCount = 0;
  for (const v of plane) {
    if (Number.isFinite(v)) {
      sum += v;
      finiteCount++;
    }
  }
  const mean = finiteCount > 0 ? sum / finiteCount : 0;
  let filled = 0;
  for (let i = 0; i < plane.length; i++) {
    if (!Number.isFinite(plane[i]!)) {
      plane[i] = mean;
      filled++;
    }
  }
  return filled;
}

function longestEdge(
  positions: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
): number {
  let worst = 0;
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const wp = positions[p!]!;
      const wq = positions[q!]!;
      worst = Math.max(worst, Math.hypot(wp[0] - wq[0], wp[1] - wq[1], wp[2] - wq[2]));
    }
  }
  return worst;
}

function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const cosAngle = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/** Packs positions/normals (pc, w=1/w=0 respectively) into the `.shell` dtype's flat component arrays. */
function packShellMesh(
  positions: readonly Vec3[],
  normals: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
  dtype: ShellMeshDtype,
): ShellMesh {
  const vertexCount = positions.length;
  const componentCount = vertexCount * 4;
  const positionsFlat =
    dtype === 'f16' ? new Uint16Array(componentCount) : new Float32Array(componentCount);
  const normalsFlat =
    dtype === 'f16' ? new Uint16Array(componentCount) : new Float32Array(componentCount);
  const pack = dtype === 'f16' ? f32ToF16Bits : (v: number): number => v;
  for (let i = 0; i < vertexCount; i++) {
    const p = positions[i]!;
    const n = normals[i]!;
    positionsFlat[i * 4 + 0] = pack(p[0]);
    positionsFlat[i * 4 + 1] = pack(p[1]);
    positionsFlat[i * 4 + 2] = pack(p[2]);
    positionsFlat[i * 4 + 3] = pack(1);
    normalsFlat[i * 4 + 0] = pack(n[0]);
    normalsFlat[i * 4 + 1] = pack(n[1]);
    normalsFlat[i * 4 + 2] = pack(n[2]);
    normalsFlat[i * 4 + 3] = pack(0);
  }
  const indices = new Uint32Array(faces.length * 3);
  faces.forEach(([a, b, c], i) => {
    indices[i * 3 + 0] = a;
    indices[i * 3 + 1] = b;
    indices[i * 3 + 2] = c;
  });
  return {
    dtype,
    frame: 'galactic',
    centrePc: [0, 0, 0],
    vertexCount,
    positions: positionsFlat as ShellMesh['positions'],
    normals: normalsFlat as ShellMesh['normals'],
    indices,
  };
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
  const need = (name: string): FitsColumn => {
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

  // Planes back to back, f32 little-endian, no header yet: this intermediate
  // radius map only ever feeds the mesher below and the preview PNGs; it is
  // not a runtime asset, so it carries no format of its own.
  const bytes = Buffer.alloc(planes.length * planes[0]!.byteLength);
  planes.forEach((plane, i) => Buffer.from(plane.buffer).copy(bytes, i * plane.byteLength));
  mkdirSync(OUT_DIR, { recursive: true });
  const binPath = join(OUT_DIR, 'local-bubble-shell.f32');
  writeFileSync(binPath, bytes);
  console.log(`wrote ${binPath} (${(bytes.length / 1e6).toFixed(2)} MB)`);

  console.log('previews:');
  await writePreview(planes[0]!, 'd_peak', join(PREVIEW_DIR, 'local-bubble-radius.png'));
  await writePreview(planes[3]!, 'thick', join(PREVIEW_DIR, 'local-bubble-thickness.png'));

  console.log('meshing displaced icosphere...');
  const radiusPlane = planes[0]!;
  const healed = healNonFinite(radiusPlane);
  if (healed > 0) console.log(`  healed ${healed} non-finite radius texels with the plane mean`);

  const radiusOf = (dir: Vec3): number => radiusAtDirection(radiusPlane, WIDTH_PX, HEIGHT_PX, dir);
  const base = icosphere(BASE_SUBDIV);
  const refined = refineMeshByEdgeLength(
    base.directions,
    base.faces,
    radiusOf,
    TARGET_EDGE_PC,
    MAX_REFINE_PASSES,
    MAX_FACES,
  );
  const radii = refined.directions.map(radiusOf);
  const positions: Vec3[] = refined.directions.map((d, i) => {
    const r = radii[i]!;
    return [d[0] * r, d[1] * r, d[2] * r];
  });
  const normals = vertexNormals(positions, refined.faces);
  console.log(
    `  ${base.faces.length} base faces → ${refined.faces.length} after adaptive refinement (target ${TARGET_EDGE_PC} pc, cap ${MAX_FACES})`,
  );
  console.log(`  longest displaced edge: ${longestEdge(positions, refined.faces).toFixed(2)} pc`);

  const chimneyDir = meanDirectionOfLargest(refined.directions, radii, CHIMNEY_FRACTION);
  const chimneyAngleDeg = angleBetweenDeg(chimneyDir, GALACTIC_NORTH);
  console.log(
    `  chimney direction: ${chimneyAngleDeg.toFixed(1)}° from galactic north (must be ≤ ${CHIMNEY_MAX_DEG}°)`,
  );
  if (chimneyAngleDeg > CHIMNEY_MAX_DEG) {
    throw new Error(
      `buildLocalBubbleShell: chimney assertion failed — the mean direction of the outermost ` +
        `${(CHIMNEY_FRACTION * 100).toFixed(0)}% of radii is ${chimneyAngleDeg.toFixed(1)}° from galactic ` +
        `north (must be ≤ ${CHIMNEY_MAX_DEG}°); the source table may not be in the galactic frame this bake assumes`,
    );
  }

  const dtypeArg = process.argv.indexOf('--dtype');
  const dtype: ShellMeshDtype =
    dtypeArg >= 0 && process.argv[dtypeArg + 1] === 'f32' ? 'f32' : 'f16';
  const shellMesh = packShellMesh(positions, normals, refined.faces, dtype);
  const shellBuf = encodeShellMesh(shellMesh);
  mkdirSync(dirname(SHELL_OUT_PATH), { recursive: true });
  writeFileSync(SHELL_OUT_PATH, Buffer.from(shellBuf));
  console.log(
    `wrote ${SHELL_OUT_PATH} (${(shellBuf.byteLength / 1e6).toFixed(2)} MB, ${dtype}, ` +
      `${positions.length} vertices, ${refined.faces.length} faces)`,
  );
}

await main();
