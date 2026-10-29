/**
 * The Layer's one asset row: demand while the show toggle is on and the camera is near Earth,
 * release when it goes off or the camera is well away (spec §5.5). Earth's position comes from the
 * same instant the last frame derived its bodies at.
 */
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SATELLITE_FADES } from '../../../data/satellites/satelliteFades';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';

const cameraEarthKm = (ctx: DemandCtx): number =>
  distanceMpc(ctx.cameraPosMpc, deriveBodyStates(ctx.simDays).get(SCENE_EARTH.id)!.positionMpc) /
  SCALE_UNITS.KM_TO_MPC;

export function satellitesAssetRows(runtime: SatellitesRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'satellites',
      slot: runtime.slot,
      req: () => undefined,
      demand: (ctx) =>
        ctx.settings.satellites.enabled && cameraEarthKm(ctx) < SATELLITE_FADES.loadWithinKm,
      release: (ctx) =>
        !ctx.settings.satellites.enabled || cameraEarthKm(ctx) > SATELLITE_FADES.releaseBeyondKm,
      priority: 84, // next free rung after the Local Bubble (83)
      gates: 'satellites',
    },
  ];
}
