/**
 * uploadVolumeField — verifies the one volume-field ingest path: seed the
 * settings row, then upload the cube to the renderer, in that order. The
 * arrival fade is core's edge (`installFadeOnArrival`), not this path's.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';
import type { AppStore } from '../../../../src/store/types';
import { addVolumeField } from '../../../../src/layers/volume/settings/volumesSlice';
import type { ApplyIntentState } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { uploadVolumeField } from '../../../../src/services/engine/volume/uploadVolumeField';

const fieldId = 'cf4-density' as VolumeFieldId;

function fakeCube(): ScalarCube {
  return { dims: [4, 4, 4] } as unknown as ScalarCube;
}

// Minimal fake state — the function touches only the volume renderer's
// `upload` and the request-render scheduler; `as unknown` lets us hand it a
// stub without modelling the whole EngineState tree.
function fakeState(renderer: { upload: ReturnType<typeof vi.fn> } | null): ApplyIntentState {
  return {
    gpu: { volumeFieldRenderer: renderer },
    subsystems: { scheduler: { requestRender: vi.fn() } },
  } as unknown as ApplyIntentState;
}

describe('uploadVolumeField', () => {
  it('dispatches the settings-row seed before uploading the cube', () => {
    const upload = vi.fn();
    const state = fakeState({ upload });
    const store = { dispatch: vi.fn() } as unknown as AppStore;
    const cube = fakeCube();

    uploadVolumeField(state, store, fieldId, cube);

    expect(store.dispatch).toHaveBeenCalledWith(addVolumeField(fieldId));
    expect(upload).toHaveBeenCalledWith(fieldId, cube);
    const dispatchOrder = (store.dispatch as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const uploadOrder = upload.mock.invocationCallOrder[0]!;
    expect(dispatchOrder).toBeLessThan(uploadOrder);
  });
});
