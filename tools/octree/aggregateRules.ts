import type { ColumnAggregate } from '../@types/octree/ColumnAggregate';
import type { ColumnAggregateRule } from '../@types/octree/ColumnAggregateRule';
import { aggregateMeanAbsMag, fluxFromAbsMag } from '../stars/mergeFluxAggregate';

const AXES = 3;

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
};
