/**
 * deriveVolumeLiveness — the pure core of every scalar-volume liveness wrapper: clamps raw
 * settings at the read edge and asks the renderer whether anything survives. It reads no state;
 * the caller (a Layer's `present/deriveXLiveness.ts`) folds switches, fade, clip and emphasis in.
 */

import type { VolumeFieldRenderer } from '../../../../@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldLiveness } from '../../../../@types/rendering/VolumeFieldLiveness';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';
import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';
import { clampVolumeFieldSettings } from './clampVolumeFieldSettings';

export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings,
  fadeOpacityOf: (id: Id) => number,
  regionOf: (id: Id) => DetailRegionDraw | null,
): VolumeFieldLiveness<Id> | null {
  const settingsOf = (id: Id) => clampVolumeFieldSettings(fieldSettingsOf(id));

  if (!renderer.hasActiveFields(settingsOf, fadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf, regionOf };
}
