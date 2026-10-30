import type { ColumnAggregate } from '../@types/octree/ColumnAggregate';
import type { ColumnAggregateRule } from '../@types/octree/ColumnAggregateRule';
import { aggregateMeanAbsMag, fluxFromAbsMag } from '../stars/mergeFluxAggregate';

const AXES = 3;
const HALF_TURN_DEG = 180;
const DOUBLED_RAD_PER_DEG = Math.PI / 90;

// Arithmetic order is load-bearing: an f64 reordering moves quantised bytes.
export const AGGREGATE_RULES: Readonly<Record<ColumnAggregate, ColumnAggregateRule>> = {
  fluxCentroid: {
    width: AXES,
    sums: AXES,
    input: 'positions',
    own(r, out, rec, sums, row) {
      for (let a = 0; a < AXES; a++) {
        const p = r.value(a);
        out[AXES * rec + a] = (p - r.boxMin[a]!) / r.edge;
        sums[a]![row]! += r.flux * p;
      }
    },
    blob(b, out, at, sums, row) {
      for (let a = 0; a < AXES; a++) {
        out[AXES * at + a] = (sums[a]![row]! / b.subFlux - b.boxMin[a]!) / b.edge;
      }
    },
  },
  fluxMeanMagnitude: {
    width: 1,
    sums: 1,
    input: 'column',
    own(r, out, rec, sums, row) {
      const v = r.value(0);
      out[rec] = v;
      sums[0]![row]! += fluxFromAbsMag(v);
    },
    blob(b, out, at, sums, row) {
      out[at] = aggregateMeanAbsMag({ totalFlux: sums[0]![row]!, starCount: b.subCount });
    },
  },
  fluxWeightedMean: {
    width: 1,
    sums: 1,
    input: 'column',
    own(r, out, rec, sums, row) {
      const v = r.value(0);
      out[rec] = v;
      sums[0]![row]! += r.flux * v;
    },
    blob(b, out, at, sums, row) {
      out[at] = sums[0]![row]! / b.subFlux;
    },
  },
  // Axes have period 180°: averaging the doubled angle as a vector keeps 175° and 5° near 0°, not 90°.
  axialFluxMean: {
    width: 1,
    sums: 2,
    input: 'column',
    own(r, out, rec, sums, row) {
      const v = r.value(0);
      out[rec] = v;
      const doubled = v * DOUBLED_RAD_PER_DEG;
      sums[0]![row]! += r.flux * Math.cos(doubled);
      sums[1]![row]! += r.flux * Math.sin(doubled);
    },
    blob(_b, out, at, sums, row) {
      const deg = Math.atan2(sums[1]![row]!, sums[0]![row]!) / DOUBLED_RAD_PER_DEG;
      // `+ 180` rounds a tiny negative angle to exactly 180, which `% 180` folds back to 0.
      out[at] = (deg + HALF_TURN_DEG) % HALF_TURN_DEG;
    },
  },
  none: {
    width: 1,
    sums: 0,
    input: 'column',
    own(r, out, rec) {
      out[rec] = r.value(0);
    },
    blob(_b, out, at) {
      out[at] = 0;
    },
  },
};
