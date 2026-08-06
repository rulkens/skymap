/**
 * sfMapActivityHistogramHarness — measures the claim behind S4's density
 * product (dust = gas x activity x texelArea): does the automaton's
 * activity EMA clamp at 1.0 on arm crests while interarm stays low, and
 * does that concentrate the CDF's mass in the arms? Runs the REAL
 * `createSfMapAutomatonRunner` (no CPU re-port of the shader) over the
 * shipped `DEFAULT_GALAXY_FIELD_TUNING` and the Milky Way's own geometry —
 * the same construction path `createGalaxyModel.ts`'s `setParams` uses
 * (`describeGalaxy(MILKY_WAY_GALAXY_PARAMS)` -> `sfMapGenerator.rebuild`) —
 * rather than `sfMapPercolationHarness.ts`'s synthetic uniform-forcing grid,
 * since the question here is what the REAL ridge does, not the bare
 * automaton. Automaton-specific by design (the fluid generator has no
 * `activity` EMA claim to measure this way), so it drives
 * `createSfMapAutomatonRunner` directly rather than the generator dispatcher.
 *
 * Page entry, like `sfMapPercolationEntry.ts`: hangs itself on `globalThis`
 * for `sweepSfMapActivityHistogram.ts`'s Playwright driver to call, since a
 * `?static` WESL import only resolves through this tool's own Vite server.
 */
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildGalaxySfMapArmForcing,
  sfMapGridRadiusOrDefault,
  SF_MAP_AZ,
  SF_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { sfMapDustDensity } from '../../../../../src/utils/galaxy/ismMapDustDensity';
import { sfMapDustRingEdges } from '../../../../../src/utils/galaxy/ismMapDustRingEdges';
import { createShaderModuleWithDevLog } from '../../../../../src/services/gpu/shaderCompileLogger';
import type { GalaxySfMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';
import { FIELD_HEADER_BUFFER_SIZE } from '../field/packFieldUniforms';
import { createSfMapOutput } from './createIsmMapOutput';
import { createSfMapAutomatonRunner } from './createIsmMapAutomatonRunner';
import { decodeSfMapTexels } from './decodeIsmMapTexels';

const CELL_COUNT = SF_MAP_AZ * SF_MAP_RINGS;
/** Fixed per the brief: geometry RNG and the automaton's own step hash both key off this. */
const SEED = 1;

type Population = 'crest' | 'interarm' | 'other';

type PopulationStat = {
  readonly label: string;
  readonly count: number;
  readonly min: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly frac255: number;
  readonly frac0: number;
  readonly gasP50: number;
  readonly massShare: number;
};

function percentileOf(sortedAsc: Float64Array, p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx]!;
}

/** activity's [0,1] clamp survives the rgba16float switch (sfMapPack.wesl keeps it, unlike dust) — an f16 1.0 and 0.0 are both exact, so frac255/frac0 below still land on the real saturation, not a decode artifact. */
function computeStat(
  label: string,
  activity: readonly number[],
  gas: readonly number[],
  mass: number,
  totalMass: number,
): PopulationStat {
  const n = activity.length;
  const sorted = Float64Array.from(activity).sort();
  const gasSorted = Float64Array.from(gas).sort();
  let frac255 = 0;
  let frac0 = 0;
  for (const v of activity) {
    if (v === 1) frac255++;
    if (v === 0) frac0++;
  }
  return {
    label,
    count: n,
    min: n > 0 ? sorted[0]! : NaN,
    p25: percentileOf(sorted, 0.25),
    p50: percentileOf(sorted, 0.5),
    p75: percentileOf(sorted, 0.75),
    p95: percentileOf(sorted, 0.95),
    p99: percentileOf(sorted, 0.99),
    max: n > 0 ? sorted[n - 1]! : NaN,
    frac255: n > 0 ? frac255 / n : NaN,
    frac0: n > 0 ? frac0 / n : NaN,
    gasP50: percentileOf(gasSorted, 0.5),
    massShare: totalMass > 0 ? mass / totalMass : NaN,
  };
}

