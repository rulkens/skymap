/**
 * densityAccumulationKey — every input outside the view that the density running mean depends on,
 * as one exact string: a change restarts the mean. Numbers are never rounded, so a fade in flight
 * restarts every frame. A `VolumeFieldSettings` member left out here would freeze the converged
 * image on that slider at rest (its test moves each key of a settings literal TS forces complete).
 */

import type { Tier } from '../../../../@types/data/Tier';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';
import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';

export function densityAccumulationKey<Id extends string>(
  ids: readonly Id[],
  settingsOf: (id: Id) => VolumeFieldSettings,
  opacityOf: (id: Id) => number,
  cubeStampOf: (id: Id) => number | null,
  regionOf: (id: Id) => DetailRegionDraw | null,
  tier: Tier,
): string {
  const fields = ids.map((id) => {
    const s = settingsOf(id);
    return [
      id,
      s.enabled,
      s.intensity,
      s.contrast,
      s.densityScale,
      s.paletteId,
      s.trim,
      s.exposure,
      s.showLevels,
      opacityOf(id),
      cubeStampOf(id),
      regionOf(id),
    ];
  });
  // JSON prints each number in its shortest round-trip form: exact, like `String(n)`.
  return JSON.stringify([tier, fields]);
}
