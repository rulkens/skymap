import { percentile } from '../../utils/perf/percentile';
import type { StreamMetallicity } from '../@types/StreamMetallicity';
import { STREAM_METALLICITY } from '../data/streamMetallicity.constants';

const MEDIAN_FEH = percentile(
  Object.values(STREAM_METALLICITY).map((m) => m.feh),
  50,
);

/** The [Fe/H] a stream's colours are drawn at: its measured value, else the table's median. */
export function streamFeh(metallicity: StreamMetallicity | null): number {
  return metallicity?.feh ?? MEDIAN_FEH;
}
