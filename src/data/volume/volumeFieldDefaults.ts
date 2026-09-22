/**
 * Per-volume-field presentation defaults — palette, contrast, densityScale,
 * envelope, exposure, trim — keyed by `CosmicWebDensityFieldId`.
 *
 * All volumes live in `SOURCE_REGISTRY` with `type: 'cosmicWebDensity'`, so
 * this module is a thin lookup helper rather than a separate registry.
 * Boot visibility and intensity are NOT here — those are app-state decisions
 * the owning Layer's `initialState` literal makes, not asset presentation.
 *
 * Two exports, layered:
 *   - `getVolumeFieldDefaults`   — presentation defaults for one id.
 *   - `buildVolumeFieldSettings` — the look-only fields every field's
 *     settings row shares; the caller supplies `enabled` and `intensity`.
 */

import { SOURCE_REGISTRY } from '../sources';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { VolumeFieldDefaults } from '../../@types/data/volume/VolumeFieldDefaults';
import type { CosmicWebDensityFieldId } from '../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';

/** A `SourceEntry` narrowed to the volume discriminant. */
type VolumeEntry = Extract<SourceEntry, { type: 'cosmicWebDensity' }>;

/**
 * Look up the full volume registry entry for an id. The id is
 * closed over `CosmicWebDensityFieldId`, so callers cannot ask for an
 * unknown id — every value in the union has a registry entry.
 */
function volumeEntry(id: CosmicWebDensityFieldId): VolumeEntry {
  const entry = Object.values(SOURCE_REGISTRY).find(
    (e) => e.type === 'cosmicWebDensity' && e.id === id,
  );
  // The `CosmicWebDensityFieldId` union is derived from SOURCE_REGISTRY
  // entries, so a missing entry would mean the registry has drifted from
  // the type — surface that loudly rather than papering over it.
  if (!entry || entry.type !== 'cosmicWebDensity') {
    throw new Error(`volumeFieldDefaults: no registry entry for ${id}`);
  }
  return entry;
}

/**
 * Look up presentation defaults for a registered volume field id —
 * palette, contrast, densityScale, envelope, exposure, trim.
 */
export function getVolumeFieldDefaults(id: CosmicWebDensityFieldId): VolumeFieldDefaults {
  return volumeEntry(id);
}

/**
 * Build the look-only fields a volume's settings row shares with every
 * other field of its kind, from the registry's presentation defaults.
 * `enabled` and `intensity` are the caller's to set — they're boot-state
 * decisions the owning Layer's `initialState` literal makes, not asset
 * presentation this registry lookup can answer.
 */
export function buildVolumeFieldSettings(
  id: CosmicWebDensityFieldId,
): Omit<VolumeFieldSettings, 'enabled' | 'intensity'> {
  const entry = volumeEntry(id);
  return {
    contrast: entry.contrast,
    densityScale: entry.densityScale,
    paletteId: entry.paletteId,
    trim: entry.trim,
    exposure: entry.exposure,
    bands: entry.fadeBands ?? [SCALE_FADE_BANDS.surveyDeepZoom],
  };
}
