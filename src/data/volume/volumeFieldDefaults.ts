/**
 * Per-volume-field presentation defaults — palette, contrast, densityScale,
 * envelope, exposure, trim — keyed by `VolumeFieldId`.
 *
 * All volumes (production + DEV-only synthetic fixtures) live in
 * `SOURCE_REGISTRY` with `type: 'volume'`, so this module is a thin
 * lookup helper rather than a separate registry.  Keeping the helpers
 * here lets call sites stay decoupled from the registry's iteration
 * shape and gives a single place to add cross-cutting fallbacks if a
 * future producer wants to ship a brand-new field without registering
 * it first.
 *
 * Three exports, layered:
 *   - `getVolumeFieldDefaults`  — presentation defaults for one id.
 *   - `buildVolumeFieldSettings` — a complete per-field settings entry
 *     (the seed shape every slot + the construction seed share).
 *   - `seedVolumeFields`        — the full construction-time record.
 */

import { SOURCE_REGISTRY } from '../sources';
import { DEFAULT_VOLUME_FIELD_INTENSITY } from '../defaults';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { VolumeFieldDefaults } from '../../@types/data/volume/VolumeFieldDefaults';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';

/** A `SourceEntry` narrowed to the volume discriminant. */
type VolumeEntry = Extract<SourceEntry, { type: 'volume' }>;

/**
 * Look up the full volume registry entry for an id. The id is
 * closed over `VolumeFieldId`, so callers cannot ask for an unknown id
 * — every value in the union has a registry entry.
 */
function volumeEntry(id: VolumeFieldId): VolumeEntry {
  const entry = Object.values(SOURCE_REGISTRY).find((e) => e.type === 'volume' && e.id === id);
  // The `VolumeFieldId` union is derived from SOURCE_REGISTRY entries,
  // so a missing entry would mean the registry has drifted from the
  // type — surface that loudly rather than papering over it.
  if (!entry || entry.type !== 'volume') {
    throw new Error(`volumeFieldDefaults: no registry entry for ${id}`);
  }
  return entry;
}

/**
 * Look up presentation defaults for a registered volume field id —
 * palette, contrast, densityScale, envelope, exposure, trim.
 */
export function getVolumeFieldDefaults(id: VolumeFieldId): VolumeFieldDefaults {
  return volumeEntry(id);
}

/**
 * Build a complete per-field settings entry from a volume's registry
 * defaults. Single source of truth for the seed shape that the
 * `addVolumeField` reducer and the construction seed (`seedVolumeFields`
 * below) both need — duplicating the literal across those sites is
 * exactly the drift this helper removes.
 *
 * `enabled` comes from the registry `visible` flag so the construction
 * seed lands the on/off bit in pure state at boot, symmetric with how the
 * construction seed lands each galaxy catalog's `galaxyCatalogs.items[id].enabled`.
 * `intensity` falls back to the global default for any field that omits a
 * per-cube override.
 */
export function buildVolumeFieldSettings(id: VolumeFieldId): VolumeFieldSettings {
  const entry = volumeEntry(id);
  return {
    enabled: entry.visible,
    intensity: entry.intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY,
    contrast: entry.contrast,
    densityScale: entry.densityScale,
    paletteId: entry.paletteId,
    trim: entry.trim,
    exposure: entry.exposure,
    bands: entry.fadeBands ?? [SCALE_FADE_BANDS.surveyDeepZoom],
  };
}

/**
 * Build the construction-time volume-field seed record. The engine seeds
 * `state.settings.volumes.items` from this at construction so every
 * shippable volume's on/off state (and tunables) EXISTS before any cube
 * loads — the demand predicate `settings.volumes.items[id]?.enabled` then
 * reads pure state, fully symmetric with the galaxy catalog items read
 * (`settings.galaxyCatalogs.items[id]?.enabled`). Without this, a
 * default-on volume (MCPM) never triggers its initial demand-driven
 * load because its field entry didn't exist yet.
 *
 * DEV-only debug fixtures (`binBaseName: null`) are excluded: they have
 * no on-disk payload, register only under `import.meta.env.DEV`, and
 * would clutter production state with ids that never load.
 */
export function seedVolumeFields(): Partial<Record<VolumeFieldId, VolumeFieldSettings>> {
  // Partial, not total: DEV-only debug ids are skipped below, so they
  // are absent from the result — the type reflects that rather than lying
  // about a complete mapping.
  const seeded: Partial<Record<VolumeFieldId, VolumeFieldSettings>> = {};
  for (const entry of Object.values(SOURCE_REGISTRY)) {
    if (entry.type !== 'volume' || entry.binBaseName === null) continue;
    seeded[entry.id] = buildVolumeFieldSettings(entry.id);
  }
  return seeded;
}
