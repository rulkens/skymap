/**
 * selectors — derived reads over AppState for the engine's per-frame use.
 *
 * `selectActiveFlowParams` resolves which mode's params are live.
 * `selectEnabledLayers` maps the view toggles into the layer-id Set the engine
 * gates encode passes on. `selectFrameParams` flattens the active flow params
 * plus the volume params into one number record — the exact shape
 * FrameContext.params expects, so a layer reads its knobs by key.
 *
 * IMPORTANT: `selectEnabledLayers` and `selectFrameParams` build a FRESH
 * object/Set on every call. That makes them unsafe for `useStore`
 * (useSyncExternalStore requires a cached snapshot) — they are intended for the
 * engine's direct `getSnapshot()` reads each frame, where a new object per
 * frame is expected. `selectActiveFlowParams` returns an existing reference and
 * is safe either way.
 */
import type { AppState } from '../../@types/state/AppState';
import type { FlowModeParams } from '../../@types/state/slices/FlowModeParams';

export function selectActiveFlowParams(s: Readonly<AppState>): FlowModeParams {
  return s.flow[s.flow.mode];
}

export function selectEnabledLayers(s: Readonly<AppState>): ReadonlySet<string> {
  const layers = new Set<string>();
  if (s.view.flowField) layers.add('flowField');
  if (s.view.densityVolume) layers.add('densityVolume');
  return layers;
}

export function selectFrameParams(s: Readonly<AppState>): Readonly<Record<string, number>> {
  const flow = selectActiveFlowParams(s);
  return {
    // The active flow MODE as a number (0 = advect, 1 = streamline). FrameContext.params
    // is a flat number record (no strings), but a layer still needs to know which mode is
    // live to pick its per-mode buffer set / pipeline / bind group and to set the WGSL
    // 'mode' uniform. Flattening the mode here keeps that the engine's single source of
    // truth, so the flow layer never reaches back into the store.
    modeIndex: s.flow.mode === 'advect' ? 0 : 1,
    count: flow.count,
    flowSpeed: flow.flowSpeed,
    densityBias: flow.densityBias,
    wander: flow.wander,
    trail: flow.trail,
    size: flow.size,
    exposure: flow.exposure,
    contrast: flow.contrast,
    intensity: s.volume.intensity,
    dMax: s.volume.dMax,
    alpha: s.volume.alpha,
  };
}
