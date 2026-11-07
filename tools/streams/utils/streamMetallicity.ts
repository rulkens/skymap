import { percentile } from '../../utils/perf/percentile';
import type { StreamMetallicity } from '../@types/StreamMetallicity';
import { STREAM_METALLICITY } from '../data/streamMetallicity.constants';

const MEDIAN_FEH = percentile(
  Object.values(STREAM_METALLICITY).map((m) => m.feh),
  50,
);

/** The stream's measured [Fe/H] by galstreams `Name`, else the table's median with no reference. */
export function streamMetallicity(name: string): StreamMetallicity {
  // hasOwn, so a name like 'constructor' cannot read the prototype.
  return Object.hasOwn(STREAM_METALLICITY, name)
    ? STREAM_METALLICITY[name]!
    : { feh: MEDIAN_FEH, ref: null };
}
