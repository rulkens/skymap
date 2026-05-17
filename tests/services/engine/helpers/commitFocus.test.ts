// tests/services/engine/helpers/commitFocus.test.ts
/**
 * commitFocus — focused test for the highest-leverage invariants of
 * the shared focus-commit protocol.
 *
 * ### Why this file exists
 *
 * `commitFocus` is the shared 3-call tail of three public-handle
 * methods (`focusOn`, `selectFamous`, `selectByAlias`).  Each method
 * was tested at the engine.ts integration level pre-extraction; the
 * extraction landed without a direct test for the kernel.  The
 * 2026-05-11 second architectural audit's finding #5 called this out:
 * the kernel has 137 lines of carefully-rationalised order-and-
 * optionality logic with no direct asserts, and any future refactor
 * that swaps the call order would silently drift the URL hash out of
 * sync with the camera state.
 *
 * ### What this file asserts
 *
 * Five invariants — see each test's docblock for the rationale:
 *   1. Order: setSelected → onFocusChange → tweenToGalaxy when
 *      selection is provided.
 *   2. Optional selection: omitted → setSelected NOT called.
 *   3. Optional onFocusChange callback: undefined cb.camera.onFocusChange
 *      must not crash.
 *   4. Optional camera sub-bag: undefined cb.camera must not crash.
 *   5. selection.info pass-through: undefined info reaches setSelected
 *      as undefined (NOT a thrown error or skipped call).
 *
 * ### Why mock `tweenToGalaxy`
 *
 * The real `tweenToGalaxy` reads `state.cam`, calls
 * `state.subsystems.tweens.start(...)`, and calls
 * `state.subsystems.scheduler.requestRender()`.  It's tested
 * separately in `tweenToGalaxy.test.ts`.  Here we only need to
 * verify it's called — mocking lets us assert the call shape without
 * stubbing out the entire camera subsystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';

// ── Module mocks ──────────────────────────────────────────────────────

const tweenToGalaxySpy = vi.fn();
vi.mock('../../../../src/services/engine/camera/tweenToGalaxy', () => ({
  tweenToGalaxy: (...args: unknown[]) => tweenToGalaxySpy(...args),
}));

// Imported AFTER the mock so commitFocus picks it up.
import { commitFocus } from '../../../../src/services/engine/helpers/commitFocus';
import { Source } from '../../../../src/data/sources';

// ── Fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal state + callbacks for a commitFocus call.  Returns the spy
 * refs alongside the state/cb objects so each test can assert on them
 * directly.
 */
function makeFixtures() {
  const setSelected = vi.fn();
  const onFocusChange = vi.fn();
  const state = {
    subsystems: { selection: { setSelected } },
  } as unknown as EngineState;
  const cb = {
    camera: { onFocusChange },
  } as unknown as EngineCallbacks;
  const info = { source: 0, localIdx: 7, diameterKpc: 30 } as unknown as GalaxyInfo;
  return { state, cb, info, setSelected, onFocusChange };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('commitFocus', () => {
  beforeEach(() => {
    tweenToGalaxySpy.mockClear();
  });

  it('fires setSelected → onFocusChange → tweenToGalaxy in that order when selection is provided', () => {
    // Order is load-bearing.  React reads `onFocusChange` to update
    // the URL hash; if the tween fired first, the camera would
    // animate before the URL flipped, causing the hash and canvas to
    // diverge on deep-link transitions.
    const { state, cb, info, setSelected, onFocusChange } = makeFixtures();
    const selectionKey = { source: Source.SDSS, localIdx: 42 };
    const selectionInfo = { source: Source.SDSS, localIdx: 42 } as unknown as GalaxyInfo;

    commitFocus(state, cb, info, { key: selectionKey, info: selectionInfo });

    expect(setSelected).toHaveBeenCalledWith(selectionKey, selectionInfo);
    expect(onFocusChange).toHaveBeenCalledWith(info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);

    // Vitest's `mock.invocationCallOrder` is a monotonic counter
    // assigned across ALL spies — so comparing the three captured
    // values verifies relative order independent of how many other
    // mocks were called between them.
    const setSelectedOrder = setSelected.mock.invocationCallOrder[0]!;
    const onFocusChangeOrder = onFocusChange.mock.invocationCallOrder[0]!;
    const tweenOrder = tweenToGalaxySpy.mock.invocationCallOrder[0]!;
    expect(setSelectedOrder).toBeLessThan(onFocusChangeOrder);
    expect(onFocusChangeOrder).toBeLessThan(tweenOrder);
  });

  it('skips setSelected but still fires onFocusChange + tweenToGalaxy when selection is omitted', () => {
    // `focusOn` and the URL-hash-driven focus path both pass
    // `undefined` for selection so the existing halo isn't clobbered.
    // The other two calls must still fire — the camera tween and the
    // React-side focus echo are unconditional.
    const { state, cb, info, setSelected, onFocusChange } = makeFixtures();

    commitFocus(state, cb, info);

    expect(setSelected).not.toHaveBeenCalled();
    expect(onFocusChange).toHaveBeenCalledWith(info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('does not crash when cb.camera.onFocusChange is undefined', () => {
    // Headless test callers and internal tweens don't subscribe to
    // onFocusChange.  Optional chaining must absorb the missing
    // listener; the tween must still fire.
    const { state, info } = makeFixtures();
    const cb = { camera: {} } as unknown as EngineCallbacks;

    expect(() => commitFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('does not crash when cb.camera is undefined', () => {
    // Same shape as the previous test but at one level out: the
    // whole `camera` sub-bag is missing.  Double optional chaining
    // must absorb both layers.
    const { state, info } = makeFixtures();
    const cb = {} as unknown as EngineCallbacks;

    expect(() => commitFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('passes selection.info=undefined through to setSelected when omitted', () => {
    // `selectFamous` omits `info` from its CommitFocusSelection
    // because its palette-pick path never races the renderer upload.
    // The selection subsystem must receive `undefined` (NOT skip the
    // call) so its own live-lookup path runs.
    const { state, cb, info, setSelected } = makeFixtures();
    const selectionKey = { source: Source.SDSS, localIdx: 42 };

    commitFocus(state, cb, info, { key: selectionKey });

    expect(setSelected).toHaveBeenCalledWith(selectionKey, undefined);
  });
});
