import type { AppState } from '../../@types/AppState';
import { gridShapeOf } from './gridShapeOf';

/**
 * buildKey — everything but catalog identity: a change here reuses already-loaded points but
 * still forces a harness rebuild (Viewport.tsx's `requestBuild`, debounced). `grid.importedBox`:
 * loading a preset must rebuild even when none of `gridShapeOf`'s fields moved — deriveGridBox
 * reads the override VERBATIM, so the box itself, not voxel size/manual bounds, is what changed.
 * `gridShapeOf` spreads in every field a gizmo drag can write into `grid` — see its docstring for
 * why that's a single Pick rather than a hand-spelled list.
 */
export function buildKey(s: AppState): unknown[] {
  return [
    s.catalog.weightMode,
    ...Object.values(gridShapeOf(s.grid)),
    s.grid.importedBox,
    s.sim.agentCount,
    s.sim.initMode,
    s.sim.seed,
  ];
}
