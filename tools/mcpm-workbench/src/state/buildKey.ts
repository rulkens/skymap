import type { AppState } from '../../@types/AppState';

/**
 * buildKey — everything but catalog identity: a change here reuses already-loaded points but
 * still forces a harness rebuild (Viewport.tsx's `requestBuild`, debounced). `grid.importedBox`
 * (V3): loading a preset must rebuild even when none of the raw config fields below moved —
 * deriveGridBox reads the override VERBATIM, so the box itself, not voxel size/manual bounds, is
 * what changed. Every field a gizmo drag can write into `grid` belongs in this list — omitting
 * one (as `manualRotation` was, until F2.5's rotate rings shipped) makes that edit reach
 * `deriveGridBox` (so a re-export/re-render sees it) while the RUNNING sim never rebuilds against
 * it: two different "the pending box changed" checks silently disagreeing.
 */
export function buildKey(s: AppState): unknown[] {
  return [
    s.catalog.weightMode,
    s.grid.manualVoxelSizeMpc,
    s.grid.paddingMpc,
    s.grid.manualCenterMpc,
    s.grid.manualSizeMpc,
    s.grid.manualRotation,
    s.grid.importedBox,
    s.sim.agentCount,
    s.sim.initMode,
    s.sim.seed,
  ];
}
