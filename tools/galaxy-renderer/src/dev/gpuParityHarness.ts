/**
 * gpuParityHarness — dev-only console tool that generates one galaxy on
 * BOTH the two GPU compute pipelines (`createGenerationPipelines` +
 * `encodeGeneration`) and the CPU reference (`generateGalaxy`), then reports
 * how closely the two agree via `console.table`.
 *
 * ## Why this owns its own adapter/device, not the engine's
 *
 * `createGalaxyEngine`'s `GalaxyEngineHandle` is the one live GPU surface the
 * rest of this tool drives — its render loop, its buffers, its device.
 * Routing a diagnostic readback through that same device would mean either
 * stalling the visible render loop for `mapAsync`'s round trip, or braiding a
 * second submission path into `createGalaxyEngine.ts` for a feature the
 * engine itself doesn't need yet (plan 02 still renders from the CPU path —
 * see that file's header). Requesting a throwaway adapter/device pair for
 * the duration of one `runGpuParity()` call keeps this entirely off to the
 * side: the engine stays untouched, and this harness can be deleted wholesale
 * once the GPU generation path is trusted, without leaving a scar in the
 * render code.
 *
 * ## Why the comparison is STATISTICAL, never per-record
 *
 * The GPU's per-invocation hash RNG (`genRand`/`pcg4d` in `lib/generate.wesl`)
 * derives every draw from a stateless hash of `(seed, population, index,
 * slot)`. The CPU's `generateGalaxy` draws from one serial `mulberry32`
 * stream, walked one star at a time. Both are valid random sequences for
 * their own model, but they are NOT the same sequence — GPU slot 12345 was
 * never meant to equal CPU record 12345, so asserting per-record equality
 * would be asserting a coincidence, not verifying anything. Every metric
 * below is an aggregate over "live" records: total counts, a radial mass
 * histogram, mean colour, summed energy.
 *
 * ## Why thresholds are advisory prints, not vitest gates
 *
 * WGSL is f32 arithmetic; the CPU reference runs in JS's f64, and its RNG
 * differs by design (above). A correct GPU port (Tasks 6-8) will still never
 * match the CPU byte-for-byte — only in distribution, and only to within a
 * few percent. The PASS/CHECK flags this module prints are a judgement aid
 * for a developer reading `console.table` output, not a pass/fail contract
 * anything asserts on: there's no exact number to gate a test against, only
 * "does this still look like the same galaxy."
 *
 * ## What this task's numbers are EXPECTED to show
 *
 * Every case in `generateStars.wesl`/`generateDust.wesl` is still a
 * dead-record stub — Tasks 6-8 fill in the real per-population math — and
 * WGSL zero-initializes an unwritten `var`, so every GPU output slot comes
 * back with `brightness`/`opacity` (and everything else) at exactly 0. That
 * makes every GPU live count 0 while the CPU reference reports its real,
 * nonzero counts: the intended signal is that the dispatch + readback
 * plumbing works end to end, not yet that the generated galaxy is right.
 */
import { packGenerationUniforms } from '../engine/packGenerationUniforms';
import { GENERATION_UBO } from '../engine/generationUboLayout';
import { createGenerationPipelines } from '../engine/createGenerationPipelines';
import { encodeGeneration } from '../engine/encodeGeneration';
import { carveStarLayout } from '../model/carveStarLayout';
import { carveDustLayout } from '../model/carveDustLayout';
import { classifyHubbleType } from '../model/classifyHubbleType';
import { splitStarBudget } from '../model/splitStarBudget';
import { generateGalaxy } from '../model/generateGalaxy';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { GenerationLayout } from '../../@types/model/GenerationLayout';
import type { ParityReport } from '../../@types/dev/ParityReport';

/** Floats per record — shared by stars `[x,y,z,r,g,b,size,brightness]` and
 * dust `[x,y,z,size,r,g,b,opacity]` (see `GeneratedGalaxy`/`writeStar`/
 * `writeDust`): different field order, same stride, and both put their
 * "how bright/thick is this" scalar in the final lane. */
const STRIDE = 8;
const INTENSITY_OFFSET = 7; // brightness (stars) / opacity (dust) — last lane either way

