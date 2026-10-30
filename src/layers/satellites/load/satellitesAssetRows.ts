/**
 * The Layer's one asset row: demand while a class is shown and the camera is near Earth, the
 * palette is open or a satellite is selected; release when every class is off or none of those
 * holds (spec §5.5). The selection arm (`selectedKinds`, set as soon as a link's ref lands) is
 * what lets a deep link to a satellite resolve from far away; core's selection wake re-runs this
 * demand. Earth's position comes from the same instant the last frame derived its bodies at.
 */
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SATELLITE_FADES } from '../../../data/satellites/satelliteFades';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';
import { visibilitySwitchOf } from '../../../utils/visibility/visibilitySwitchOf';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { satellitesVisibility } from '../visibility';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';

const SHOW_ENTRY = visibilityEntryOf(satellitesVisibility, 'satellites');

const cameraEarthKm = (ctx: DemandCtx): number =>
  distanceMpc(ctx.cameraPosMpc, deriveBodyStates(ctx.simDays).get(SCENE_EARTH.id)!.positionMpc) /
  SCALE_UNITS.KM_TO_MPC;

const anyClassShown = (ctx: DemandCtx): boolean =>
  SATELLITE_CLASSES.some((cls) => visibilitySwitchOf(ctx.settings, SHOW_ENTRY, cls));

export function satellitesAssetRows(runtime: SatellitesRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'satellites',
      slot: runtime.slot,
      req: () => undefined,
      // An open palette loads it too, so a satellite can be searched for from anywhere.
      demand: (ctx) =>
        anyClassShown(ctx) &&
        (ctx.ui.paletteOpen ||
          ctx.selectedKinds.has('satellite') ||
          cameraEarthKm(ctx) < SATELLITE_FADES.loadWithinKm),
      release: (ctx) =>
        !anyClassShown(ctx) ||
        (!ctx.ui.paletteOpen &&
          !ctx.selectedKinds.has('satellite') &&
          cameraEarthKm(ctx) > SATELLITE_FADES.releaseBeyondKm),
      priority: 84, // next free rung after the Local Bubble (83)
      // No `gates`: one file holds every class, and a gate names one item's whole data. The pass
      // draws nothing until a sweep lands, so the dots still wait for the catalog.
    },
  ];
}
