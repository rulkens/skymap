import type { StreamStellarMass } from '../@types/StreamStellarMass';
import { STREAM_STELLAR_MASS } from '../data/streamStellarMass.constants';

/** The stream's published stellar mass by galstreams `Name`, or null when the table has none. */
export function streamStellarMass(name: string): StreamStellarMass | null {
  return Object.hasOwn(STREAM_STELLAR_MASS, name) ? STREAM_STELLAR_MASS[name]! : null;
}
