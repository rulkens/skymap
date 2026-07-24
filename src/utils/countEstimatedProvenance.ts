/**
 * countEstimatedProvenance — tally a cloud's fallback-flagged rows per
 * provenance axis.
 *
 * Runs once per catalog commit (not per frame): a full pass over two Uint8Array
 * columns of a few million entries is a couple of milliseconds, paid on the
 * same `ready` transition that already reports the source's row count. The
 * alternative — counting lazily when the debug panel opens — would either
 * block the UI thread mid-interaction or need the raw clouds threaded into
 * React, so we pay it up front and store six numbers.
 *
 * @module
 */

import { PROVENANCE_AXES } from '../data/provenanceAxes';
import type { GalaxyCatalog } from '../@types/data/galaxyCatalog/GalaxyCatalog';
import type { ProvenanceAxisId } from '../@types/settings/ProvenanceAxisId';
import type { ProvenanceCounts } from '../@types/engine/ProvenanceCounts';

export function countEstimatedProvenance(cloud: GalaxyCatalog): ProvenanceCounts {
  const estimated = {} as Record<ProvenanceAxisId, number>;

  for (const axis of PROVENANCE_AXES) {
    const flags = axis.flagsOf(cloud);
    let n = 0;
    // Bounded by the shorter of `cloud.count` and the flag column's own
    // length: a partial cloud stub (as engine-wiring tests hand the slot)
    // can omit a flag column entirely, and a synthetic cloud can allocate one
    // shorter than the rows it carries. Either way there's nothing to read
    // past the column's end, so we count zero estimated rows for that axis
    // rather than reading undefined — a debug-panel readout should never be
    // able to take down a catalog commit. `total` still reports `cloud.count`
    // untouched, so the percentage denominator is unaffected.
    const limit = Math.min(cloud.count, flags?.length ?? 0);
    for (let i = 0; i < limit; i++) {
      if (flags[i] === 1) n++;
    }
    estimated[axis.id] = n;
  }

  return { total: cloud.count, estimated };
}
