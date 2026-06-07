/**
 * commitStructureFocus — direct unit tests for the structure-side focus
 * protocol. Parallel to `commitGalaxyFocus.test.ts`:
 *   - selection + focus go through `setSelected` / `setFocused` with a
 *     `{kind:'structure', id}` Selection (the setters own `onFocusChange`,
 *     so the helper takes no `cb`);
 *   - tween distance comes from `structureFocusDistance`, not the galaxy path.
 *
 * Its own cam-null contract (only the tween is gated; selection + focus
 * still fire) differs from `focusOn`'s blanket guard — a wrong-direction
 * regression would silently strand deep-link drains that race bootstrap.
 */

import { describe, it, expect, vi } from 'vitest';

import { commitStructureFocus } from '../../../../src/services/engine/helpers/commitStructureFocus';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';

const FOV60 = (Math.PI / 180) * 60;

const virgo: StructureRecord = {
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
      fovYRad: FOV60,
    },
    subsystems: {
      selection: { setSelected: vi.fn(), setFocused: vi.fn(), selected: () => null },
      tweens: { start: vi.fn(), cancel: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;
}

describe('commitStructureFocus', () => {
  it('calls selection.setSelected with a structure-variant Selection', () => {
    const state = makeMockState();

    commitStructureFocus(state, virgo);

    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'structure',
      id: 'virgo-m87',
    });
  });

  it('latches the focus slot with the same structure-variant Selection', () => {
    const state = makeMockState();

    commitStructureFocus(state, virgo);

    // The focus slot — not just the selection slot — drives the
    // cluster-focus member-isolation fade in runFrame (and owns the
    // onFocusChange URL-hash fan-out).  A bare single-click select must
    // NOT set it, but a focus commit must.
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith({
      kind: 'structure',
      id: 'virgo-m87',
    });
  });

  it('starts a tween with structureFocusDistance', () => {
    const state = makeMockState();
    commitStructureFocus(state, virgo);
    expect(state.subsystems.tweens.start).toHaveBeenCalledTimes(1);
    const startMock = state.subsystems.tweens.start as ReturnType<typeof vi.fn>;
    const firstCall = startMock.mock.calls[0];
    if (!firstCall) throw new Error('tweens.start was not called');
    const payload = firstCall[0];
    // Virgo has no apparentRadiusMpc → frames the physical core (2 Mpc) at the
    // camera's 60° FOV. Asserts against the helper so the framing law has one
    // source of truth.
    expect(payload.toDistance).toBe(structureFocusDistance(2, FOV60));
    expect(Array.from(payload.toTarget)).toEqual([10, 0, 0]);
  });

  it('skips the tween when state.cam is null, but still updates selection + focus', () => {
    const state = makeMockState();
    (state as unknown as { cam: unknown }).cam = null;
    commitStructureFocus(state, virgo);
    // Tween is skipped because cam is null (tweenToStructure absorbs the
    // guard), but selection + focus still fire — they can land before
    // the camera is ready, and the deep-link drain depends on that
    // ordering.
    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith({
      kind: 'structure',
      id: 'virgo-m87',
    });
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith({
      kind: 'structure',
      id: 'virgo-m87',
    });
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
  });
});
