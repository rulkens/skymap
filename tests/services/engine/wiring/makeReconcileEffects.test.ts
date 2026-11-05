/**
 * makeReconcileEffects — unit tests for the ReconcileEffects factory.
 *
 * Strategy: build a minimal fake EngineState with typed spy subsystems that
 * cover only the slices the closures touch. vi.mock syncVisibilityTargets so each
 * closure test stays focused on the factory wiring, not the deeper sync walk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { makeReconcileEffects } from '../../../../src/services/engine/wiring/makeReconcileEffects';

// Mock the sync so the syncFades tests don't need a fully populated settings tree.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityTargets', () => ({
  syncVisibilityTargets: vi.fn<(state: unknown, overMs?: number) => void>(),
}));

// Mock the applySwapFormat phase so the forwarding test doesn't need a real
// gpu.renderTargets/uiCtx pair — see applySwapFormat.test.ts for that unit's
// own coverage.
vi.mock('../../../../src/services/engine/phases/applySwapFormat', () => ({
  applySwapFormat: vi.fn<(state: unknown, desired: GPUTextureFormat) => void>(),
}));

// Mock the logCameraState helper so the forwarding test doesn't need a real
// OrbitCamera/canvas pair — see logCameraState.test.ts for that unit's own
// coverage of the logged blob's shape.
vi.mock('../../../../src/services/engine/helpers/logCameraState', () => ({
  logCameraState: vi.fn(),
}));

// Mock the pose assembly so the forwarding test only asserts THIS factory calls it and
// forwards its result; liveRenderCamera.test.ts covers the assembly itself.
vi.mock('../../../../src/services/engine/helpers/liveRenderCamera', () => ({
  liveRenderCamera: vi.fn(() => 'LIVE_CAM'),
}));

import { syncVisibilityTargets } from '../../../../src/services/engine/wiring/syncVisibilityTargets';
import { applySwapFormat } from '../../../../src/services/engine/phases/applySwapFormat';
import { logCameraState } from '../../../../src/services/engine/helpers/logCameraState';
import { liveRenderCamera } from '../../../../src/services/engine/helpers/liveRenderCamera';
import { bodySelectionRow } from '../../../../src/layers/body/selection/present/bodySelectionRow';
import { bodyPickCodes } from '../../../support/layerPickCodes';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

const CANVAS = {} as HTMLCanvasElement;
const BODY_ROWS = bodySelectionRow({ pickCodes: bodyPickCodes() });
const MARS_REF = { type: 'body', id: asSceneBodyId('mars') } as const;

// ── Fake EngineState builder ──────────────────────────────────────────────────
//
// Only the slices the closures touch are populated. Everything else is
// absent; `as unknown as EngineState` bridges the gap (matching the pattern
// used in the other wiring tests).

function makeState(): {
  state: EngineState;
  requestRender: ReturnType<typeof vi.fn<() => void>>;
} {
  const requestRender = vi.fn<() => void>();

  const state = {
    subsystems: {
      scheduler: { requestRender },
    },
    booted: false,
    selection: { hover: null, select: null, focus: MARS_REF },
    selectionKindRows: [BODY_ROWS],
    // Stored at J2000: the instant the live clock has long left.
    selectionRows: {
      hover: null,
      select: null,
      focus: BODY_ROWS.extractRow(MARS_REF, CONST_J2000),
    },
    cameraRuntime: { outputs: { simDays: 2461272.948547558, displayed: 'DISPLAYED_ARM' } },
  } as unknown as EngineState;

  return { state, requestRender };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('makeReconcileEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncFades() recomputes every visibility target', () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state, CANVAS);
    effects.syncFades();
    expect(syncVisibilityTargets).toHaveBeenCalledTimes(1);
    expect(syncVisibilityTargets).toHaveBeenCalledWith(state, undefined);
  });

  it("applySwapFormat('rgba16float') forwards to the applySwapFormat phase with state", () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state, CANVAS);
    effects.applySwapFormat('rgba16float');
    expect(applySwapFormat).toHaveBeenCalledTimes(1);
    expect(applySwapFormat).toHaveBeenCalledWith(state, 'rgba16float');
  });

  it('the logged focus row is re-extracted at the live simDays', () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state, CANVAS);
    effects.logCameraState();

    const { simDays } = state.cameraRuntime.outputs;
    const live = BODY_ROWS.extractRow(MARS_REF, simDays);
    expect(liveRenderCamera).toHaveBeenCalledWith(state);
    expect(logCameraState).toHaveBeenCalledTimes(1);
    expect(logCameraState).toHaveBeenCalledWith('LIVE_CAM', CANVAS, live, simDays, 'DISPLAYED_ARM');
    // Mars has moved since the stored row's instant, so a pass-through would fail above.
    expect(live).not.toEqual(state.selectionRows.focus);
  });
});
