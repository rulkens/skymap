/**
 * seatSurfaceSites — the frame's body snapshot with each surface site lifted by its own offset
 * along its radial, on top of the baked `SITE_GROUND_HEIGHTS` (the DebugPanel's live seat tuning).
 * Radial, as the baked height and `altitudeM` are, so a tuned value adds straight onto the bake.
 * The radial comes from the derived positions, as `rotationSurfaceLocked`'s does, so the facing
 * holds. No offset hands `base` back itself.
 */
import type { BodyState } from '../../../@types/scene/BodyState';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { SURFACE_FIXED_SITES } from '../../../data/bodies/surfaceFixedSites';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { normalize3 } from '../../../../packages/shared/src/utils/math/normalize3';

export function seatSurfaceSites(
  base: ReadonlyMap<PositionedId, BodyState>,
  offsetsM: Readonly<Record<string, number>>,
): ReadonlyMap<PositionedId, BodyState> {
  let seated: Map<PositionedId, BodyState> | null = null;
  for (const site of SURFACE_FIXED_SITES) {
    const offsetM = offsetsM[site.id] ?? 0;
    if (offsetM === 0) continue;
    const state = base.get(site.id)!;
    const [x, y, z] = state.positionMpc;
    const host = base.get(site.hostId)!.positionMpc;
    const [ux, uy, uz] = normalize3([x - host[0], y - host[1], z - host[2]]);
    const liftMpc = offsetM * SCALE_UNITS.M_TO_MPC;
    seated ??= new Map(base);
    seated.set(site.id, {
      ...state,
      positionMpc: [x + ux * liftMpc, y + uy * liftMpc, z + uz * liftMpc],
    });
  }
  return seated ?? base;
}
