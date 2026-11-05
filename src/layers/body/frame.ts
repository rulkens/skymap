/**
 * surfaceTilePlanner — the Layer's once-per-frame tile row: plan the cut over every
 * view, apply it to the stream, and keep the result on the runtime, where the passes,
 * capture faces and the terrain seam read it (a capture face's plans store is empty).
 * The value is unused; the wake vote carries a manifest or tile fetch through, and the
 * same fetch votes `settling`, so the cold-load gate (`sceneSettled`) waits for it. While
 * the DebugPanel is open it publishes the tile readouts through the runtime's
 * `readoutGate`: a dispatch per frame would re-render the panel at the loop's rate.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { BodyRuntime } from './@types/BodyRuntime';
import { planSurfaceTiles } from './surfaceTiles/plan/subsystems/planSurfaceTiles';
import { surfaceTileOverOf } from './surfaceTiles/plan/subsystems/surfaceTileOverOf';
import { surfaceTileDebugSnapshotOf } from './surfaceTiles/debug/subsystems/surfaceTileDebugSnapshotOf';
import { bodySurfaceTier } from './textures/load/bodySurfaceTier';
import {
  NO_TERRAIN_PICK_MARKER_READOUT,
  terrainPickMarkerReadoutOf,
} from './terrainPick/present/terrainPickMarkerReadoutOf';

export function surfaceTilePlanner(
  runtime: BodyRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  return {
    name: 'surface-tiles',
    scope: 'once',
    plan(snapshot, views, state) {
      const tiles = runtime.surfaceTiles;
      tiles.plan = planSurfaceTiles(views, surfaceTileOverOf(views), tiles.stream.residency, (id) =>
        bodySurfaceTier(runtime.textureSlots, state.tier, id),
      );
      tiles.stream.apply(tiles.plan);
      if (runtime.debugPanelOpen() && runtime.readoutGate.pass(snapshot.nowMs)) {
        const eyeView = views[0];
        runtime.publish({
          surfaceTileDebug: surfaceTileDebugSnapshotOf(tiles),
          // The pick marches the terrain: a cost only the overlay's reader pays.
          terrainPickMarker:
            state.settings.terrainPickMarker.enabled && eyeView !== undefined
              ? terrainPickMarkerReadoutOf(tiles, eyeView, runtime.terrainPickCursor.texPx)
              : NO_TERRAIN_PICK_MARKER_READOUT,
        });
      }
      return { value: undefined, awake: tiles.plan.awake, settling: tiles.plan.awake };
    },
  };
}