const HIST_BINS = 16;
const HIST_MIN_MASS_FRACTION = 0.02; // brief: bins below 2% of mass are too noisy to gate on
const HIST_REL_DELTA_THRESHOLD_PCT = 5;
const STAR_TOTAL_THRESHOLD_PCT = 2;
const DUST_TOTAL_THRESHOLD_PCT = 5;
const COLOR_THRESHOLD_PCT = 2;
const INTENSITY_THRESHOLD_PCT = 3;

type Flag = 'PASS' | 'CHECK';
type Section = ParityReport['stars']; // stars/dust share one shape — see ParityReport's docblock

/** Percent delta of `a` relative to `b`, guarding `b === 0` (a live-count
 * or fraction of exactly zero is common while the GPU path is a stub). */
function pctDelta(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / b) * 100;
}

function flagFrom(deltaPct: number, thresholdPct: number): Flag {
  return Math.abs(deltaPct) <= thresholdPct ? 'PASS' : 'CHECK';
}

/** Live-slot count within one population's carved range. GPU-only: the CPU
 * model has no per-population counter to compare against (its builders write
 * straight into one flat, ungapped array — see `ParityReport`'s docblock). */
function countLiveInRange(
  records: Float32Array,
  range: GenerationLayout['ranges'][number],
): number {
  const slotCount = range.iterations * range.stride;
  let live = 0;
  for (let i = 0; i < slotCount; i++) {
    const slot = range.start + i;
    if (records[slot * STRIDE + INTENSITY_OFFSET]! > 0) live++;
  }
  return live;
}

/** One "live" record's radial bin, `hypot(x, z) / outerRadius` clamped into
 * `[0, HIST_BINS)`. Shared by GPU and CPU passes — same field offsets. */
function radialBin(records: Float32Array, base: number, outerRadius: number): number {
  const r = Math.hypot(records[base]!, records[base + 2]!);
  const frac = outerRadius > 0 ? r / outerRadius : 0;
  return Math.min(HIST_BINS - 1, Math.max(0, Math.floor(frac * HIST_BINS)));
}

