// tests/services/engine/helpers/commitPoiFocus.test.ts
/**
 * commitPoiFocus — direct unit tests for the POI-side focus protocol.
 *
 * Parallel to `commitFocus.test.ts` but tailored to the POI shape:
 *   - Selection update goes through `state.subsystems.pois.setSelectedPoi`.
 *   - React fan-out goes through `cb.camera?.onPoiFocusChange`.
 *   - Tween distance comes from `poiFocusDistanceMpc(category, radiusMpc)`,
 *     NOT the galaxy `focusDistanceMpc(diameterKpc)`.
 *
 * Why a separate suite: the helper has its own cam-null contract (only
 * the tween is gated; subsystem + callback still fire) which differs
 * from `commitFocus`'s blanket cam-null guard at the engine.ts call
 * site.  A wrong-direction regression here would silently strand
 * deep-link drains that race bootstrap.
 */

import { describe, it, expect, vi } from 'vitest';

import { commitPoiFocus } from '../../../../src/services/engine/helpers/commitPoiFocus';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2,
};

function makeMockState(): EngineState {
  return {
    cam: {
      target: new Float32Array([0, 0, 0]),
      distance: 100,
      yaw: 0,
      pitch: 0,
    },
    subsystems: {
      selection: { setSelected: vi.fn(), selected: () => null },
      tweens: { start: vi.fn(), cancel: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;
}

function makeMockCb(): EngineCallbacks {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onSelectChange: vi.fn(), onHoverChange: vi.fn() },
    camera: { onPoiFocusChange: vi.fn() },
  } as unknown as EngineCallbacks;
}

describe('commitPoiFocus', () => {
  it('calls selection.setSelected with a poi-variant Selection when tween is false', () => {
    const state = makeMockState();
    const cb = makeMockCb();

    commitPoiFocus(state, cb, virgo, { tween: false });

    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
  });

  it('starts a tween with poiFocusDistanceMpc when tween is true', () => {
    const state = makeMockState();
    const cb = makeMockCb();
    commitPoiFocus(state, cb, virgo, { tween: true });
    expect(state.subsystems.tweens.start).toHaveBeenCalledTimes(1);
    const startMock = state.subsystems.tweens.start as ReturnType<typeof vi.fn>;
    const firstCall = startMock.mock.calls[0];
    if (!firstCall) throw new Error('tweens.start was not called');
    const payload = firstCall[0];
    // Virgo: 2 Mpc radius × 8 (cluster multiplier) = 16 Mpc framing distance.
    expect(payload.toDistance).toBe(16);
    // Target is virgo.worldPos.
    expect(Array.from(payload.toTarget)).toEqual([10, 0, 0]);
  });

  it('is a no-op for the tween branch when state.cam is null, but still updates selection', () => {
    const state = makeMockState();
    (state as unknown as { cam: unknown }).cam = null;
    const cb = makeMockCb();
    commitPoiFocus(state, cb, virgo, { tween: true });
    // Tween is skipped because cam is null, but the selection update
    // still fires — selection state can update before the camera is
    // ready, and the deep-link drain depends on that ordering.
    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
  });
});
