import { fitsCard } from './fitsCard';
import { packHeaderBlock } from './packHeaderBlock';

/** Minimal primary header: SIMPLE + NAXIS=0 (no primary data, matching every real DESI LSS file). */
export function primaryHeaderBlock(): Uint8Array {
  return packHeaderBlock([fitsCard('SIMPLE', 'T'), fitsCard('NAXIS', '0')]);
}