function buildSection(args: {
  readonly gpuRecords: Float32Array;
  readonly cpuRecords: Float32Array;
  readonly ranges: GenerationLayout['ranges'];
  readonly colorOffsets: readonly [number, number, number];
  readonly outerRadius: number;
  readonly totalThresholdPct: number;
}): Section {
  const { gpuRecords, cpuRecords, ranges, colorOffsets, outerRadius, totalThresholdPct } = args;

  let gpuTotal = 0;
  let gpuIntensitySum = 0;
  const gpuColorSum: [number, number, number] = [0, 0, 0];
  const gpuHist = new Array<number>(HIST_BINS).fill(0);
  for (let i = 0; i < gpuRecords.length / STRIDE; i++) {
    const base = i * STRIDE;
    const v = gpuRecords[base + INTENSITY_OFFSET]!;
    if (!(v > 0)) continue; // dead slot — see module header
    gpuTotal++;
    gpuIntensitySum += v;
    gpuColorSum[0] += gpuRecords[base + colorOffsets[0]]!;
    gpuColorSum[1] += gpuRecords[base + colorOffsets[1]]!;
    gpuColorSum[2] += gpuRecords[base + colorOffsets[2]]!;
    const gpuBin = radialBin(gpuRecords, base, outerRadius);
    gpuHist[gpuBin] = (gpuHist[gpuBin] ?? 0) + 1;
  }

  // CPU records are tight-packed at exactly `starCount`/`dustCount` length —
  // every one of them is live by construction, no filter needed.
  let cpuTotal = 0;
  let cpuIntensitySum = 0;
  const cpuColorSum: [number, number, number] = [0, 0, 0];
  const cpuHist = new Array<number>(HIST_BINS).fill(0);
  for (let i = 0; i < cpuRecords.length / STRIDE; i++) {
    const base = i * STRIDE;
    cpuTotal++;
    cpuIntensitySum += cpuRecords[base + INTENSITY_OFFSET]!;
    cpuColorSum[0] += cpuRecords[base + colorOffsets[0]]!;
    cpuColorSum[1] += cpuRecords[base + colorOffsets[1]]!;
    cpuColorSum[2] += cpuRecords[base + colorOffsets[2]]!;
    const cpuBin = radialBin(cpuRecords, base, outerRadius);
    cpuHist[cpuBin] = (cpuHist[cpuBin] ?? 0) + 1;
  }

  const totalDeltaPct = pctDelta(gpuTotal, cpuTotal);

  const histogram = Array.from({ length: HIST_BINS }, (_unused, bin) => {
    const gpuFraction = gpuTotal > 0 ? gpuHist[bin]! / gpuTotal : 0;
    const cpuFraction = cpuTotal > 0 ? cpuHist[bin]! / cpuTotal : 0;
    const relDeltaPct = pctDelta(gpuFraction, cpuFraction);
    const flag: Flag =
      cpuFraction > HIST_MIN_MASS_FRACTION
        ? flagFrom(relDeltaPct, HIST_REL_DELTA_THRESHOLD_PCT)
        : 'PASS';
    return { bin, gpu: gpuFraction, cpu: cpuFraction, relDeltaPct, flag };
  });

  const gpuMeanColor: readonly [number, number, number] =
    gpuTotal > 0
      ? [gpuColorSum[0] / gpuTotal, gpuColorSum[1] / gpuTotal, gpuColorSum[2] / gpuTotal]
      : [0, 0, 0];
  const cpuMeanColor: readonly [number, number, number] =
    cpuTotal > 0
      ? [cpuColorSum[0] / cpuTotal, cpuColorSum[1] / cpuTotal, cpuColorSum[2] / cpuTotal]
      : [0, 0, 0];
  const colorDeltaPct: readonly [number, number, number] = [
    pctDelta(gpuMeanColor[0], cpuMeanColor[0]),
    pctDelta(gpuMeanColor[1], cpuMeanColor[1]),
    pctDelta(gpuMeanColor[2], cpuMeanColor[2]),
  ];

  const intensityDeltaPct = pctDelta(gpuIntensitySum, cpuIntensitySum);

  return {
    total: {
      gpu: gpuTotal,
      cpu: cpuTotal,
      deltaPct: totalDeltaPct,
      flag: flagFrom(totalDeltaPct, totalThresholdPct),
    },
    perPopulation: ranges.map((range) => ({
      popId: range.popId,
      gpuLiveCount: countLiveInRange(gpuRecords, range),
      layoutIterations: range.iterations,
    })),
    histogram,
    meanColor: {
      gpu: gpuMeanColor,
      cpu: cpuMeanColor,
      flag: colorDeltaPct.every((d) => Math.abs(d) <= COLOR_THRESHOLD_PCT) ? 'PASS' : 'CHECK',
    },
    summedIntensity: {
      gpu: gpuIntensitySum,
      cpu: cpuIntensitySum,
      deltaPct: intensityDeltaPct,
      flag: flagFrom(intensityDeltaPct, INTENSITY_THRESHOLD_PCT),
    },
  };
}

function printSection(label: 'stars' | 'dust', section: Section): void {
  const intensityLabel = label === 'stars' ? 'summed brightness' : 'summed opacity';
  // eslint-disable-next-line no-console
  console.log(`[gpuParityHarness] ${label}`);
  // eslint-disable-next-line no-console
  console.table([
    {
      metric: 'total live count',
      gpu: section.total.gpu,
      cpu: section.total.cpu,
      deltaPct: section.total.deltaPct.toFixed(2),
      flag: section.total.flag,
    },
    {
      metric: intensityLabel,
      gpu: section.summedIntensity.gpu.toFixed(2),
      cpu: section.summedIntensity.cpu.toFixed(2),
      deltaPct: section.summedIntensity.deltaPct.toFixed(2),
      flag: section.summedIntensity.flag,
    },
  ]);
  // eslint-disable-next-line no-console
  console.table(section.perPopulation);
  // eslint-disable-next-line no-console
  console.table(
    section.histogram.map((h) => ({
      bin: h.bin,
      gpuFraction: h.gpu.toFixed(3),
      cpuFraction: h.cpu.toFixed(3),
      relDeltaPct: h.relDeltaPct.toFixed(1),
      flag: h.flag,
    })),
  );
  // eslint-disable-next-line no-console
  console.table([
    {
      channel: 'r',
      gpu: section.meanColor.gpu[0].toFixed(3),
      cpu: section.meanColor.cpu[0].toFixed(3),
    },
    {
      channel: 'g',
      gpu: section.meanColor.gpu[1].toFixed(3),
      cpu: section.meanColor.cpu[1].toFixed(3),
    },
    {
      channel: 'b',
      gpu: section.meanColor.gpu[2].toFixed(3),
      cpu: section.meanColor.cpu[2].toFixed(3),
    },
    { channel: '(flag)', gpu: section.meanColor.flag, cpu: '' },
  ]);
}

