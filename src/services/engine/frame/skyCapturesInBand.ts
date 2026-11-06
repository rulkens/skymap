/**
 * skyCapturesInBand — the sky capture rows whose band is open at `eyeMpc`.
 * The frame's one answer: `scheduleSkyCaptures` bakes only these, and a
 * once-planner whose output a capture replays on all six faces drops its view
 * cull while any is open, so the two can never disagree on a band's edge frame.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SkyCaptureKey } from '../../../@types/rendering/SkyCaptureKey';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  APP_CUBEMAP_CAPTURE_REGISTRY,
  APP_SKY_CAPTURE_KEYS,
} from '../../../compositions/appCubemapCaptures';
import { fadeBand } from '../../../utils/math/fadeBand';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';

export function skyCapturesInBand(
  eyeMpc: Readonly<Vec3>,
  bodyStates: ReadonlyMap<PositionedId, BodyState>,
): ReadonlySet<SkyCaptureKey> {
  return new Set(
    APP_SKY_CAPTURE_KEYS.filter((key) => {
      const row = APP_CUBEMAP_CAPTURE_REGISTRY[key];
      return fadeBand(row.band, regionRelativeDistanceMpc(eyeMpc, row.anchor, bodyStates)) > 0;
    }),
  );
}
