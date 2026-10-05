#!/usr/bin/env node
/**
 * buildEphemerisCorrections — fit each `HORIZONS_BODIES` row's `Horizons − Kepler` residual
 * (1900–2100) into the committed `EPHEMERIS_CORRECTIONS` table. Kepler is the app's own path
 * (`keplerianPositionMpc(propagateElements(row, jd))`), so any element-row or frame edit needs a
 * rerun. A moon (an element row with a non-Sun focus) first fits a ΔM series to 300 km-equivalent
 * (|ΔM|·a), so it stays on its own conic and its trail stays centred; the Cartesian fit then takes
 * what the shipped ΔM leaves. Fits on the row's coarse grid to 900 km, then verifies the ROUNDED
 * values, as parsed from the emitted file, through `correctionSeriesAt` on every raw row in
 * runtime order (ΔM, Kepler, position); throws above 1,000 km. Reads `data/raw/horizons/<centre>/`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { elementsById } from '../../src/data/bodies/orbitalElements';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { correctionSeriesAt } from '../../src/utils/orbit/correctionSeriesAt';
import { keplerianPositionMpc } from '../../src/utils/orbit/keplerianPositionMpc';
import { propagateElements } from '../../src/utils/orbit/propagateElements';
import type { OrbitalElements } from '../../src/@types/scene/OrbitalElements';
import type { CorrectionSeries } from '../../src/@types/scene/CorrectionSeries';
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { HorizonsBody } from './@types/HorizonsBody';
import { HORIZONS_BODIES } from './horizonsBodies';
import { fitSinusoidSeries } from '../utils/math/fitSinusoidSeries';
import { meanAnomalyCorrectionTarget } from '../utils/math/meanAnomalyCorrectionTarget';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const GENERATED_PATH = 'src/data/bodies/ephemerisCorrections.generated.ts';
const GENERATED_BANNER =
  `// ${GENERATED_PATH}\n` +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run fetch-horizons && npm run build-ephemeris-corrections\n' +
  '// Source of truth:  data/raw/horizons/ (JPL Horizons) minus orbitalElements.ts\n';
const FIT_STOP_KM = 900;
const PHASE_STOP_KM = 300;
const VERIFY_MAX_KM = 1000;
const MAX_TERMS = 400;
const KM_TO_MPC = SCALE_UNITS.KM_TO_MPC;

// ω to 12 significant digits: over the 73,000-day span its phase error stays < 1e-7 rad.
// Amplitudes to 0.1 km: hundreds of 0.05 km roundings sum to well under a kilometre.
const fmtOmega = (x: number): string => String(Number(x.toPrecision(12)));
const fmtKm = (x: number): string => String(Math.round(x * 10) / 10);
// ΔM to 1e-7 rad: ≤ 0.4 km per rounding even at Iapetus's 3.56M km.
const fmtRad = (x: number): string => String(Math.round(x * 1e7) / 1e7);

function readSeries(body: HorizonsBody) {
  const csvPath = join(rawDataPath('horizons'), body.centre, `${body.target}.csv`);
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  const cols = [0, 1, 2, 3].map(() => new Float64Array(lines.length));
  lines.forEach((line, i) => line.split(',').forEach((v, c) => (cols[c]![i] = Number(v))));
  return { jd: cols[0]!, km: [cols[1]!, cols[2]!, cols[3]!] as const };
}

function keplerKm(propagated: OrbitalElements): Vec3 {
  const [x, y, z] = keplerianPositionMpc(propagated);
  return [x / KM_TO_MPC, y / KM_TO_MPC, z / KM_TO_MPC];
}

/** Emit one series' literal, and the series those exact digits parse back to. */
function emit(
  startJd: number,
  endJd: number,
  fit: Pick<CorrectionSeries, 'poly' | 'terms'>,
  fmtAmp: (x: number) => string,
): { text: string; shipped: CorrectionSeries } {
  const stride = 1 + 2 * fit.poly[0].length;
  const polyText = fit.poly.map((v) => v.map(fmtAmp));
  const termText = fit.terms.map((v, i) => (i % stride === 0 ? fmtOmega(v) : fmtAmp(v)));
  const parse = (s: readonly string[]): number[] => s.map(Number);
  const shipped: CorrectionSeries = {
    startJd,
    endJd,
    poly: polyText.map(parse) as unknown as CorrectionSeries['poly'],
    terms: parse(termText),
  };
  const text =
    `{ startJd: ${startJd}, endJd: ${endJd}, ` +
    `poly: [${polyText.map((v) => `[${v.join(', ')}]`).join(', ')}], ` +
    `terms: [${termText.join(', ')}] }`;
  return { text, shipped };
}

