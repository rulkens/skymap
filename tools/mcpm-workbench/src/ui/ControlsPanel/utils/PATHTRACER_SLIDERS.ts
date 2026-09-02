import type { ViewSlice } from '../../../../@types/ViewSlice';

// 'divisor' gets its own dedicated ParamSlider below (the "Preview" group,
// mirroring the raymarch layer's own), not the generic log-mapped physics list.
type PathTracerSliderKey = Exclude<
  keyof ViewSlice['pathTracer'],
  'compressive' | 'divisor' | 'sampleCap' | 'paletteId'
>;

type PathTracerSliderSpec = {
  readonly key: PathTracerSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
  /** Present ⇒ log10 space, same convention as RAYMARCH_SLIDERS' sampleWeight. */
  readonly log?: boolean;
};

// Spec §7's nine knobs plus the raymarch layer's own trimDensity/sampleWeight
// (VolpathParams' full list — task-V2A-report.md). Order matches the brief.
export const PATHTRACER_SLIDERS: readonly PathTracerSliderSpec[] = [
  {
    key: 'sigmaT',
    label: 'sigma t',
    min: 0.01,
    max: 20,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Extinction. Scattering = albedo · sigmaT.',
  },
  {
    key: 'albedo',
    label: 'albedo',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Fraction of extinction that scatters rather than absorbs.',
  },
  {
    key: 'sigmaE',
    label: 'sigma e',
    min: 0,
    max: 10,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Emission scale — how bright a collision glows through the palette.',
  },
  {
    key: 'anisotropy',
    label: 'anisotropy',
    min: 0,
    max: 0.99,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: "Henyey-Greenstein mean cosine: 0 isotropic, up to 0.99 sharply forward. UNSIGNED — the fork's sampler folds a negative value onto its positive twin, so back-scattering is unreachable.",
  },
  {
    key: 'ambientTrace',
    label: 'ambient trace',
    min: 0,
    max: 1,
    step: 0.001,
    format: (v) => v.toFixed(3),
    info: 'Density floor inside the box, so the void between filaments still scatters.',
  },
  {
    key: 'traceMax',
    label: 'trace max',
    min: 0,
    max: 5,
    step: 0.05,
    log: true,
    format: (v) => Math.pow(10, v).toExponential(1),
    info: "Tracking majorant, log-mapped 1e0–1e5 to reach the field's real scale (packLogTraceVoxels.ts: p99≈320, max≈40000) — fork-faithful default sits below the field's peak (40000) on purpose, clamping the accept probability to 1 in the hottest voxels rather than spending tracking steps resolving them.",
  },
  {
    key: 'exposure',
    label: 'exposure',
    min: 0,
    max: 5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Tonemap exposure applied when the accumulator resolves.',
  },
  {
    key: 'trimDensity',
    label: 'trim density',
    min: 0,
    max: 0.5,
    step: 0.00001,
    format: (v) => v.toFixed(5),
    info: "Trace values at or below this are treated as empty space — the raymarch layer's own knob of the same name, kept separately tunable here.",
  },
  {
    key: 'sampleWeight',
    label: 'sample weight',
    min: -7,
    max: 0,
    step: 0.05,
    log: true,
    format: (v) => Math.pow(10, v).toExponential(1),
    info: 'Inverts the ~100x steady-state amplification of the trace decay (1% retained per step).',
  },
  {
    key: 'bounces',
    label: 'bounces',
    min: 1,
    max: 64,
    step: 1,
    format: (v) => v.toFixed(0),
    info: "Tracking walks per path, not the fork's n_bounces (this layer passes it through as given, one less than the fork's call-site convention).",
  },
];
