/**
 * Selectors — verifies the deriving reads the engine uses each frame.
 *
 * `selectActiveFlowParams` resolves the params object for whichever mode is
 * live; `selectEnabledLayers` maps the view toggles to the layer-id set the
 * engine gates on; `selectFrameParams` flattens active flow + volume tunables
 * into one number record (the shape FrameContext.params expects). These build
 * fresh objects, so they're for direct getSnapshot() use, never useStore.
 */
import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/cosmic-flow/src/state/defaultAppState';
import { defaultVolumeSlice } from '../../../../tools/cosmic-flow/src/state/slices/volumeSlice';
import {
  selectActiveFlowParams,
  selectEnabledLayers,
  selectFrameParams,
} from '../../../../tools/cosmic-flow/src/state/selectors';
import type { AppState } from '../../../../tools/cosmic-flow/@types/state/AppState';

describe('selectors', () => {
  it('selectActiveFlowParams returns the streamline params when mode is streamline', () => {
    expect(selectActiveFlowParams(defaultAppState)).toEqual(defaultAppState.flow.streamline);
  });

  it('selectActiveFlowParams returns the advect params when mode is advect', () => {
    const state: AppState = {
      ...defaultAppState,
      flow: { ...defaultAppState.flow, mode: 'advect' },
    };
    expect(selectActiveFlowParams(state)).toEqual(defaultAppState.flow.advect);
  });

  it('selectEnabledLayers contains flowField and excludes densityVolume for defaultAppState', () => {
    const layers = selectEnabledLayers(defaultAppState);
    expect(layers.has('flowField')).toBe(true);
    expect(layers.has('densityVolume')).toBe(false);
  });

  it('selectFrameParams exposes the active flow params + volume params', () => {
    const params = selectFrameParams(defaultAppState);
    const flow = defaultAppState.flow.streamline;
    expect(params.count).toBe(flow.count);
    expect(params.flowSpeed).toBe(flow.flowSpeed);
    expect(params.densityBias).toBe(flow.densityBias);
    expect(params.wander).toBe(flow.wander);
    expect(params.trail).toBe(flow.trail);
    expect(params.size).toBe(flow.size);
    expect(params.exposure).toBe(flow.exposure);
    expect(params.contrast).toBe(flow.contrast);
    expect(params.intensity).toBe(defaultVolumeSlice.intensity);
    expect(params.dMax).toBe(defaultVolumeSlice.dMax);
    expect(params.alpha).toBe(defaultVolumeSlice.alpha);
  });

  it('selectFrameParams exposes modeIndex (1 for streamline, 0 for advect)', () => {
    expect(selectFrameParams(defaultAppState).modeIndex).toBe(1);
    const advectState: AppState = {
      ...defaultAppState,
      flow: { ...defaultAppState.flow, mode: 'advect' },
    };
    expect(selectFrameParams(advectState).modeIndex).toBe(0);
  });
});
