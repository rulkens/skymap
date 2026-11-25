#!/usr/bin/env node
/**
 * buildSampledTracks — every `HORIZONS_BODIES` row with `vectors: 'state'` → one
 * `public/data/sampledTrack.<id>.bin`. Its daily vectors are refined by the body's
 * `SAMPLED_TRACK_REFINEMENTS` entry, if any (merged first with the dense windows it requires),
 * decimated so the Hermite the app evaluates stays within 1 km of every raw sample, and every raw
 * sample is re-checked against the kept ones.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { readHorizonsCsv } from '../utils/data/readHorizonsCsv';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { hermiteTrackAt } from '../../src/utils/orbit/hermiteTrackAt';
import { writeSampledTracks } from '../utils/io/writeSampledTracks';
import { decimateHermiteSamples } from '../utils/math/decimateHermiteSamples';
import { HORIZONS_BODIES } from './horizonsBodies';
import { SAMPLED_TRACK_REFINEMENTS } from './sampledTrackRefinements';
import type { HorizonsBody } from './@types/HorizonsBody';

const TOLERANCE_KM = 1;

/** The daily vectors, merged with the dense windows when `denseFetch` says the body needs them. */
function loadDense(row: HorizonsBody, denseFetch: string | undefined): SampledTrack {
  const dir = join(rawDataPath('horizons'), row.centre);
  const densePath = join(dir, `${row.target}.dense.csv`);
  if (denseFetch && !existsSync(densePath))
    throw new Error(`${row.id}: ${densePath} is missing; run \`${denseFetch}\``);
  const rows = mergeHorizonsChunks([
    [
      ...readHorizonsCsv(join(dir, `${row.target}.csv`)),
      ...(denseFetch ? readHorizonsCsv(densePath) : []),
    ].sort((a, b) => a.jd - b.jd),
  ]);
  const track: SampledTrack = {
    id: row.id,
    tDays: new Float64Array(rows.length),
    posKm: new Float64Array(3 * rows.length),
    velKmS: new Float32Array(3 * rows.length),
  };
  rows.forEach((r, i) => {
    (track.tDays as Float64Array)[i] = r.jd;
    (track.posKm as Float64Array).set([r.xKm, r.yKm, r.zKm], 3 * i);
    (track.velKmS as Float32Array).set([r.vxKmS!, r.vyKmS!, r.vzKmS!], 3 * i);
  });
  return track;
}

function gather(dense: SampledTrack, kept: Uint32Array): SampledTrack {
  const out: SampledTrack = {
    id: dense.id,
    tDays: new Float64Array(kept.length),
    posKm: new Float64Array(3 * kept.length),
    velKmS: new Float32Array(3 * kept.length),
  };
  kept.forEach((src, k) => {
    (out.tDays as Float64Array)[k] = dense.tDays[src]!;
    (out.posKm as Float64Array).set(dense.posKm.subarray(3 * src, 3 * src + 3), 3 * k);
    (out.velKmS as Float32Array).set(dense.velKmS.subarray(3 * src, 3 * src + 3), 3 * k);
  });
  return out;
}

/** Worst distance from any raw sample to the track the app will evaluate, via its own `hermiteTrackAt`. */
function worstErrorKm(dense: SampledTrack, kept: Uint32Array): number {
  const thin = gather(dense, kept);
  let worst = 0;
  for (let i = 0; i < dense.tDays.length; i++) {
    const [x, y, z] = hermiteTrackAt(thin, dense.tDays[i]!);
    worst = Math.max(
      worst,
      Math.hypot(x - dense.posKm[3 * i]!, y - dense.posKm[3 * i + 1]!, z - dense.posKm[3 * i + 2]!),
    );
  }
  return worst;
}

for (const row of HORIZONS_BODIES.filter((b) => b.vectors === 'state')) {
  const refinement = SAMPLED_TRACK_REFINEMENTS[row.id];
  const dense = loadDense(row, refinement?.denseFetch);
  refinement?.refine(dense, row);
  const kept = decimateHermiteSamples(dense.tDays, dense.posKm, dense.velKmS, TOLERANCE_KM);
  const worst = worstErrorKm(dense, kept);
  console.log(
    `${row.id}: ${dense.tDays.length} raw -> ${kept.length} samples, worst error ${worst.toFixed(3)} km`,
  );
  if (worst > TOLERANCE_KM) throw new Error(`${row.id}: reconstruction error ${worst} km`);
  const path = `public/data/sampledTrack.${row.id}.bin`;
  const bin = writeSampledTracks([gather(dense, kept)]);
  writeFileSync(resolve(path), bin);
  console.log(`wrote ${path}: ${bin.length} bytes`);
}
