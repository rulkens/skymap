import type { StreamMetallicity } from '../@types/StreamMetallicity';
import { STREAM_METALLICITY } from '../data/streamMetallicity.constants';

/** The stream's measured [Fe/H] by galstreams `Name`, or null when the table has none. */
export function streamMetallicity(name: string): StreamMetallicity | null {
  // hasOwn, so a name like 'constructor' cannot read the prototype.
  return Object.hasOwn(STREAM_METALLICITY, name) ? STREAM_METALLICITY[name]! : null;
}
