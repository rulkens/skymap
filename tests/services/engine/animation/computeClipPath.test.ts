import { describe, it, expect, vi } from 'vitest';
import { createClipPathInspectSeam } from '../../../../src/services/engine/animation/computeClipPath';
import { resolveClipStart } from '../../../../src/state/camera/cameraSlice';
import { clipRegistry } from '../../../../src/data/animation/clips/clipRegistry';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { ClipPathSnapshot } from '../../../../src/@types/engine/debug/ClipPathSnapshot';

function fakeInspector() {
  return {
    setSnapshot: vi.fn<(snapshot: ClipPathSnapshot) => void>(),
    clear: vi.fn<() => void>(),
    current: vi.fn<() => ClipPathSnapshot | null>(() => null),
    destroy: vi.fn<() => void>(),
  };
}

const LIVE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 };

describe('createClipPathInspectSeam', () => {
  it('compute() samples the clip and hands the snapshot to the inspector', () => {
    const inspector = fakeInspector();
    const seam = createClipPathInspectSeam({
      inspector,
      getLivePose: () => LIVE_POSE,
      sampleCount: 8,
    });

    // flyout is focus-free, so registry data is already a resolved ClipData.
    seam.compute('flyout', clipRegistry['flyout'].data);

    expect(inspector.setSnapshot).toHaveBeenCalledOnce();
    const snap = inspector.setSnapshot.mock.calls[0]![0]!;
    expect(snap.clipId).toBe('flyout');
    expect(snap.durationSec).toBeGreaterThan(0);
    expect(snap.samples).toHaveLength(8);
  });

  it('clear() clears the inspector', () => {
    const inspector = fakeInspector();
    const seam = createClipPathInspectSeam({
      inspector,
      getLivePose: () => LIVE_POSE,
      sampleCount: 8,
    });
    seam.clear();
    expect(inspector.clear).toHaveBeenCalledOnce();
  });

  it('pinnedClip() holds the start-pinned clip after compute — null before and after clear', () => {
    const inspector = fakeInspector();
    const seam = createClipPathInspectSeam({
      inspector,
      getLivePose: () => LIVE_POSE,
      sampleCount: 8,
    });
    // The pinned clip is the replay source: foci already resolved + start pinned
    // to the live pose at compute time, so a later play flies the EXACT route.
    expect(seam.pinnedClip()).toBeNull();
    seam.compute('flyout', clipRegistry['flyout'].data);
    expect(seam.pinnedClip()).toEqual(resolveClipStart(clipRegistry['flyout'].data, LIVE_POSE));
    seam.clear();
    expect(seam.pinnedClip()).toBeNull();
  });
});
