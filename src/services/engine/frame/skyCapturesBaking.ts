/**
 * skyCapturesBaking — the in-band sky capture rows that re-bake this frame, decided before
 * the planners run so a once-planner whose output the faces replay drops its view culls on
 * exactly those frames. `scheduleSkyCaptures` bakes this set and nothing else. A row bakes
 * while nothing usable is baked (band entry, a settling roster last frame), while a fade
 * animates, or, for a `rebakeOnSettings` row, after a settings or content change.
 */

import type { CubemapCaptureRuntimes } from '../../../@types/engine/state/CubemapCaptureRuntimes';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import type { SkyCaptureKey } from '../../../@types/rendering/SkyCaptureKey';
import { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../../compositions/appCubemapCaptures';

export function skyCapturesBaking(input: {
  readonly inBand: ReadonlySet<SkyCaptureKey>;
  readonly captures: CubemapCaptureRuntimes;
  readonly settings: EngineSettingsState;
  readonly contentVersion: number;
  readonly fadesAnimating: boolean;
}): ReadonlySet<SkyCaptureKey> {
  const { inBand, captures, settings, contentVersion, fadesAnimating } = input;
  return new Set(
    [...inBand].filter((key) => {
      const { bakedSettings, bakedContentVersion } = captures[key];
      return (
        fadesAnimating ||
        bakedSettings === null ||
        (APP_CUBEMAP_CAPTURE_REGISTRY[key].rebakeOnSettings &&
          (bakedSettings !== settings || bakedContentVersion !== contentVersion))
      );
    }),
  );
}
