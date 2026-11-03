import { describe, expect, it } from 'vitest';

import { selectDomeStatus } from '../../../src/state/remote/selectDomeStatus';
import { stateAfter } from '../../fixtures/stateAfter';
import { setControlScheme } from '../../../src/state/settings/core/cameraControlsSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { takeoverStarted } from '../../../src/state/takeover/takeoverActions';
import { beatChanged, setPaused } from '../../../src/state/tour/tourSlice';
import { setSimDays } from '../../../src/state/time/timeSlice';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { bodyDriverGeometry } from '../../../src/utils/scene/bodyDriverGeometry';
import type { ToggleRow } from '../../../src/@types/settings/ToggleRow';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';

const NO_ROWS: readonly ToggleRow[] = [];

describe('selectDomeStatus', () => {
  it('reports the camera scheme', () => {
    expect(selectDomeStatus(stateAfter(), NO_ROWS, 0).controls.scheme).toBe('skymap');
    const state = stateAfter(setControlScheme('openspace'));
    expect(selectDomeStatus(state, NO_ROWS, 0).controls.scheme).toBe('openspace');
  });

  it('reports nothing running as null', () => {
    expect(selectDomeStatus(stateAfter(), NO_ROWS, 0).takeover).toBeNull();
  });

  it('reports a running exhibit by kind and id, without its entry', () => {
    const state = stateAfter(takeoverStarted({ kind: 'exhibit', id: 'cosmicFlows', entry: 'fly' }));
    expect(selectDomeStatus(state, NO_ROWS, 0).takeover).toStrictEqual({
      kind: 'exhibit',
      id: 'cosmicFlows',
    });
  });

  it('reports a running clip by kind and id', () => {
    const state = stateAfter(takeoverStarted({ kind: 'clip', id: 'flyout' }));
    expect(selectDomeStatus(state, NO_ROWS, 0).takeover).toStrictEqual({
      kind: 'clip',
      id: 'flyout',
    });
  });

  it("reports a running tour's beat, count and paused state", () => {
    const state = stateAfter(
      takeoverStarted({ kind: 'tour', id: 'grandTour' }),
      beatChanged(3),
      setPaused(true),
    );
    expect(selectDomeStatus(state, NO_ROWS, 0).takeover).toEqual({
      kind: 'tour',
      id: 'grandTour',
      beatIndex: 3,
      beatCount: tourRegistry.grandTour.beats.length,
      paused: true,
    });
  });

  it('names a focused body, Earth included', () => {
    const state = stateAfter(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: asSceneBodyId('earth'),
          label: 'Earth',
          positionMpc: [0, 0, 0],
          driver: bodyDriverGeometry('earth'),
        },
        focusId: 'body-earth',
      }),
    );
    expect(selectDomeStatus(state, NO_ROWS, 0).focus).toEqual({ name: 'Earth' });
  });

  it('names a focused galaxy as its card does', () => {
    const famous = {
      id: 'm31',
      commonName: 'Andromeda Galaxy',
      names: ['M31', 'NGC 224'],
      description: '',
      type: 'Sb',
    };
    const row = makeGalaxyRow({ x: 0.5, y: 0.2, z: 0.6, famous });
    const state = stateAfter(setSelectionRow({ slot: 'focus', row, focusId: 'famous-m31' }));
    expect(selectDomeStatus(state, NO_ROWS, 0).focus).toEqual({ name: 'Andromeda Galaxy' });
  });

  it('derives simDays at the nowMs it is handed', () => {
    const state = stateAfter(setSimDays({ simDays: 2451545, nowMs: 1000 }));
    expect(selectDomeStatus(state, NO_ROWS, 1000).time.simDays).toBe(2451545);
    expect(selectDomeStatus(state, NO_ROWS, 61_000).time.simDays).toBeGreaterThan(2451545);
  });
});
