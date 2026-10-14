// Spike analysis: stitch tiles into the eval region and compare each against ref-s1, with ref-s2 as the noise floor.
//   npx tsx tools/mcpm-workbench/spike/analyzeTiling.ts <outDir> <catalog.bin>
import { existsSync, readFileSync } from 'node:fs';
import { decodeGalaxyCatalog } from '../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { traceHistogram } from '../validate/traceHistogram';
import { totalVariation } from '../validate/totalVariation';
import { axisMarginals } from '../validate/axisMarginals';
import { dataPointHistogram } from '../validate/dataPointHistogram';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const [outDir, catPath] = process.argv.slice(2);
const N = 128, T = 64, V = 0.78125, BINS = 256;
const eOrigin: Vec3 = [-200 - 100 + 64 * V, -50 - 100 + 64 * V, 125 - 100 + 64 * V];
const load = (n: string) => { const b = readFileSync(`${outDir}/${n}.f32`); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };

function stitch(prefix: string): Float32Array | null {
  const out = new Float32Array(N * N * N);
  for (let t = 0; t < 8; t++) {
    if (!existsSync(`${outDir}/${prefix}-t${t}.f32`)) return null;
    const tile = load(`${prefix}-t${t}`);
    const ox = T * (t & 1), oy = T * ((t >> 1) & 1), oz = T * ((t >> 2) & 1);
    for (let z = 0; z < T; z++) for (let y = 0; y < T; y++)
      out.set(tile.subarray((z * T + y) * T, (z * T + y) * T + T), ((z + oz) * N + (y + oy)) * N + ox);
  }
  return out;
}

const buf = readFileSync(catPath!);
const cat = decodeGalaxyCatalog(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const ref = load('ref-s1');
const maxLog = Math.log1p(Math.max(...[ref].map((a) => a.reduce((m, v) => Math.max(m, v), 0)))) * 1.05;
const dims: Vec3 = [N, N, N];

// distance of each voxel to the nearest tile face (0 = on a face), the seam-contamination axis
const faceDist = (i: number) => Math.min(i % T, T - 1 - (i % T));
function stats(a: Float32Array) {
  const tv = totalVariation(traceHistogram(a, BINS, maxLog), traceHistogram(ref, BINS, maxLog));
  const dpA = dataPointHistogram({ values: a, dims, originMpc: eOrigin, voxelSizeMpc: [V, V, V], pointsMpc: cat.positions, pointCount: cat.count, binCount: BINS, maxLogTrace: maxLog });
  const dpR = dataPointHistogram({ values: ref, dims, originMpc: eOrigin, voxelSizeMpc: [V, V, V], pointsMpc: cat.positions, pointCount: cat.count, binCount: BINS, maxLogTrace: maxLog });
  const ma = axisMarginals(a, dims), mr = axisMarginals(ref, dims);
  const marg = ([0, 1, 2] as const).map((k) => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(ma[k][i]! / mr[k][i]! - 1)); return m; });
  let sa = 0, sr = 0, saa = 0, srr = 0, sar = 0;
  const prof = new Float64Array(T / 2 * 2), cnt = new Float64Array(T / 2);
  let massA = 0, massR = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (z * N + y) * N + x;
    const la = Math.log1p(a[k]!), lr = Math.log1p(ref[k]!);
    sa += la; sr += lr; saa += la * la; srr += lr * lr; sar += la * lr; massA += a[k]!; massR += ref[k]!;
    const d = Math.min(faceDist(x), faceDist(y), faceDist(z));
    prof[2 * d] += la; prof[2 * d + 1] += lr; cnt[d] += 1;
  }
  const n = N ** 3;
  const corr = (sar / n - (sa / n) * (sr / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (srr / n - (sr / n) ** 2));
  const seam = [0, 1, 2, 4, 8, 16, 32].map((d) => ((prof[2 * d]! / prof[2 * d + 1]!) - 1) * 100);
  return { tv, dpTV: totalVariation(dpA.histogram, dpR.histogram), meanAtPts: dpA.meanLogTrace, refAtPts: dpR.meanLogTrace, marg, corr, mass: massA / massR, seam };
}

const rows: [string, Float32Array | null][] = [
  ['ref-s2 (floor)', existsSync(`${outDir}/ref-s2.f32`) ? load('ref-s2') : null],
  ['tiles m=8 vox (6.25 Mpc)', stitch('tile-m8')],
  ['tiles m=16 vox (12.5 Mpc)', stitch('tile-m16')],
  ['tiles m=32 vox (25 Mpc)', stitch('tile-m32')],
  ['tiles m=16, naive norm', stitch('tile-m16-naive')],
];
const f = (v: number, d = 4) => v.toFixed(d);
console.log('run | logHist TV | dataPt TV | meanLogTrace@pts rel | marg max (x,y,z) | voxel corr(log) | mass ratio | seam bias % at face dist 0,1,2,4,8,16,32');
for (const [name, a] of rows) {
  if (!a) { console.log(`${name} | (missing)`); continue; }
  const s = stats(a);
  console.log(`${name} | ${f(s.tv)} | ${f(s.dpTV)} | ${f((s.meanAtPts / s.refAtPts - 1) * 100, 3)}% | ${s.marg.map((m) => f(m, 3)).join(', ')} | ${f(s.corr)} | ${f(s.mass, 4)} | ${s.seam.map((v) => f(v, 2)).join(' ')}`);
}