function buildBody(body: HorizonsBody): { text: string; summary: string } {
  const { id, fitStep: step, outside } = body;
  const row = elementsById(id);
  const { jd, km } = readSeries(body);
  const startJd = jd[0]!;
  const endJd = jd[jd.length - 1]!;
  const horizonsKm = (i: number): Vec3 => [km[0][i]!, km[1][i]!, km[2][i]!];

  // Every `step`-th row, plus the last row so the fit is never extrapolating at the end.
  const last = jd.length - 1;
  const sampleIdx = Array.from({ length: Math.ceil(last / step) + 1 }, (_, i) =>
    Math.min(i * step, last),
  );
  const tJd = Float64Array.from(sampleIdx, (i) => jd[i]!);

  const fields: string[] = [`outside: '${outside}'`];
  let phase: CorrectionSeries | undefined;
  let phaseTerms = '';
  if (row.focusId !== 'sun') {
    // Unwrap sample to sample: the series must see ΔM's true drift, not a ±π sawtooth.
    const target = new Float64Array(tJd.length);
    tJd.forEach((t, s) => {
      const d = meanAnomalyCorrectionTarget(propagateElements(row, t), horizonsKm(sampleIdx[s]!));
      const prev = s > 0 ? target[s - 1]! : d;
      target[s] = d - 2 * Math.PI * Math.round((d - prev) / (2 * Math.PI));
    });
    const radiusKm = row.semiMajorMpc / KM_TO_MPC;
    const fit = fitSinusoidSeries(
      tJd,
      [target],
      startJd,
      endJd,
      PHASE_STOP_KM / radiusKm,
      MAX_TERMS,
    );
    const { text, shipped } = emit(startJd, endJd, fit, fmtRad);
    fields.push(`meanAnomalyRad: ${text}`);
    phase = shipped;
    phaseTerms = `${fit.terms.length / 3} phase + `;
  }
  // The app's position before the Cartesian channel: Kepler at the shipped ΔM, as at runtime.
  const modelKm = (t: number): Vec3 => {
    const propagated = propagateElements(row, t);
    const dM = phase ? correctionSeriesAt(phase, t, outside)![0]! : 0;
    return keplerKm({ ...propagated, meanAnomalyRad: propagated.meanAnomalyRad + dM });
  };

  const model = sampleIdx.map((i) => modelKm(jd[i]!));
  const residual = [0, 1, 2].map((axis) =>
    Float64Array.from(sampleIdx, (i, s) => km[axis]![i]! - model[s]![axis]!),
  );
  const fit = fitSinusoidSeries(tJd, residual, startJd, endJd, FIT_STOP_KM, MAX_TERMS);
  const { text, shipped } = emit(startJd, endJd, fit, fmtKm);
  fields.push(`positionKm: ${text}`);

  let maxKm = 0;
  for (let i = 0; i < jd.length; i++) {
    const m = modelKm(jd[i]!);
    const corr = correctionSeriesAt(shipped, jd[i]!, outside)!;
    const err = [0, 1, 2].map((a) => km[a]![i]! - (m[a]! + corr[a]!));
    maxKm = Math.max(maxKm, Math.hypot(err[0]!, err[1]!, err[2]!));
  }
  const nTerms = fit.terms.length / 7;
  const summary = `${id}: ${phaseTerms}${nTerms} terms, max ${Math.round(maxKm)} km vs Horizons (${+body.stepDays.toFixed(6)}-day grid)`;
  if (maxKm > VERIFY_MAX_KM)
    throw new Error(`buildEphemerisCorrections: ${summary} exceeds ${VERIFY_MAX_KM} km`);
  return { text: `  // ${summary}\n  ${id}: { ${fields.join(', ')} },`, summary };
}

async function main(): Promise<void> {
  const rows: string[] = [];
  for (const body of HORIZONS_BODIES) {
    const { text, summary } = buildBody(body);
    process.stderr.write(`${summary}\n`);
    rows.push(text);
  }
  const source =
    GENERATED_BANNER +
    "import type { EphemerisCorrection } from '../../@types/scene/EphemerisCorrection';\n\n" +
    'export const EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>> = {\n' +
    `${rows.join('\n')}\n};\n`;
  const outPath = resolve(GENERATED_PATH);
  const formatted = await format(source, {
    ...(await resolveConfig(outPath)),
    parser: 'typescript',
  });
  writeFileSync(outPath, formatted);
  process.stderr.write(`wrote ${GENERATED_PATH} (${(formatted.length / 1024).toFixed(1)} kB)\n`);
}

await main();
