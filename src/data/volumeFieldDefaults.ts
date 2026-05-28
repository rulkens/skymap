/**
 * Per-volume-field presentation defaults — palette, contrast, densityScale,
 * envelope, exposure, trim — keyed by `VolumeFieldId`.
 *
 * All volumes (production + DEV-only synthetic fixtures) live in
 * `SOURCE_REGISTRY` with `type: 'volume'`, so this module is a thin
 * lookup helper rather than a separate registry.  Keeping the helper
 * around lets call sites stay decoupled from the registry's iteration
 * shape and gives a single place to add cross-cutting fallbacks if a
 * future producer wants to ship a brand-new field without registering
 * it first.
 */

import { SOURCE_REGISTRY } from './sources';
import type { VolumeFieldDefaults } from '../@types/data/VolumeFieldDefaults';
import type { VolumeFieldId } from '../@types/data/VolumeFieldId';

/**
 * Look up presentation defaults for a registered volume field id.
 * The handle is closed over `VolumeFieldId`, so callers cannot ask
 * for an unknown id — every value in the union has a registry entry.
 */
export function getVolumeFieldDefaults(id: VolumeFieldId): VolumeFieldDefaults {
  const entry = Object.values(SOURCE_REGISTRY).find(
    (e) => e.type === 'volume' && e.handle === id,
  );
  // The `VolumeFieldId` union is derived from SOURCE_REGISTRY entries,
  // so a missing entry would mean the registry has drifted from the
  // type — surface that loudly rather than papering over it.
  if (!entry || entry.type !== 'volume') {
    throw new Error(`getVolumeFieldDefaults: no registry entry for ${id}`);
  }
  return entry;
}
