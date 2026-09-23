/**
 * deriveVolumeLiveness — the pure core every scalar-volume liveness wrapper
 * delegates to: clamps raw settings at the read edge, folds each field's
 * scale-fade bands into its fade opacity, and asks the renderer whether
 * anything survives. No state, settings or fade read happens here — the
 * caller (a Layer's `present/deriveXLiveness.ts`) supplies the raw rows and
 * a fade opacity already resolved to "field fade × recessed master", so
 * this stays a projection of its four arguments only.
 */

import type { VolumeFieldRenderer } from '../../@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldLiveness } from '../../@types/rendering/VolumeFieldLiveness';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import { clampVolumeFieldSettings } from '../clampVolumeFieldSettings';
import { fadeBand } from '../math/fadeBand';

export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings,
  fadeOpacityOf: (id: Id) => number,
  cameraDistanceMpc: number,
): VolumeFieldLiveness<Id> | null {
  const settingsOf = (id: Id) => clampVolumeFieldSettings(fieldSettingsOf(id));
  const bandedFadeOpacityOf = (id: Id) => {
    const bandFactor = settingsOf(id).bands.reduce(
      (factor, band) => factor * fadeBand(band, cameraDistanceMpc),
      1,
    );
    return fadeOpacityOf(id) * bandFactor;
  };

  if (!renderer.hasActiveFields(settingsOf, bandedFadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf: bandedFadeOpacityOf };
}
