import type { RootState } from '../../../store/types';
import type { SurfaceTileDebugSnapshot } from '../@types/SurfaceTileDebugSnapshot';
import { selectEngineFacts } from '../../../state/engine/selectors';
import { EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT } from '../subsystems/surfaceTiles/surfaceTileStream';

/** The body Layer's tile readout; the empty snapshot before `createLayers` seeds the fact. */
export const selectSurfaceTileDebug = (state: RootState): SurfaceTileDebugSnapshot =>
  selectEngineFacts(state).body?.surfaceTileDebug ?? EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT;