function formatRow(s: PopulationStat): string {
  const num = (v: number, w: number): string =>
    Number.isNaN(v) ? '-'.padStart(w) : v.toFixed(3).padStart(w);
  return (
    s.label.padEnd(10) +
    String(s.count).padStart(9) +
    num(s.min, 8) +
    num(s.p25, 8) +
    num(s.p50, 8) +
    num(s.p75, 8) +
    num(s.p95, 8) +
    num(s.p99, 8) +
    num(s.max, 8) +
    num(s.frac255, 10) +
    num(s.frac0, 9) +
    num(s.gasP50, 9) +
    (Number.isNaN(s.massShare) ? '-'.padStart(9) : `${(s.massShare * 100).toFixed(1)}%`.padStart(9))
  );
}

type DustStat = {
  readonly label: string;
  readonly count: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
  /** Share of texels whose dust value exceeds ambient (1.0) — the rim/filament population. */
  readonly overshootFrac: number;
  /** sum(v - 1) over texels > 1, as a fraction of this population's total dust mass (sum of v). */
  readonly rimMassShare: number;
  readonly zeroFrac: number;
};

function computeDustStat(label: string, dust: readonly number[]): DustStat {
  const n = dust.length;
  const sorted = Float64Array.from(dust).sort();
  let overshootCount = 0;
  let zeroCount = 0;
  let rimMass = 0;
  let totalMass = 0;
  for (const v of dust) {
    if (v > 1) {
      overshootCount++;
      rimMass += v - 1;
    }
    if (v === 0) zeroCount++;
    totalMass += v;
  }
  return {
    label,
    count: n,
    p50: percentileOf(sorted, 0.5),
    p90: percentileOf(sorted, 0.9),
    max: n > 0 ? sorted[n - 1]! : NaN,
    overshootFrac: n > 0 ? overshootCount / n : NaN,
    rimMassShare: totalMass > 0 ? rimMass / totalMass : NaN,
    zeroFrac: n > 0 ? zeroCount / n : NaN,
  };
}

function formatDustRow(s: DustStat): string {
  const num = (v: number, w: number): string =>
    Number.isNaN(v) ? '-'.padStart(w) : v.toFixed(3).padStart(w);
  return (
    s.label.padEnd(10) +
    String(s.count).padStart(9) +
    num(s.p50, 8) +
    num(s.p90, 8) +
    num(s.max, 8) +
    num(s.overshootFrac, 12) +
    num(s.rimMassShare, 13) +
    num(s.zeroFrac, 9)
  );
}

function assertNoDeviceError(device: GPUDevice, what: string): Promise<void> {
  return device.popErrorScope().then((error) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  });
}

