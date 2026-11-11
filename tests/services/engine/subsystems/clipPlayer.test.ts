/**
 * clipPlayer against a real store, real compile and the real epoch primitives. Only the engine
 * hooks are fakes: `syncVisibility` and `fades` record what reached the fade registry (the seed
 * table knows two identities, flow and the Milky Way label), and the camera runtime hands a fixed
 * up-basis to a frame roll. `makePlayer` threads the returned clip
 * epoch back into the next tick, as `runFrame` does.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore, type Action } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import {
  clipStarted,
  clipEnded,
  clipDataReplaced,
  clipTransportSet,
  clearFrameTween,
  resolveClipStart,
  startFrameTween,
} from '../../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import {
  UNSTARTED_EPOCHS,
  elapsedMs,
} from '../../../../src/services/engine/camera/drivers/cameraEpochs';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { setFlowEnabled } from '../../../../src/layers/flow/state/flow/slice';
import { mergeSnapshot } from '../../../../src/state/settings/mergeSnapshotAction';
import { setOrientation } from '../../../../src/state/settings/core/orientationSlice';
import { updateSelectionFocus } from '../../../../src/state/selection/selectionSlice';
import { FRAME_TWEEN_MS } from '../../../../src/state/camera/watchOrientationChangeSaga';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import {
  fade,
  frameTo,
  hide,
  hold,
  seq,
  show,
  wait,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { CameraPose } from '../../../../src/@types/camera/pose/CameraPose';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { ClipSceneEnd } from '../../../../src/@types/animation/ClipSceneEnd';
import type { CameraEpochs } from '../../../../src/@types/engine/camera/CameraEpochs';
import type { CameraRuntime } from '../../../../src/@types/engine/state/CameraRuntime';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { SelectionRefBase } from '../../../../src/@types/engine/selection/SelectionRefBase';
import type { FadeIdentity } from '../../../../src/@types/animation/FadeIdentity';
import type { ClipTransport } from '../../../../src/@types/animation/ClipTransport';

const LIVE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const VIRGO = { type: 'structure', id: 'virgo' };
const VIRGO_ROW = { row: { type: 'structure' }, focusId: 'virgo' };
const FLOW: FadeIdentity = { address: 'flow' };
const MW_LABEL: FadeIdentity = { address: 'label:milkyWay' };

type TestStore = ReturnType<typeof makeStore>;

function makeStore() {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setFlowEnabled(false));
  return store;
}

function installClip(store: TestStore, data: ClipData, atEnd: ClipSceneEnd = 'revert'): void {
  const resolved = resolveClipStart(data, LIVE_POSE);
  store.dispatch(clipStarted({ data: resolved, frame: DEFAULT_ORIENTATION, atEnd }));
}

function transportClip(store: TestStore, data: ClipData, transport: ClipTransport): void {
  installClip(store, data);
  store.dispatch(clipTransportSet(transport));
}

function makePlayer(store: TestStore) {
  const syncVisibility = vi.fn<(settings: EngineSettingsState, overMs?: number) => void>();
  // Each identity's target, starting where intent puts it (flow off, the label on).
  const targets = new Map([
    [FLOW.address, 0],
    [MW_LABEL.address, 1],
  ]);
  const fades = {
    setImmediate: vi.fn((id: FadeIdentity, value: number) => void targets.set(id.address, value)),
    fadeTo: vi.fn((id: FadeIdentity, to: number, _ms: number) => void targets.set(id.address, to)),
    targetOf: (id: FadeIdentity) => targets.get(id.address) ?? null,
  };
  const extractFocusRow = vi.fn((ref: SelectionRefBase | null) =>
    ref === null ? { row: null, focusId: null } : VIRGO_ROW,
  );
  const runtime = { outputs: { upBasis: IDENTITY_MAT3 } } as unknown as CameraRuntime;
  const player = createClipPlayer({
    store,
    getCameraRuntime: () => runtime,
    extractFocusRow,
    syncVisibility,
    visibilityTargets: (list) => [
      { id: FLOW, targets: list.map((s) => (s.flow.enabled ? 1 : 0)) },
      { id: MW_LABEL, targets: list.map((s) => (s.milkyWay.labelEnabled ? 1 : 0)) },
    ],
    getFades: () => fades,
  });
  let epoch: CameraEpochs['clip'] = UNSTARTED_EPOCHS.clip;
  const tick = (nowMs: number): CameraEpochs['clip'] => {
    epoch = player.tick(epoch, nowMs).clipEpoch;
    return epoch;
  };
  const view = () => player.view(store.getState());
  return { player, tick, view, syncVisibility, extractFocusRow, fades };
}

const typesOf = (calls: readonly (readonly unknown[])[]) => calls.map((c) => (c[0] as Action).type);

describe('clipPlayer scene', () => {
  it('a show step reaches the view at its atSec and the store is never written mid-clip', () => {
    const store = makeStore();
    const { tick, view } = makePlayer(store);
    installClip(store, { timeline: [seq([wait(1), show(['flow']), hold(5)])] });
    const intent = store.getState().settings;

    tick(0);
    expect(view().settings.flow.enabled).toBe(false);
    tick(1000);
    expect(view().settings.flow.enabled).toBe(true);
    tick(3000);
    expect(store.getState().settings).toBe(intent);
  });

  it('each crossed visibility step syncs with its own over', () => {
    const store = makeStore();
    const { tick, syncVisibility } = makePlayer(store);
    installClip(store, {
      timeline: [seq([wait(1), show(['flow'], 4), wait(1), hide(['flow'], 1), hold(5)])],
    });

    tick(0);
    expect(syncVisibility).not.toHaveBeenCalled();
    tick(2500);
    expect(syncVisibility.mock.calls.map(([s, over]) => [s.flow.enabled, over])).toEqual([
      [true, 4000],
      [false, 1000],
    ]);
  });

  it('a frameTo step starts a frame tween from the live basis and puts its frame in the view', () => {
    const store = makeStore();
    const { tick, view } = makePlayer(store);
    installClip(store, { timeline: [frameTo('supergalactic', { over: 2 }), hold(5)] });
    const dispatch = vi.spyOn(store, 'dispatch');

    tick(0);
    expect(dispatch).toHaveBeenCalledWith(
      startFrameTween({
        fromQuat: [0, 0, 0, 1],
        to: 'supergalactic',
        durationMs: 2000,
        easing: 'easeInOutCubic',
      }),
    );
    expect(view().settings.orientation).toBe('supergalactic');
    expect(store.getState().settings.orientation).toBe(DEFAULT_ORIENTATION);
  });

  it('clipOpacityOf is the factor at t whatever frames were skipped', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    // A retarget mid-ramp supersedes: from 2 s the second ramp runs from the 0.5 reached there.
    installClip(store, {
      timeline: [fade(['flow'], 0, 4), seq([wait(2), fade(['flow'], 1, 2), hold(5)])],
    });

    tick(0);
    expect(player.clipOpacityOf('flow')).toBe(1);
    tick(1000);
    expect(player.clipOpacityOf('flow')).toBeCloseTo(0.84375, 12);
    tick(3000);
    expect(player.clipOpacityOf('flow')).toBeCloseTo(0.75, 12);
    expect(player.clipOpacityOf('survey')).toBe(1);
  });

  it('revert: at the end the view is the store again and visibility re-syncs with default durations', () => {
    const store = makeStore();
    const { player, tick, view, syncVisibility } = makePlayer(store);
    installClip(store, {
      timeline: [
        show(['flow'], 0),
        frameTo('galactic', { over: 0.5 }),
        fade(['survey'], 0, 0),
        hold(1),
      ],
    });
    tick(0);
    tick(1000);
    syncVisibility.mockClear();
    const dispatch = vi.spyOn(store, 'dispatch');

    tick(2000);
    expect(store.getState().camera.clip).toBeNull();
    expect(view()).toBe(store.getState());
    expect(syncVisibility).toHaveBeenCalledWith(store.getState().settings);
    expect(syncVisibility.mock.calls[0]![0].flow.enabled).toBe(false);
    expect(dispatch).toHaveBeenCalledWith(
      startFrameTween({
        fromQuat: [0, 0, 0, 1],
        to: DEFAULT_ORIENTATION,
        durationMs: FRAME_TWEEN_MS,
        easing: 'easeInOutCubic',
      }),
    );
    expect(player.clipOpacityOf('survey')).toBe(1);
  });

  it("keep: at the end the store holds the view's settings, focus and orientation before clipEnded", () => {
    const store = makeStore();
    const { tick, syncVisibility } = makePlayer(store);
    installClip(
      store,
      {
        timeline: [
          show(['flow']),
          { kind: 'focus', ref: VIRGO },
          frameTo('galactic', { over: 1 }),
          hold(1),
        ],
      },
      'keep',
    );
    tick(0);
    tick(1000);
    syncVisibility.mockClear();
    const dispatch = vi.spyOn(store, 'dispatch');

    tick(2000);
    expect(typesOf(dispatch.mock.calls)).toEqual([
      mergeSnapshot.type,
      updateSelectionFocus.type,
      setOrientation.type,
      clipEnded.type,
    ]);
    const { settings, selection } = store.getState();
    expect(settings.flow.enabled).toBe(true);
    expect(settings.orientation).toBe('galactic');
    expect(selection.focus).toEqual(VIRGO);
    expect(syncVisibility).not.toHaveBeenCalled();
  });

  it('keep: stop() commits the steps reached by the stop instant, not later ones', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    installClip(
      store,
      { timeline: [seq([show(['flow']), wait(2), hide(['label:milkyWay']), hold(5)])] },
      'keep',
    );
    tick(0);
    tick(1000);

    player.stop();
    expect(store.getState().camera.clip).toBeNull();
    expect(store.getState().settings.flow.enabled).toBe(true);
    expect(store.getState().settings.milkyWay.labelEnabled).toBe(true);
  });

  it('a looping clip re-evaluates each lap from intent; a lap that drops a step seeds it at t', () => {
    const store = makeStore();
    const { tick, view, syncVisibility, fades } = makePlayer(store);
    installClip(store, {
      timeline: [hide(['label:milkyWay'], 0), seq([wait(1), show(['flow']), hold(1)])],
      loop: true,
    });

    tick(0);
    tick(1500);
    expect(view().settings.flow.enabled).toBe(true);
    syncVisibility.mockClear();

    tick(2100); // 0.1 s into lap 2: the show at 1 s no longer applies, the hide at 0 does.
    expect(view().settings.flow.enabled).toBe(false);
    expect(view().settings.milkyWay.labelEnabled).toBe(false);
    expect(syncVisibility).not.toHaveBeenCalled();
    expect(fades.setImmediate.mock.calls).toEqual([
      [FLOW, 0],
      [MW_LABEL, 0],
    ]);
    expect(fades.fadeTo).not.toHaveBeenCalled();

    fades.setImmediate.mockClear();
    tick(3000); // lap 2 crosses the show again: a crossing, published as S3 does.
    expect(syncVisibility.mock.calls.map(([s]) => s.flow.enabled)).toEqual([true]);
    tick(4100); // lap 3: the show drops again and seeds again.
    expect(fades.setImmediate).toHaveBeenCalledTimes(2);
  });

  it('a lap that crosses back over only a step at 0 publishes nothing', () => {
    const store = makeStore();
    const { tick, syncVisibility, fades } = makePlayer(store);
    installClip(store, { timeline: [hide(['label:milkyWay'], 0), hold(2)], loop: true });

    tick(0);
    syncVisibility.mockClear();
    tick(2100);
    tick(4100);
    expect(syncVisibility).not.toHaveBeenCalled();
    expect(fades.setImmediate).not.toHaveBeenCalled();
  });

  it('a replaced clip publishes its crossings and leaves the end resolver alone', () => {
    const store = makeStore();
    const { player, tick, view, syncVisibility } = makePlayer(store);
    const onEnd = vi.fn<() => void>();
    player.registerEndResolver(onEnd);
    installClip(store, { timeline: [show(['flow'], 0), hold(5)] });
    tick(0);
    syncVisibility.mockClear();

    installClip(store, { timeline: [seq([wait(1), hide(['label:milkyWay'], 2), hold(5)])] });
    tick(500);
    expect(view().settings.flow.enabled).toBe(false);
    expect(syncVisibility.mock.calls.map(([s, over]) => [s.flow.enabled, over])).toEqual([
      [false, undefined],
    ]);
    tick(1500);
    expect(syncVisibility.mock.calls.at(-1)![1]).toBe(2000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(store.getState().camera.clip).not.toBeNull();
  });

  it('view is memoized: the same root and applied counts return the same object', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    installClip(store, { timeline: [show(['flow']), hold(5)] });
    tick(0);
    const root = store.getState();

    const first = player.view(root);
    expect(first).not.toBe(root);
    tick(1000);
    expect(player.view(root)).toBe(first);
  });
});

describe('clipPlayer lifecycle', () => {
  it('dispatches clipEnded the frame AFTER the clip reaches durationSec (post-produce defer)', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);
    installClip(store, { timeline: [hold(2)] });
    const dispatch = vi.spyOn(store, 'dispatch');

    tick(0);
    tick(2000);
    // The produce step of this frame runs saturated, with the clip still active.
    expect(typesOf(dispatch.mock.calls)).not.toContain(clipEnded.type);
    expect(store.getState().camera.clip).not.toBeNull();

    tick(3000);
    expect(typesOf(dispatch.mock.calls)).toContain(clipEnded.type);
    expect(store.getState().camera.clip).toBeNull();
  });

  it('loop: true rebases the epoch instead of ending; stop still terminates it', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    installClip(store, { timeline: [hold(2)], loop: true });

    tick(0);
    tick(2000);
    tick(4100);
    expect(store.getState().camera.clip).not.toBeNull();

    player.stop();
    expect(store.getState().camera.clip).toBeNull();
  });

  it("a looping clip's rewind returns a rebased epoch, not a mutated one", () => {
    const store = makeStore();
    const { player } = makePlayer(store);
    installClip(store, { timeline: [hold(2)], loop: true });

    // Same ref on the wrap frame ⇒ `advanceEpoch` hands back THIS object, so a
    // write-in-place rebase would show up as a mutated input.
    const started = player.tick(UNSTARTED_EPOCHS.clip, 0).clipEpoch;
    const snapshot = { ...started };

    // t=2100: 0.1 s past the 2 s lap. Rebased = now − overshoot, not snapped to now.
    const { clipEpoch } = player.tick(started, 2100);

    expect(clipEpoch).not.toBe(started);
    expect(clipEpoch.ref).toBe(started.ref);
    expect(clipEpoch.startMs).toBeCloseTo(2000, 6);
    expect(started).toEqual(snapshot);
  });

  it("tick starts the epoch on the clip's arrival frame", () => {
    const store = makeStore();
    const { player } = makePlayer(store);
    installClip(store, { timeline: [hold(5)] });

    const { clipEpoch } = player.tick(UNSTARTED_EPOCHS.clip, 5000);

    expect(clipEpoch.ref).toBe(store.getState().camera.clip);
    expect(elapsedMs(clipEpoch, 5000)).toBe(0);
  });

  it('the epoch is the argument, advanced, and nothing else', () => {
    const store = makeStore();
    const { player } = makePlayer(store);
    installClip(store, { timeline: [hold(5)] });
    const handed: CameraEpochs['clip'] = { ref: store.getState().camera.clip, startMs: 1000 };

    const { clipEpoch } = player.tick(handed, 1500);

    expect(clipEpoch).toBe(handed);
    expect(elapsedMs(clipEpoch, 1500)).toBe(500);
  });

  it('destroy drops the scene and settles an in-flight playClip end-resolver', () => {
    const store = makeStore();
    const { player, tick, view } = makePlayer(store);
    let settled = false;
    player.registerEndResolver(() => {
      settled = true;
    });
    installClip(store, { timeline: [fade(['survey'], 0, 0), show(['flow']), hold(5)] });
    tick(0);
    expect(player.clipOpacityOf('survey')).toBe(0);

    player.destroy();
    expect(settled).toBe(true);
    expect(player.clipOpacityOf('survey')).toBe(1);
    expect(view()).toBe(store.getState());
  });
});

describe('clipPlayer transport', () => {
  // A 4 s show of flow from 2 s; the clip runs to 11 s.
  const SHOW_AT_2 = { timeline: [seq([wait(2), show(['flow'], 4), hold(5)])] };

  it('a paused transport evaluates at atSec on every frame', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);
    transportClip(store, SHOW_AT_2, { kind: 'paused', atSec: 3, camera: 'clip' });

    expect(elapsedMs(tick(1000), 1000)).toBe(3000);
    expect(elapsedMs(tick(1500), 1500)).toBe(3000);
  });

  it('a running transport is anchored at the first frame that sees it', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);
    // Dispatched "at" 1000 ms; the first frame to see it runs at 1016.
    transportClip(store, SHOW_AT_2, { kind: 'running', fromSec: 2, loop: null });

    tick(1016);
    expect(elapsedMs(tick(1516), 1516)).toBe(2500);
  });

  it('a new transport object re-anchors even when its numbers are the old ones', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);
    transportClip(store, SHOW_AT_2, { kind: 'running', fromSec: 0, loop: null });
    tick(0);
    expect(elapsedMs(tick(1000), 1000)).toBe(1000);

    store.dispatch(clipTransportSet({ kind: 'running', fromSec: 0, loop: null }));
    expect(elapsedMs(tick(2000), 2000)).toBe(0);
    expect(elapsedMs(tick(2500), 2500)).toBe(500);
  });

  it('a running transport holds at its end, reports held, and never ends', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    const onEnd = vi.fn<() => void>();
    player.registerEndResolver(onEnd);
    transportClip(store, { timeline: [hold(2)] }, { kind: 'running', fromSec: 0, loop: null });

    tick(0);
    expect(player.clipAt()).toEqual({ sec: 0, held: false });
    tick(3000);
    tick(3100);
    expect(player.clipAt()).toEqual({ sec: 2, held: true });
    expect(store.getState().camera.clip).not.toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('a loop span wraps inside the span with the overshoot carried', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);
    const loop = { startSec: 2, endSec: 4 };
    transportClip(store, SHOW_AT_2, { kind: 'running', fromSec: 2, loop });

    tick(0);
    tick(2500);
    expect(player.clipAt()).toEqual({ sec: 2.5, held: false });
  });

  it('a paused seek sets each touched identity to its value at t and starts no ramp', () => {
    const store = makeStore();
    const { tick, fades } = makePlayer(store);
    transportClip(store, SHOW_AT_2, { kind: 'paused', atSec: 4, camera: 'clip' });

    tick(0);
    expect(fades.setImmediate.mock.calls).toEqual([[FLOW, 0.5]]);
    expect(fades.fadeTo).not.toHaveBeenCalled();
  });

  it('play from mid-ramp resumes the ramp for its remaining time', () => {
    const store = makeStore();
    const { tick, fades } = makePlayer(store);
    transportClip(store, SHOW_AT_2, { kind: 'running', fromSec: 4, loop: null });

    tick(0);
    expect(fades.setImmediate.mock.calls).toEqual([[FLOW, 0.5]]);
    expect(fades.fadeTo.mock.calls).toEqual([[FLOW, 1, 2000]]);
  });

  it('a data swap keeps t and re-seeds; the end resolver is untouched', () => {
    const store = makeStore();
    const { player, tick, fades } = makePlayer(store);
    const onEnd = vi.fn<() => void>();
    player.registerEndResolver(onEnd);
    transportClip(store, SHOW_AT_2, { kind: 'paused', atSec: 4, camera: 'clip' });
    tick(0);
    fades.setImmediate.mockClear();

    // The same show from 1 s: at 4 s it is 3/4 through, smoothstep(0.75) = 0.84375.
    const edited = { timeline: [seq([wait(1), show(['flow'], 4), hold(5)])] };
    store.dispatch(clipDataReplaced(resolveClipStart(edited, LIVE_POSE)));
    expect(elapsedMs(tick(500), 500)).toBe(4000);
    expect(fades.setImmediate.mock.calls).toEqual([[FLOW, 0.84375]]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it.each([
    ['paused', { kind: 'paused', atSec: 4, camera: 'clip' }],
    ['running', { kind: 'running', fromSec: 4, loop: null }],
  ] as const)(
    'a data swap returns an identity no step touches any more to intent (%s)',
    (_, at) => {
      const store = makeStore();
      const { tick, fades } = makePlayer(store);
      transportClip(
        store,
        { timeline: [seq([wait(2), hide(['label:milkyWay'], 0), hold(5)])] },
        at,
      );
      tick(0);
      expect(fades.setImmediate).toHaveBeenLastCalledWith(MW_LABEL, 0);

      // The author swaps the hidden layer: the label is in no step now.
      const edited = { timeline: [seq([wait(2), hide(['flow'], 0), hold(5)])] };
      store.dispatch(clipDataReplaced(resolveClipStart(edited, LIVE_POSE)));
      tick(100);
      expect(fades.targetOf(MW_LABEL)).toBe(1);
    },
  );

  it('past the end the view is intent and the clip factor is 1', () => {
    const store = makeStore();
    const { player, tick, view, fades } = makePlayer(store);
    transportClip(
      store,
      { timeline: [show(['flow'], 0), fade(['survey'], 0, 0), hold(2)] },
      { kind: 'paused', atSec: 5, camera: 'clip' },
    );

    tick(0);
    expect(view()).toBe(store.getState());
    expect(player.clipOpacityOf('survey')).toBe(1);
    expect(fades.setImmediate.mock.calls).toEqual([[FLOW, 0]]);
  });

  it('a paused seek inside a frame roll shows its destination; playing from there resumes it', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);
    transportClip(
      store,
      { timeline: [frameTo('supergalactic', { over: 2, ease: 'linear' }), hold(5)] },
      { kind: 'running', fromSec: 0, loop: null },
    );
    tick(0); // the continuous play starts the roll
    const dispatch = vi.spyOn(store, 'dispatch');

    store.dispatch(clipTransportSet({ kind: 'paused', atSec: 1, camera: 'clip' }));
    tick(100);
    expect(dispatch).toHaveBeenCalledWith(clearFrameTween());

    store.dispatch(clipTransportSet({ kind: 'running', fromSec: 1, loop: null }));
    tick(200);
    const roll = dispatch.mock.calls.map(([a]) => a).find((a) => startFrameTween.match(a));
    expect(roll?.payload).toMatchObject({
      to: 'supergalactic',
      durationMs: 1000,
      easing: 'linear',
    });
  });

  it('an untransported play never seeds on its first frame', () => {
    // The tour-seam guard: a ramp a `keep` commit carried across the seam must keep running.
    const store = makeStore();
    const { tick, fades } = makePlayer(store);
    installClip(store, SHOW_AT_2);

    tick(0);
    tick(4000);
    expect(fades.setImmediate).not.toHaveBeenCalled();
  });
});
