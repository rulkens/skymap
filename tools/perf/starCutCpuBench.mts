/**
 * starCutCpuBench — offline CPU timing for the star renderer's per-frame cut.
 *
 * The star renderer's per-frame CPU work is three stages, all pure typed-array
 * code with no GPU/DOM dependency, so they can be driven headless in Node against
 * the real `stars-large.bin`:
 *
 *   walk       — `walkStarOctreeCut` picks the octree cut (the dominant cost)
 *   partition  — the layer's fade advance + leaf/aggregate stream fill
 *   pack       — the renderer's per-node frustum cull + NodeParams pack
 *
 * This harness measures each stage and, crucially, A/Bs the WALK with the frustum
 * prune OFF vs ON — calling the SAME production `walkStarOctreeCut`, not a copy —
 * so the number it reports is the number the app ships. It complements the
 * browser GPU harness (`npm run perf`), which measures GPU pass time and cannot
 * see this CPU cost.
 *
 * ── Run ────────────────────────────────────────────────────────────────────
 *
 *   npx tsx tools/perf/starCutCpuBench.mts               # fetch bin from R2
 *   npx tsx tools/perf/starCutCpuBench.mts --bin path.gz # use a local bin
 *
 * With no `--bin`, the large-tier bin is fetched once from the public R2 host
 * (`VITE_DATA_BASE_URL`) into `tools/perf/.cache/` and reused on later runs.
 *
 * ── Interpretation ─────────────────────────────────────────────────────────
 *
 * Node on a dev box runs this ~1.5-2x faster than the browser at the same pose,
 * so treat the ABSOLUTE ms as a lower bound and the walk-off vs walk-on DELTA and
 * the cut-size shrink as the portable results. The prune's win scales with how
 * much of the octree is off-screen, which is pose-dependent — hence the sweep of
 * heliocentric distances below.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { mat4 } from 'wgpu-matrix';

import { decodeStarCatalog } from '../../src/data/starCatalog/starCatalogFormat';
import {
  walkStarOctreeCut,
  type StarCutFrustum,
  type StarCutSnapshot,
} from '../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';
import { starOctreeIndex } from '../../src/services/gpu/renderers/starCatalog/starOctreeIndex';
import { frustumPlanesFromViewProj } from '../../src/utils/camera/frustumPlanesFromViewProj';
import { sphereOutsideFrustum } from '../../src/utils/camera/sphereOutsideFrustum';
import {
  writeStarNodeParams,
  NODE_PARAMS_BYTES,
} from '../../src/services/gpu/renderers/starCatalog/starCatalogLayout';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import type { StarCatalog } from '../../src/@types/data/starCatalog/StarCatalog';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
// The Gaia row's shipped budget + default Detail knob (see data/sources/gaia-stars.ts).
const BUDGET = { typical: 1_500_000, hardCap: 2_500_000 };
const REFINE_THRESHOLD = 0.16;
const NODE_FADE_MS = 250;
const DEFAULT_STAR_SIZE_PX = 2.6;
const SIZE_PX = 2.6;
const GLOW_OVERLAP = 4.0;
const VIEWPORT_H = 1440;
const FOV_Y = (45 * Math.PI) / 180;

// ── Locate / fetch the bin ───────────────────────────────────────────────────
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadCatalog(): Promise<StarCatalog> {
  let binPath = argValue('--bin');
  if (binPath === undefined) {
    const base = 'https://skymap-data.rulkens.com';
    const cacheDir = new URL('./.cache/', import.meta.url);
    mkdirSync(cacheDir, { recursive: true });
    const cached = new URL('stars-large.bin.gz', cacheDir);
    binPath = cached.pathname;
    if (!existsSync(binPath)) {
      process.stdout.write(`fetching ${base}/data/stars-large.bin …\n`);
      const res = await fetch(`${base}/data/stars-large.bin`);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      writeFileSync(binPath, new Uint8Array(await res.arrayBuffer()));
    }
  }
  const raw = readFileSync(binPath);
  return decodeStarCatalog(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

// ── Frustum: looking back toward the origin (the dense field), eye at origin ──
// Camera-relative parsec planes, exactly the frame `walkStarOctreeCut` culls in.
function frustumFor(camPosPc: readonly [number, number, number]): StarCutFrustum {
  const dist = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]) || 1;
  const dir = [-camPosPc[0] / dist, -camPosPc[1] / dist, -camPosPc[2] / dist];
  const view = mat4.lookAt([0, 0, 0], dir, [0, 1, 0]);
  // Positions & near/far in parsecs ⇒ planes come out in parsec units directly.
  const proj = mat4.perspective(FOV_Y, 16 / 9, 1e-3, 1e7);
  const vp = mat4.multiply(proj, view) as Float32Array;
  const planesPc = Float64Array.from(frustumPlanesFromViewProj(vp));
  const sizeScale = SIZE_PX / DEFAULT_STAR_SIZE_PX;
  const radiansPerPx = FOV_Y / VIEWPORT_H;
  // Pick-covering leaf slack (3.5px floor) + aggregate glow spread — mirrors the
  // layer's buildCutFrustum, so the harness prunes exactly what the app prunes.
  const angularMarginRad = Math.max(1.5 * sizeScale, 3.5) * radiansPerPx;
  const worldSpread = Math.max(1, sizeScale * GLOW_OVERLAP);
  return { planesPc, angularMarginRad, worldSpread };
}

// ── Faithful replicas of the layer's partition + the renderer's pack ─────────
type Stream = {
  count: number;
  firstRecord: Uint32Array;
  recordCount: Uint32Array;
  originRelCamMpc: Float32Array;
  cellScaleMpc: Float32Array;
  isAggregate: Uint8Array;
  subtreeStarCount: Float32Array;
  opacity: Float32Array;
};
function makeStream(cap: number): Stream {
  return {
    count: 0,
    firstRecord: new Uint32Array(cap),
    recordCount: new Uint32Array(cap),
    originRelCamMpc: new Float32Array(cap * 3),
    cellScaleMpc: new Float32Array(cap),
    isAggregate: new Uint8Array(cap),
    subtreeStarCount: new Float32Array(cap),
    opacity: new Float32Array(cap),
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const catalog = await loadCatalog();
  const t1 = performance.now();
  const index = starOctreeIndex(catalog);
  const t2 = performance.now();
  const { boxOriginPc, boxEdgePc, firstRecord, recordCount, childMask, subtreeCounts } = index;
  const nodeCount = catalog.nodes.length;
  process.stdout.write(
    `decode ${(t1 - t0).toFixed(0)}ms, index ${(t2 - t1).toFixed(0)}ms, ` +
      `nodes=${nodeCount}, records=${catalog.records.length / 6}\n`,
  );

  // Persistent fade + stream scratch (mirrors the layer's per-catalog state).
  const opacity = new Float32Array(nodeCount);
  const inCutFrame = new Uint32Array(nodeCount);
  const activeFrame = new Uint32Array(nodeCount);
  let activeList = new Int32Array(nodeCount);
  let prevActiveList = new Int32Array(nodeCount);
  let prevActiveCount = 0;
  let clockMs: number | null = null;
  let frameNo = 0;
  const leaf = makeStream(1 << 16);
  const aggregate = makeStream(1 << 16);
  const nodeScratch = new DataView(new ArrayBuffer(1 << 21));
  const prefixScratch = new Uint32Array(1 << 19);
  const frustumScratch = new Float32Array(24);

  function partition(cut: StarCutSnapshot, camMpc: [number, number, number], nowMs: number): void {
    const dtMs = clockMs === null ? Infinity : Math.max(0, nowMs - clockMs);
    clockMs = nowMs;
    const step = Math.min(1, dtMs / NODE_FADE_MS);
    const frame = ++frameNo;
    leaf.count = 0;
    aggregate.count = 0;
    let activeCount = 0;
    const advance = (idx: number, target: number): void => {
      let op = opacity[idx]!;
      if (op < target) op = Math.min(target, op + step);
      else if (op > target) op = Math.max(target, op - step);
      opacity[idx] = op;
      if (target === 0 && op <= 0) return;
      activeFrame[idx] = frame;
      activeList[activeCount++] = idx;
      const isAgg = childMask[idx] !== 0;
      const s = isAgg ? aggregate : leaf;
      const o3 = idx * 3;
      const i = s.count;
      s.firstRecord[i] = firstRecord[idx]!;
      s.recordCount[i] = recordCount[idx]!;
      const o = i * 3;
      s.originRelCamMpc[o] = boxOriginPc[o3]! * PC_TO_MPC - camMpc[0];
      s.originRelCamMpc[o + 1] = boxOriginPc[o3 + 1]! * PC_TO_MPC - camMpc[1];
      s.originRelCamMpc[o + 2] = boxOriginPc[o3 + 2]! * PC_TO_MPC - camMpc[2];
      s.cellScaleMpc[i] = boxEdgePc[idx]! * PC_TO_MPC;
      s.isAggregate[i] = isAgg ? 1 : 0;
      s.subtreeStarCount[i] = isAgg ? subtreeCounts[idx]! : 1;
      s.opacity[i] = op;
      s.count = i + 1;
    };
    for (let i = 0; i < cut.count; i++) {
      const idx = cut.nodeIndex[i]!;
      inCutFrame[idx] = frame;
      if (activeFrame[idx] !== frame - 1) opacity[idx] = 0;
    }
    for (let i = 0; i < cut.count; i++) advance(cut.nodeIndex[i]!, 1);
    for (let j = 0; j < prevActiveCount; j++) {
      const idx = prevActiveList[j]!;
      if (inCutFrame[idx] !== frame) advance(idx, 0);
    }
    const tmp = prevActiveList;
    prevActiveList = activeList;
    activeList = tmp;
    prevActiveCount = activeCount;
  }

  function pack(s: Stream, planes: Float32Array, angularMarginRad: number): number {
    let totalInstances = 0;
    let survivors = 0;
    for (let i = 0; i < s.count; i++) {
      const o = i * 3;
      const ox = s.originRelCamMpc[o]!;
      const oy = s.originRelCamMpc[o + 1]!;
      const oz = s.originRelCamMpc[o + 2]!;
      const edge = s.cellScaleMpc[i]!;
      const cx = ox + edge * 0.5;
      const cy = oy + edge * 0.5;
      const cz = oz + edge * 0.5;
      const baseRadius = edge * 0.8660254;
      let cullRadius: number;
      if (s.isAggregate[i]! !== 0) {
        const spread = (SIZE_PX / DEFAULT_STAR_SIZE_PX) * GLOW_OVERLAP;
        cullRadius = baseRadius * (spread > 1 ? spread : 1);
      } else {
        cullRadius = baseRadius + Math.sqrt(cx * cx + cy * cy + cz * cz) * angularMarginRad;
      }
      if (sphereOutsideFrustum(planes, cx, cy, cz, cullRadius)) continue;
      writeStarNodeParams(
        nodeScratch,
        survivors * NODE_PARAMS_BYTES,
        ox,
        oy,
        oz,
        edge,
        s.firstRecord[i]!,
        s.opacity[i]!,
        s.isAggregate[i]!,
        s.subtreeStarCount[i]!,
      );
      prefixScratch[survivors] = totalInstances;
      totalInstances += s.recordCount[i]!;
      survivors++;
    }
    return survivors;
  }

  const poses = [
    { name: 'star-field  (89 pc)', distPc: 89.19 },
    { name: 'mid-bubble  (2 kpc)', distPc: 2000 },
    { name: 'milky-way   (11 kpc)', distPc: 11100 },
  ];

  process.stdout.write(
    `\npose                    walkOff  walkOn   partition  pack   TOTAL(on)   cutOff→cutOn\n`,
  );
  for (const pose of poses) {
    opacity.fill(0);
    inCutFrame.fill(0);
    activeFrame.fill(0);
    prevActiveCount = 0;
    clockMs = null;
    frameNo = 0;

    const WARM = 30;
    const N = 100;
    const tOff: number[] = [];
    const tOn: number[] = [];
    const tPart: number[] = [];
    const tPack: number[] = [];
    let cutOff = 0;
    let cutOn = 0;
    for (let f = 0; f < WARM + N; f++) {
      const ang = f * 0.01;
      const camPc: [number, number, number] = [
        pose.distPc * Math.cos(ang),
        pose.distPc * 0.2,
        pose.distPc * Math.sin(ang),
      ];
      const camMpc: [number, number, number] = [
        camPc[0] * PC_TO_MPC,
        camPc[1] * PC_TO_MPC,
        camPc[2] * PC_TO_MPC,
      ];
      const nowMs = f * 16.7;
      const frustum = frustumFor(camPc);

      // A: walk with the prune OFF (baseline).
      const a0 = performance.now();
      const off = walkStarOctreeCut(catalog, camPc, BUDGET, REFINE_THRESHOLD);
      const a1 = performance.now();
      const offCount = off.count;

      // B: walk with the prune ON, then partition + pack that (real) cut.
      const b0 = performance.now();
      const on = walkStarOctreeCut(catalog, camPc, BUDGET, REFINE_THRESHOLD, frustum);
      const b1 = performance.now();
      partition(on, camMpc, nowMs);
      const b2 = performance.now();
      // The pack still runs the exact per-stream cull with the Mpc planes.
      const planesMpc = frustumPlanesFromViewProj(
        mat4.multiply(
          mat4.perspective(FOV_Y, 16 / 9, 1e-3 * PC_TO_MPC, 1e7 * PC_TO_MPC),
          mat4.lookAt([0, 0, 0], [-camMpc[0], -camMpc[1], -camMpc[2]], [0, 1, 0]),
        ) as Float32Array,
        frustumScratch,
      );
      pack(leaf, planesMpc, frustum.angularMarginRad);
      pack(aggregate, planesMpc, frustum.angularMarginRad);
      const b3 = performance.now();

      if (f >= WARM) {
        tOff.push(a1 - a0);
        tOn.push(b1 - b0);
        tPart.push(b2 - b1);
        tPack.push(b3 - b2);
        cutOff = offCount;
        cutOn = on.count;
      }
    }
    const on = median(tOn);
    const part = median(tPart);
    const pk = median(tPack);
    process.stdout.write(
      `${pose.name.padEnd(22)}  ${median(tOff).toFixed(2).padStart(6)}  ${on
        .toFixed(2)
        .padStart(6)}  ${part.toFixed(2).padStart(8)}  ${pk.toFixed(2).padStart(5)}  ${(
        on +
        part +
        pk
      )
        .toFixed(2)
        .padStart(8)}   ${cutOff}→${cutOn}\n`,
    );
  }
}

await main();
