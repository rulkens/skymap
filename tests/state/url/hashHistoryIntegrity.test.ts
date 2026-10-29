// @vitest-environment jsdom
/**
 * Hash bridge HISTORY-STACK integrity: assert the SEQUENCE of `pushState` calls, not the final
 * URL. Answering Back with two pushes truncates Forward while the URL still looks right.
 * Causes: a torn read in the `focus` row's `pending`-then-`selectionRows` ladder, and
 * `applyNavigation` publishing a half-applied multi-param URL. Fix: one publish per settled
 * state (`debounce(0, …)`), so most cases assert "pushes nothing" and one pins the real write.
 * `pushState` is spied (calls through); never forward `window.addEventListener` via
 * `EventTarget.prototype` (throws under jsdom, so every `toEqual([])` passes vacuously).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

import { NOOP_SAGA_CONTEXT } from '../../support/createTestStore';
import { createAppStore } from '../../../src/store/createAppStore';
import { selectArrivalPending } from '../../../src/state/arrival/selectors';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { openExhibit } from '../../../src/state/exhibits/exhibitActions';
import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

/** A valid `b`-tagged, 17-field arm for the `#pose=` arrival case below; the numbers are arbitrary. */
const EARTH_ARM: FramedCameraPose = {
  frame: { body: asSceneBodyId('earth') },
  pose: {
    bodyId: asSceneBodyId('earth'),
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [1000, 2000, 3000],
    basisLocal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
};

/** A macrotask, so the write saga's debounce window has closed. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Move the address bar with no history entry and no event — pure setup. */
function seedHash(body: string) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', body ? `${base}#${body}` : base);
}

/** Back/Forward on hash-only entries: the URL is already new when `hashchange` fires. An explicit event keeps it synchronous (jsdom queues its own). */
function navigate(body: string) {
  seedHash(body);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('hash history integrity', () => {
  let pushState: MockInstance<History['pushState']>;

  /** The hash of every URL pushed since the last clear, in order. */
  const pushedHashes = () =>
    pushState.mock.calls.map(([, , url]) => new URL(String(url), window.location.href).hash);

  /** Registering the context releases the hash bridge, so this call IS the arrival read; it waits for the arrival because until then every publish canonicalizes in place. */
  const boot = async () => {
    const handle = createAppStore();
    handle.setSagaContext({
      ...NOOP_SAGA_CONTEXT,
      cameraRuntime: () => ({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
        fovYRad: 0.8,
        aspect: 1,
        upBasisQuat: [0, 0, 0, 1],
      }),
    });
    while (selectArrivalPending(handle.store.getState())) await flush();
    await flush();
    return handle;
  };

  beforeEach(() => {
    pushState = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pushes nothing when Back returns to a previously focused body', async () => {
    seedHash('focus=body-mars');
    await boot();
    await flush();

    navigate('focus=body-saturn');
    await flush();

    pushState.mockClear();
    navigate('focus=body-mars');
    await flush();

    // ANY push during Back truncates Forward, so assert the empty sequence, not a length bound.
    expect(pushedHashes()).toEqual([]);
  });

  it('pushes nothing when a navigation moves two params at once', async () => {
    seedHash('');
    await boot();
    await flush();

    pushState.mockClear();
    navigate('focus=body-mars&orientation=galactic');
    await flush();

    // The `focus` row's actions land before `orientation`'s, so a write answering the first
    // would compose a body no history entry ever carried.
    expect(pushedHashes()).toEqual([]);
    expect(window.location.hash).toBe('#focus=body-mars&orientation=galactic');
  });

  it('pushes nothing on a cold load of a body deep link', async () => {
    seedHash('focus=body-mars');

    await boot();
    await flush();

    // Pins `writeHashBody`'s compare-and-skip: without it a shared link lands several
    // identical entries deep and Back does nothing visible.
    expect(pushedHashes()).toEqual([]);
  });

  it('canonicalizes a #pose= arrival with replaceState instead of pushing', async () => {
    // `pose` never writes, so a plain push would re-apply and push again on every Back.
    const iso = '2000-01-01T12:00:00.000Z';
    seedHash(`focus=body-mars&t=${iso}&pose=${encodeFramedPose(EARTH_ARM)}`);

    await boot();
    await flush();

    expect(pushedHashes()).toEqual([]);
    expect(window.location.hash).not.toContain('pose=');
  });

  it("keeps a takeover navigation's key without pushing", async () => {
    seedHash('');
    await boot();
    await flush();

    pushState.mockClear();
    navigate('exhibit=zoneOfAvoidance');
    await flush();

    // The running exhibit writes its own key back, so the settled body equals the new URL.
    expect(pushedHashes()).toEqual([]);
    expect(window.location.hash).toContain('exhibit=zoneOfAvoidance');
  });

  it('a palette-opened exhibit writes exhibit=', async () => {
    seedHash('');
    const { store } = await boot();
    await flush();

    pushState.mockClear();
    store.dispatch(openExhibit({ id: 'zoneOfAvoidance', entry: 'fly' }));
    await flush();

    expect(pushedHashes().at(-1)).toContain('exhibit=zoneOfAvoidance');
  });

  it('pushes exactly once for a selection the store makes on its own', async () => {
    seedHash('');
    const { store } = await boot();
    await flush();

    pushState.mockClear();
    store.dispatch(requestFocus({ id: 'body-mars', transition: 'fly' }));
    await flush();

    // Counterweight to the empty assertions: one entry also pins that the debounce fires
    // rather than being cancelled forever by the reconciler's follow-up actions.
    expect(pushedHashes()).toEqual(['#focus=body-mars']);
  });
});
