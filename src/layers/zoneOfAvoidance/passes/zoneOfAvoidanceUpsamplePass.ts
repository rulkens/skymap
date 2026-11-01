/**
 * zoneOfAvoidanceUpsamplePass — composites the reduced-res `zoa` offscreen
 * into HDR. The band's lettering is core's `labels-world` pass, drawn after
 * this one.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../@types/ZoneOfAvoidanceRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';

export function zoneOfAvoidanceUpsamplePass(
  runtime: ZoneOfAvoidanceRuntime,
): ContentPass<'zoneOfAvoidance'> {
  return createUpsamplePass<'zoneOfAvoidance'>({
    name: 'zone-of-avoidance-upsample',
    sourceTargetId: 'zoa',
    fade: 'zoneOfAvoidance',
    handleOf: () => runtime.upsample,
    enabled: () => true,
  });
}