export async function runGpuParity(params: GalaxyParams): Promise<ParityReport> {
  if (!navigator.gpu)
    throw new Error('gpuParityHarness: no WebGPU support (navigator.gpu is undefined)');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('gpuParityHarness: no GPU adapter available');
  const device = await adapter.requestDevice();

  const category = classifyHubbleType(params.type);
  const budget = splitStarBudget(category, params);
  const starLayout = carveStarLayout(category, params, budget);
  const dustLayout = carveDustLayout(category, params, budget);

  // `extra: null` — this harness always generates a standalone galaxy, never
  // one of the baked-transform background "extras" `packGenerationUniforms`
  // also supports.
  const uboData = packGenerationUniforms(params, budget, null);
  const outerRadius = new Float32Array(uboData)[GENERATION_UBO.f32.outerRadius]!;

  const ubo = device.createBuffer({
    label: 'parity:ubo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ubo, 0, uboData);

  const STRIDE_BYTES = STRIDE * 4;
  // A zero-size GPUBuffer is invalid, so a (never-expected-in-practice)
  // zero-capacity star layout still gets a one-record buffer to bind.
  const starByteLength = Math.max(1, starLayout.capacity) * STRIDE_BYTES;
  const starBuf = device.createBuffer({
    label: 'parity:starBuf',
    size: starByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const dustByteLength = dustLayout.capacity * STRIDE_BYTES;
  const dustBuf =
    dustLayout.capacity > 0
      ? device.createBuffer({
          label: 'parity:dustBuf',
          size: dustByteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        })
      : null;

  const pipelines = createGenerationPipelines(device);

  const starReadBuf = device.createBuffer({
    label: 'parity:starReadBuf',
    size: starByteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const dustReadBuf = dustBuf
    ? device.createBuffer({
        label: 'parity:dustReadBuf',
        size: dustByteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
    : null;

  const encoder = device.createCommandEncoder({ label: 'parity:encoder' });
  encodeGeneration({ device, encoder, pipelines, ubo, starBuf, starLayout, dustBuf, dustLayout });
  encoder.copyBufferToBuffer(starBuf, 0, starReadBuf, 0, starByteLength);
  if (dustBuf && dustReadBuf)
    encoder.copyBufferToBuffer(dustBuf, 0, dustReadBuf, 0, dustByteLength);
  device.queue.submit([encoder.finish()]);

  await starReadBuf.mapAsync(GPUMapMode.READ);
  const gpuStars = new Float32Array(starReadBuf.getMappedRange().slice(0));
  starReadBuf.unmap();

  let gpuDust = new Float32Array(0);
  if (dustReadBuf) {
    await dustReadBuf.mapAsync(GPUMapMode.READ);
    gpuDust = new Float32Array(dustReadBuf.getMappedRange().slice(0));
    dustReadBuf.unmap();
  }

  const cpu = generateGalaxy(params);

  const report: ParityReport = {
    stars: buildSection({
      gpuRecords: gpuStars,
      cpuRecords: cpu.stars,
      ranges: starLayout.ranges,
      colorOffsets: [3, 4, 5], // stars: x,y,z,r,g,b,size,brightness
      outerRadius,
      totalThresholdPct: STAR_TOTAL_THRESHOLD_PCT,
    }),
    dust: buildSection({
      gpuRecords: gpuDust,
      cpuRecords: cpu.dust,
      ranges: dustLayout.ranges,
      colorOffsets: [4, 5, 6], // dust: x,y,z,size,r,g,b,opacity
      outerRadius,
      totalThresholdPct: DUST_TOTAL_THRESHOLD_PCT,
    }),
  };

  printSection('stars', report.stars);
  printSection('dust', report.dust);

  return report;
}
