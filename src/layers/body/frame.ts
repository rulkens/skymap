/**
 * surfaceTilePlanner — the Layer's once-per-frame tile row: plan the cut over every
 * view, apply it to the stream, and keep the result on the runtime, where the passes,
 * capture faces and the terrain seam read it (a capture face's plans store is empty).
 * The value is unused; the wake vote carries a manifest or tile fetch through. While
 * the DebugPanel is open it publishes the tile readouts, throttled: a dispatch per
 * frame would re-render the panel at the loop's rate.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { BodyRuntime } from './@types/BodyRuntime';
import { throttleByTime } from '../../utils/throttle/throttleByTime';
import { planSurfaceTiles } from './subsystems/surfaceTiles/planSurfaceTiles';
import { surfaceTileOverOf } from './subsystems/surfaceTiles/surfaceTileOverOf';
import { surfaceTileDebugSnapshotOf } from './subsystems/surfaceTiles/surfaceTileDebugSnapshotOf';
import { bodySurfaceTier } from './load/bodySurfaceTier';
import {
  NO_TERRAIN_PICK_MARKER_READOUT,
  terrainPickMarkerReadoutOf,
} from './present/terrainPickMarkerReadoutOf';

/** The rate every textual DebugPanel readout refreshes at. */
const READOUT_INTERVAL_MS = 250;

export function surfaceTilePlanner(
  runtime: BodyRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  const readoutGate = throttleByTime(READOUT_INTERVAL_MS);
  return {
    name: 'surface-tiles',
    scope: 'once',
    plan(snapshot, views, state) {
      const tiles = runtime.surfaceTiles;
      tiles.plan = planSurfaceTiles(views, surfaceTileOverOf(views), tiles.stream.residency, (id) =>
        bodySurfaceTier(runtime.textureSlots, state.tier, id),
      );
      tiles.stream.apply(tiles.plan);
      if (runtime.debugPanelOpen() && readoutGate(snapshot.nowMs)) {
        const eyeView = views[0];
        runtime.publish({
          surfaceTileDebug: surfaceTileDebugSnapshotOf(tiles),
          // The pick marches the terrain: a cost only the overlay's reader pays.
          terrainPickMarker:
            state.settings.debug.overlays['terrain-pick-marker'] && eyeView !== undefined
              ? terrainPickMarkerReadoutOf(tiles, eyeView, snapshot.cursorTexPx)
              : NO_TERRAIN_PICK_MARKER_READOUT,
        });
      }
      return { value: undefined, awake: tiles.plan.awake, settling: false };
    },
  };
}
