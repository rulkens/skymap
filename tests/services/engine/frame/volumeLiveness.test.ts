/**
 * deriveVolumeLiveness — the STATE-READ half of the projection both volume
 * layers consume: the renderer handle, the master toggle/fade, recession,
 * and the camera distance the pure core (`src/utils/volume/deriveVolumeLiveness.ts`)
 * needs. The clamp, the per-field band fold, and the `hasActiveFields` gate
 * are that core's tests (`tests/utils/volume/deriveVolumeLiveness.test.ts`).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveVolumeLiveness } from '../../../../src/services/engine/frame/volumeLiveness';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { CosmicWebDensityFieldId } from '../../../../src/@types/data/volume/CosmicWebDensityFieldId';

const FIELD_ID = 'mcpm' as CosmicWebDensityFieldId;

/**
 * Build a minimal ReadyFrameContext — deriveVolumeLiveness reads only
 * `nowMs`, `focusBlend`, and `drawCamPos` (the survey-fade key; the 5 Mpc
 * default sits far outside the band so it is factor 1 unless overridden).
 */
function makeCtx(
  over: { focusBlend?: number; drawCamPos?: Readonly<[number, number, number]> } = {},
): FrameView {
  const { focusBlend = 0, ...viewOver } = over;
  return {
    snapshot: { isReady: true, nowMs: 0, focusBlend },
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    ...viewOver,
  } as unknown as FrameView;
}

type StateInit = {
  renderer?: unknown;
  volumesEnabled?: boolean;
  masterOpacity?: number;
  fieldOpacity?: number;
};

function makeState(init: StateInit = {}): EngineState {
  // A `fades` stub whose opacityOf answers by FadeId kind so the master gate
  // and the per-field opacity multiplier can be driven independently.
  const opacityOf = (h: { kind: string }) =>
    h.kind === 'cosmicWebDensity' ? (init.masterOpacity ?? 1) : (init.fieldOpacity ?? 1);
  const renderer =
    init.renderer === undefined
      ? { hasActiveFields: () => true, listIds: () => [FIELD_ID] }
      : init.renderer;
  return {
    gpu: { volumeFieldRenderer: renderer },
    settings: {
      cosmicWebDensity: { enabled: init.volumesEnabled ?? true, items: {} },
    },
    subsystems: {
      fades: { opacityOf: vi.fn(opacityOf) },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('deriveVolumeLiveness', () => {
  it('returns null when the renderer is missing (pre-bootstrap)', () => {
    expect(deriveVolumeLiveness(makeState({ renderer: null }), makeCtx())).toBeNull();
  });

  it('returns null when master is off AND the master fade is fully out', () => {
    // cosmicWebDensity.enabled false and cosmicWebDensity opacity 0 → no live volume work.
    const state = makeState({ volumesEnabled: false, masterOpacity: 0 });
    expect(deriveVolumeLiveness(state, makeCtx())).toBeNull();
  });

  it('stays live through a master fade-out tail even with the toggle off', () => {
    // Toggle off but the master fade hasn't reached zero → still live so the
    // ~100 ms ramp keeps drawing.
    const state = makeState({ volumesEnabled: false, masterOpacity: 0.5 });
    expect(deriveVolumeLiveness(state, makeCtx())).not.toBeNull();
  });

  it('fadeOpacityOf multiplies the per-field fade by the recessed master', () => {
    // fieldOpacity 0.5, masterOpacity 1, no focus recession (blend 0) and no
    // clip → recessedMaster 1, so fadeOpacityOf(id) === 0.5 × 1.
    const state = makeState({ fieldOpacity: 0.5, masterOpacity: 1 });
    const liveness = deriveVolumeLiveness(state, makeCtx({ focusBlend: 0 }))!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBeCloseTo(0.5, 6);
  });
});