export async function runSfMapActivityHistogram(
  overrides?: Partial<GalaxySfMapAutomatonParams>,
): Promise<string> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const info = adapter.info ?? ({} as GPUAdapterInfo);
  const gpuErrors: string[] = [];
  device.addEventListener('uncapturederror', (event) => {
    gpuErrors.push((event as GPUUncapturedErrorEvent).error.message);
  });

  // `fieldUbo` only backs `presentBindGroup`, which this harness never draws
  // with — sized right so `createBindGroup`'s validation against the 'auto'
  // layout's minBindingSize doesn't reject it; content is never read.
  const fieldUbo = device.createBuffer({
    label: 'sfMapActivityHistogram:fieldUbo',
    size: FIELD_HEADER_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.pushErrorScope('validation');
  const makeShader = (code: string, label: string): GPUShaderModule =>
    createShaderModuleWithDevLog(device, code, label);
  const output = createSfMapOutput(device, {
    makeShader,
    // Matches createGalaxyEngine.ts's own `HDR` — not exported from that
    // file (this harness must not import it, see this file's header), so
    // restated here; `presentPipeline`'s target format, which this harness
    // never renders to.
    hdrFormat: 'rgba16float',
    fieldUbo,
  });
  const automaton = createSfMapAutomatonRunner(device, { makeShader, output });
  await assertNoDeviceError(device, 'automaton pipeline creation');

  // The exact construction path `createGalaxyModel.ts`'s `setParams` runs at
  // boot: `generateGalaxy` -> `describeGalaxy(params)` -> `fieldGeometry`,
  // with `params` defaulting to `DEFAULT_GALAXY_PARAMS` (`MILKY_WAY_GALAXY_PARAMS`
  // re-exported, tools/galaxy-renderer/src/data/defaultGalaxyParams.ts).
  const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
  // No overrides -> the exact same object DEFAULT_GALAXY_FIELD_TUNING as before
  // this param existed, so a flagless run is behaviour-identical, not just
  // numerically equal.
  const tuning =
    overrides === undefined
      ? DEFAULT_GALAXY_FIELD_TUNING
      : {
          ...DEFAULT_GALAXY_FIELD_TUNING,
          sfMapAutomaton: { ...DEFAULT_GALAXY_FIELD_TUNING.sfMapAutomaton, ...overrides },
        };
  const grid = sfMapGridRadiusOrDefault(geometry);
  output.writeGrid(grid);

  device.pushErrorScope('validation');
  automaton.rebuild({ geometry, tuning, seed: SEED, grid });
  await device.queue.onSubmittedWorkDone();
  await assertNoDeviceError(device, 'automaton rebuild');

  // Same readback path as createSfMapReadbacks.ts's `sfMapStream`: copy into
  // the output's own padded staging buffer, map, then `decodeSfMapTexels`
  // strips WebGPU's 256-byte row stride AND decodes the f16 lanes back to
  // the tight, linear az*4-floats-per-row layout.
  const enc = device.createCommandEncoder({ label: 'sfMapActivityHistogram:copy' });
  enc.copyTextureToBuffer(
    { texture: output.texture },
    { buffer: output.readbackBuffer, bytesPerRow: output.readbackBytesPerRow },
    [SF_MAP_AZ, SF_MAP_RINGS],
  );
  device.queue.submit([enc.finish()]);
  await output.readbackBuffer.mapAsync(GPUMapMode.READ);
  const packed = decodeSfMapTexels(
    new Uint16Array(output.readbackBuffer.getMappedRange()).slice(),
    output.readbackBytesPerRow,
    SF_MAP_AZ,
    SF_MAP_RINGS,
  );
  output.readbackBuffer.unmap();

  // CPU-side arm-forcing field, no GPU readback needed — same pure function
  // `automaton.rebuild` already called to fill its own texture, so this is a
  // second call, not a second implementation (buildGalaxySfMapArmForcing.ts).
  const forcing = buildGalaxySfMapArmForcing(geometry, tuning);

  const sortedForcing = Float64Array.from(forcing).sort();
  // Crest = top decile, interarm = bottom half, per the brief.
  const crestThreshold = percentileOf(sortedForcing, 0.9);
  const interarmThreshold = percentileOf(sortedForcing, 0.5);

  const classify = (v: number): Population =>
    v >= crestThreshold ? 'crest' : v <= interarmThreshold ? 'interarm' : 'other';

  const dTheta = (2 * Math.PI) / SF_MAP_AZ;
  const texelAreaByRing = new Float64Array(SF_MAP_RINGS);
  for (let ring = 0; ring < SF_MAP_RINGS; ring++) {
    const { rInner, rOuter } = sfMapDustRingEdges(ring, SF_MAP_RINGS, grid.rMin, grid.rMax);
    texelAreaByRing[ring] = 0.5 * dTheta * (rOuter * rOuter - rInner * rInner);
  }

  const activityAll: number[] = new Array(CELL_COUNT);
  const gasAll: number[] = new Array(CELL_COUNT);
  const dustAll: number[] = new Array(CELL_COUNT);
  const byPop: Record<
    Population,
    { activity: number[]; gas: number[]; dust: number[]; mass: number }
  > = {
    crest: { activity: [], gas: [], dust: [], mass: 0 },
    interarm: { activity: [], gas: [], dust: [], mass: 0 },
    other: { activity: [], gas: [], dust: [], mass: 0 },
  };
  let totalMass = 0;

  for (let ring = 0; ring < SF_MAP_RINGS; ring++) {
    const rowBase = ring * SF_MAP_AZ;
    const area = texelAreaByRing[ring]!;
    for (let az = 0; az < SF_MAP_AZ; az++) {
      const i = rowBase + az;
      const gas = packed[i * 4]!;
      const activity = packed[i * 4 + 2]!;
      const dust = packed[i * 4 + 3]!;
      activityAll[i] = activity;
      gasAll[i] = gas;
      dustAll[i] = dust;
      const mass = sfMapDustDensity(gas, activity) * area;
      totalMass += mass;
      const pop = classify(forcing[i]!);
      byPop[pop].activity.push(activity);
      byPop[pop].gas.push(gas);
      byPop[pop].dust.push(dust);
      byPop[pop].mass += mass;
    }
  }

  const stats = [
    computeStat('all', activityAll, gasAll, totalMass, totalMass),
    computeStat('crest', byPop.crest.activity, byPop.crest.gas, byPop.crest.mass, totalMass),
    computeStat(
      'interarm',
      byPop.interarm.activity,
      byPop.interarm.gas,
      byPop.interarm.mass,
      totalMass,
    ),
    computeStat('other', byPop.other.activity, byPop.other.gas, byPop.other.mass, totalMass),
  ];

  const dustStats = [
    computeDustStat('all', dustAll),
    computeDustStat('crest', byPop.crest.dust),
    computeDustStat('interarm', byPop.interarm.dust),
    computeDustStat('other', byPop.other.dust),
  ];

  const lines: string[] = [];
  lines.push('SF-map activity / dust-mass histogram');
  lines.push(
    `  adapter: ${`${info.vendor ?? '?'}/${info.architecture ?? '?'} ${info.device ?? ''} ${info.description ?? ''}`.trim()}`,
  );
  lines.push(
    `  grid: ${SF_MAP_AZ}x${SF_MAP_RINGS}, rMin=${grid.rMin.toFixed(3)} rMax=${grid.rMax.toFixed(3)}, steps=${tuning.sfMapAutomaton.steps}, armForcing=${tuning.sfMapAutomaton.armForcing}, seed=${SEED}`,
  );
  // Full effective sfMap param set, not just the two named above — makes a
  // sweep log self-describing without cross-referencing the CLI invocation.
  lines.push(`  params: ${JSON.stringify(tuning.sfMapAutomaton)}`);
  lines.push(
    `  population thresholds on the CPU armForcing field: crest >= p90 = ${crestThreshold.toFixed(4)}, interarm <= p50 = ${interarmThreshold.toFixed(4)}`,
  );
  lines.push('');
  lines.push(
    'pop'.padEnd(10) +
      'n'.padStart(9) +
      'min'.padStart(8) +
      'p25'.padStart(8) +
      'p50'.padStart(8) +
      'p75'.padStart(8) +
      'p95'.padStart(8) +
      'p99'.padStart(8) +
      'max'.padStart(8) +
      'frac@255'.padStart(10) +
      'frac@0'.padStart(9) +
      'gasP50'.padStart(9) +
      'mass%'.padStart(9),
  );
  for (const s of stats) lines.push(formatRow(s));
  lines.push('');
  lines.push(
    `  CDF mass split: crest ${(stats[1]!.massShare * 100).toFixed(1)}% / interarm ${(stats[2]!.massShare * 100).toFixed(1)}% / other ${(stats[3]!.massShare * 100).toFixed(1)}%  (total mass ${totalMass.toExponential(3)})`,
  );

  lines.push('');
  lines.push('dust channel (texel .w — ambient 1.0, snowplough rim overshoot, ceiling 8)');
  lines.push(
    'pop'.padEnd(10) +
      'n'.padStart(9) +
      'p50'.padStart(8) +
      'p90'.padStart(8) +
      'max'.padStart(8) +
      'overshoot%'.padStart(12) +
      'rimMass%'.padStart(13) +
      'zero%'.padStart(9),
  );
  for (const s of dustStats) lines.push(formatDustRow(s));

  if (gpuErrors.length > 0) {
    throw new Error(`GPU rejected work:\n  ${[...new Set(gpuErrors)].join('\n  ')}`);
  }

  device.destroy();

  // Single-line tail so a shell sweep loop can `grep '^RESULT '` and collect
  // every run's params + stats without parsing the tables above.
  const result = {
    tool: 'sfMapActivityHistogram',
    params: tuning.sfMapAutomaton,
    activity: Object.fromEntries(stats.map((s) => [s.label, s])),
    dust: Object.fromEntries(dustStats.map((s) => [s.label, s])),
  };
  lines.push('');
  lines.push(`RESULT ${JSON.stringify(result)}`);

  return lines.join('\n');
}

declare global {
  var __sfMapActivityHistogram: (overrides?: Partial<GalaxySfMapAutomatonParams>) => Promise<string>;
}

globalThis.__sfMapActivityHistogram = runSfMapActivityHistogram;
