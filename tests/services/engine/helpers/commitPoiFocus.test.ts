/**
 * commitPoiFocus — direct unit tests for the POI-side focus protocol.
 *
 * Parallel to `commitGalaxyFocus.test.ts` but tailored to the POI shape:
 *   - Selection update goes through `selection.setSelected` with a
 *     `{kind:'poi', id}` Selection.
 *   - Focus update goes through `selection.setFocused` with the same
 *     Selection — the setter owns the `onFocusChange` fan-out, so the
 *     helper no longer takes a `cb`.
 *   - Tween distance comes from `poiFocusDistance(category, radiusMpc)`,
 *     NOT the galaxy `galaxyFocusDistance(diameterKpc)`.
 *
 * Why a separate suite: the helper has its own cam-null contract (only
 * the tween is gated; selection + focus still fire) which differs from
 * `focusOn`'s blanket cam-null guard at the engine.ts call site.  A
 * wrong-direction regression here would silently strand deep-link
 * drains that race bootstrap.
 */

import { describe, it, expect, vi } from 'vitest';

import { commitPoiFocus } from '../../../../src/services/engine/helpers/commitPoiFocus';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
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
      selection: { setSelected: vi.fn(), setFocused: vi.fn(), selected: () => null },
      tweens: { start: vi.fn(), cancel: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;
}

describe('commitPoiFocus', () => {
  it('calls selection.setSelected with a poi-variant Selection', () => {
    const state = makeMockState();

    commitPoiFocus(state, virgo);

    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
  });

  it('latches the focus slot with the same poi-variant Selection', () => {
    const state = makeMockState();

    commitPoiFocus(state, virgo);

    // The focus slot — not just the selection slot — drives the
    // cluster-focus member-isolation fade in runFrame (and owns the
    // onFocusChange URL-hash fan-out).  A bare single-click select must
    // NOT set it, but a focus commit must.
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
  });

  it('starts a tween with poiFocusDistance', () => {
    const state = makeMockState();
    commitPoiFocus(state, virgo);
    expect(state.subsystems.tweens.start).toHaveBeenCalledTimes(1);
    const startMock = state.subsystems.tweens.start as ReturnType<typeof vi.fn>;
    const firstCall = startMock.mock.calls[0];
    if (!firstCall) throw new Error('tweens.start was not called');
    const payload = firstCall[0];
    // Virgo: 2 Mpc radius × 8 (cluster multiplier) = 16 Mpc framing distance.
    expect(payload.toDistance).toBe(16);
    expect(Array.from(payload.toTarget)).toEqual([10, 0, 0]);
  });

  it('skips the tween when state.cam is null, but still updates selection + focus', () => {
    const state = makeMockState();
    (state as unknown as { cam: unknown }).cam = null;
    commitPoiFocus(state, virgo);
    // Tween is skipped because cam is null (tweenToPoi absorbs the
    // guard), but selection + focus still fire — they can land before
    // the camera is ready, and the deep-link drain depends on that
    // ordering.
    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith({
      kind: 'poi',
      id: 'virgo-m87',
    });
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
  });
});
