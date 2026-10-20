/**
 * deriveVolumeLiveness — the pure core every scalar-volume liveness wrapper
 * delegates to: clamps raw settings at the read edge and asks the renderer
 * whether anything survives. No state, settings or fade read happens here — the
 * caller (a Layer's `present/deriveXLiveness.ts`) supplies the raw rows and
 * each field's value (switches, fade, clip and its emphasis folded in), so
 * this stays a projection of its three arguments only.
 */

import type { VolumeFieldRenderer } from '../../@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldLiveness } from '../../@types/rendering/VolumeFieldLiveness';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import { clampVolumeFieldSettings } from '../clampVolumeFieldSettings';

export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings,
  fadeOpacityOf: (id: Id) => number,
): VolumeFieldLiveness<Id> | null {
  const settingsOf = (id: Id) => clampVolumeFieldSettings(fieldSettingsOf(id));

  if (!renderer.hasActiveFields(settingsOf, fadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf };
}
