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
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';

export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings | undefined,
  fadeOpacityOf: (id: Id) => number,
  cameraDistanceMpc: number,
): VolumeFieldLiveness<Id> | null {
  const settingsOf = (id: Id) => {
    const raw = fieldSettingsOf(id);
    return raw === undefined ? undefined : clampVolumeFieldSettings(raw);
  };
  const bandedFadeOpacityOf = (id: Id) => {
    // No store row at all (id never seeded) gets the same default a stale
    // row would via clampVolumeFieldSettings — see that function's header.
    const bands = settingsOf(id)?.bands ?? [SCALE_FADE_BANDS.surveyDeepZoom];
    const bandFactor = bands.reduce(
      (factor, band) => factor * fadeBand(band, cameraDistanceMpc),
      1,
    );
    return fadeOpacityOf(id) * bandFactor;
  };

  if (!renderer.hasActiveFields(settingsOf, bandedFadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf: bandedFadeOpacityOf };
}
