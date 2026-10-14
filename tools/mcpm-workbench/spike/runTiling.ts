// Spike driver: whole-box reference vs 2x2x2 tiles with margins, all on SwiftShader.
//   npx tsx tools/mcpm-workbench/spike/runTiling.ts <catalog.bin> <outDir> <steps> [runName...]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeGalaxyCatalog } from '../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { deriveAgentWeights } from '../src/field/deriveAgentWeights';
import type { GridBox } from '../@types/GridBox';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const [catPath, outDir, stepsArg, ...only] = process.argv.slice(2);
const STEPS = Number(stepsArg);
const V = 0.78125; // ~VAC voxel (556.288 Mpc / 712)
const CENTER: Vec3 = [-200, -50, 125];
const REF_DIMS = 256; // 200 Mpc
const E_LO = 64, TILE = 64; // eval region = voxels [64, 192) of the reference, 2x2x2 tiles of 64 (50 Mpc)
const AGENT_DENSITY = 10_000_000 / (712 * 1200 * 728); // VAC agents per voxel
const VAC_MEAN_WEIGHT = 1e6 / 324_901; // VAC per-galaxy deposit scale
const origin: Vec3 = [CENTER[0] - (REF_DIMS * V) / 2, CENTER[1] - (REF_DIMS * V) / 2, CENTER[2] - (REF_DIMS * V) / 2];

const buf = readFileSync(catPath!);
const cat = decodeGalaxyCatalog(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const w = deriveAgentWeights(cat.log10StellarMass, 'stellarMass').weights; // mean-1 x 1e6/n
const meanW = 1e6 / cat.count;

function boxFor(lo: Vec3, dims: Vec3): GridBox {
  const size: Vec3 = [dims[0] * V, dims[1] * V, dims[2] * V];
  const o: Vec3 = [origin[0] + lo[0] * V, origin[1] + lo[1] * V, origin[2] + lo[2] * V];
  return { centerMpc: [o[0] + size[0] / 2, o[1] + size[1] / 2, o[2] + size[2] / 2], sizeMpc: size, dims, voxelSizeMpc: V, rotation: [0, 0, 0, 1] };
}
function cull(lo: Vec3, dims: Vec3, pinWeights: boolean) {
  const positions: number[] = [], weights: number[] = [];
  for (let k = 0; k < cat.count; k++) {
    let inside = true;
    for (let a = 0; a < 3; a++) {
      const vox = (cat.positions[3 * k + a]! - origin[a]!) / V - lo[a]!;
      if (vox < 0 || vox >= dims[a]!) inside = false;
    }
    if (!inside) continue;
    positions.push(cat.positions[3 * k]!, cat.positions[3 * k + 1]!, cat.positions[3 * k + 2]!);
    weights.push((w[k]! / meanW) * VAC_MEAN_WEIGHT); // per-galaxy weight on the VAC's scale
  }
  if (!pinWeights) { const s = weights.reduce((x, y) => x + y, 0); for (let k = 0; k < weights.length; k++) weights[k] = (weights[k]! * 1e6) / s; }
  return { positions, weights };
}

type Run = { name: string; lo: Vec3; dims: Vec3; seed: number; pinned: boolean; crop: { lo: Vec3; hi: Vec3 } };
const runs: Run[] = [];
const eCrop = { lo: [E_LO, E_LO, E_LO] as Vec3, hi: [E_LO + 2 * TILE, E_LO + 2 * TILE, E_LO + 2 * TILE] as Vec3 };
for (const seed of [1, 2]) runs.push({ name: `ref-s${seed}`, lo: [0, 0, 0], dims: [REF_DIMS, REF_DIMS, REF_DIMS], seed, pinned: true, crop: eCrop });
for (const [m, pinned] of [[8, true], [16, true], [32, true], [16, false]] as const)
  for (let t = 0; t < 8; t++) {
    const tl: Vec3 = [E_LO + TILE * (t & 1), E_LO + TILE * ((t >> 1) & 1), E_LO + TILE * ((t >> 2) & 1)];
    const d = TILE + 2 * m;
    runs.push({ name: `tile-m${m}${pinned ? '' : '-naive'}-t${t}`, lo: [tl[0] - m, tl[1] - m, tl[2] - m], dims: [d, d, d], seed: 100 + t, pinned, crop: { lo: [m, m, m], hi: [m + TILE, m + TILE, m + TILE] } });
  }

const server = await createServer({ configFile: resolve(import.meta.dirname, '../vite.config.ts'), server: { port: 5599, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
let chunks: Buffer[] = [];
let label = '';
await page.exposeFunction('sendChunk', (b64: string) => { chunks.push(Buffer.from(b64, 'base64')); });
await page.exposeFunction('progress', (s: number, sec: number) => { if (s % 100 === 0) console.log(`  ${label} step ${s} ${sec.toFixed(0)}s`); });
await page.goto(url + 'spike/tiling.html');
await page.waitForFunction(() => (window as any).ready === true, null, { timeout: 120_000 });

const ordered = only.length ? only.flatMap((o) => runs.filter((r) => r.name.startsWith(o + (o.startsWith('ref') ? '' : '-t')))) : runs;
for (const r of ordered) {
  const out = `${outDir}/${r.name}.f32`;
  if (existsSync(out)) continue;
  const { positions, weights } = cull(r.lo, r.dims, r.pinned);
  const voxels = r.dims[0] * r.dims[1] * r.dims[2];
  const agentCount = Math.round(AGENT_DENSITY * voxels);
  label = r.name; chunks = [];
  const t0 = Date.now();
  console.log(`${r.name}: dims ${r.dims.join('x')} galaxies ${weights.length} agents ${agentCount}`);
  await page.evaluate((cfg) => (window as any).runMcpm(cfg), {
    box: boxFor(r.lo, r.dims), positions, weights, agentCount, seed: r.seed, steps: STEPS,
    pinAgentsM: r.pinned ? 10 : null, crop: r.crop,
  });
  writeFileSync(out, Buffer.concat(chunks));
  appendFileSync(`${outDir}/log.txt`, `${r.name} ${((Date.now() - t0) / 1000).toFixed(0)}s galaxies=${weights.length} agents=${agentCount}\n`);
  console.log(`${r.name}: done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
await server.close();
