/**
 * clipFociReady tests — verifies the predicate across the key readiness cases.
 *
 * Covers:
 *   - Famous id not yet loaded → false (most important: gates the play path)
 *   - Structure id → always true (resolved by format, no catalog scan)
 *   - milkyWay id → always true (singleton, no data needed)
 *   - Clip with no id-bearing effects (hold-only) → true
 *   - focusId(null) focus-clear cue → true (clears focus, no data needed)
 *   - Nested structural nodes (seq, all, fork) propagate readiness correctly
 */

import { describe, it, expect } from 'vitest';
import { clipFociReady } from '../../../src/state/tour/clipFociReady';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FamousGalaxyMetaEntry } from '../../../src/@types/loading/FamousGalaxyMetaEntry';
import {
  moveTargetId,
  dollyToId,
  focus,
  lookAtId,
  strafeId,
  spinToId,
  hold,
  seq,
  all,
  fork,
  flyPath,
  atFocus,
  atPoint,
} from '../../../src/services/engine/animation/effectHelpers';
import type { FocusId } from '../../../src/@types/animation/FocusId';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

// Brand a string as FocusId for authoring use in tests.
const id = (s: string): FocusId => s as FocusId;

// Deps where no catalog is loaded and famousGalaxiesMeta is empty — any
// famous or galaxy id resolves to null.
const emptyDeps: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
};

// FamousGalaxyMetaEntry stub for 'm87'. The famous branch of resolveFocusId
// scans famousGalaxiesMeta for .id === 'm87'; if found AND the FamousGalaxy
// cloud is loaded, it returns a ref. With no cloud loaded, it returns null.
// Only the `id` field is consulted by resolveFocusId; the other required fields
// are stubbed with minimal values so the type cast is safe.
const m87Meta: FamousGalaxyMetaEntry = {
  id: 'm87',
  names: ['M87'],
  description: '',
  type: 'elliptical',
};

// Deps with m87 in famousGalaxiesMeta but NO FamousGalaxy cloud loaded.
// resolveFocusId returns null for 'm87' — the catalog is absent.
const depsM87NotLoaded: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [m87Meta],
  structures: { byId: () => null },
  stars: { current: () => null },
};

// ─── flyToClip-shaped clip for 'm87' ─────────────────────────────────────────
//
// Mirrors the structure produced by flyToClip('m87'): an `all` block with
// a moveTargetId and a dollyToId, both keyed to 'm87'.

const m87FlyClip: ClipData = {
  start: 'live',
  timeline: [
    all([
      moveTargetId(id('m87'), 5, 'easeInOutCubic'),
      dollyToId(id('m87'), 5, { ease: 'easeInOutCubic' }),
    ]),
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('clipFociReady', () => {
  it('clipFociReady is false when a famous id is not yet loaded', () => {
    // m87 appears in famousGalaxiesMeta but the FamousGalaxy cloud is absent.
    // resolveFocusId returns null for 'm87', so the predicate must return false.
    expect(clipFociReady(m87FlyClip, depsM87NotLoaded)).toBe(false);
  });

  it('clipFociReady gates lookAtId and strafeId like the other id-bearing arms', () => {
    // Both carry a FocusId that must resolve before the resolve-time math can
    // run — an unloaded famous id blocks readiness, a structure id never does.
    const m87LookClip: ClipData = { start: 'live', timeline: [lookAtId(id('m87'), 3)] };
    expect(clipFociReady(m87LookClip, depsM87NotLoaded)).toBe(false);

    const m87StrafeClip: ClipData = { start: 'live', timeline: [strafeId(id('m87'), 10, 3)] };
    expect(clipFociReady(m87StrafeClip, depsM87NotLoaded)).toBe(false);

    const virgoLookClip: ClipData = {
      start: 'live',
      timeline: [lookAtId(id('cluster-virgo-m87'), 3)],
    };
    expect(clipFociReady(virgoLookClip, emptyDeps)).toBe(true);
  });

  it('clipFociReady gates spinToId like the other id-bearing arms', () => {
    // Same shape as lookAtId/strafeId above — an unloaded famous id blocks
    // readiness, a structure id never does. Without this case the walk falls
    // through to the pass-through default and reports ready prematurely,
    // which would make resolveClipFoci's throw the caller's first signal
    // instead of the saga polling until the catalog loads.
    const m87SpinClip: ClipData = { start: 'live', timeline: [spinToId(id('m87'), { over: 3 })] };
    expect(clipFociReady(m87SpinClip, depsM87NotLoaded)).toBe(false);

    const virgoSpinClip: ClipData = {
      start: 'live',
      timeline: [spinToId(id('cluster-virgo-m87'), { over: 3 })],
    };
    expect(clipFociReady(virgoSpinClip, emptyDeps)).toBe(true);
  });

  it('clipFociReady is true for a structure id', () => {
    // Structure ids resolve by format alone — resolveFocusId returns a
    // SelectionRef without consulting catalogs or famousGalaxiesMeta. The
    // readiness gate must return true regardless of what deps contains.
    const structureClip: ClipData = {
      start: 'live',
      timeline: [
        all([
          moveTargetId(id('cluster-virgo-m87'), 5, 'easeInOutCubic'),
          dollyToId(id('cluster-virgo-m87'), 5, { ease: 'easeInOutCubic' }),
          focus(id('cluster-virgo-m87')),
        ]),
      ],
    };
    // emptyDeps has no catalogs or famousGalaxiesMeta, but structure ids bypass both.
    expect(clipFociReady(structureClip, emptyDeps)).toBe(true);
  });

  it('clipFociReady is true for milkyWay', () => {
    // 'milkyWay' is a singleton id handled before the famous fallback in
    // resolveFocusId. It resolves to { type: 'milkyWay' } without any catalog
    // lookup — always ready.
    const mwClip: ClipData = {
      start: 'live',
      timeline: [focus(id('milkyWay'))],
    };
    expect(clipFociReady(mwClip, emptyDeps)).toBe(true);
  });

  it('clipFociReady is true for a clip with no focus-bound effects', () => {
    // A hold-only clip has no moveTargetId / dollyToId / focusId leaves.
    // The walk visits no id-bearing nodes — trivially ready.
    const holdClip: ClipData = {
      start: 'live',
      timeline: [hold(3)],
    };
    expect(clipFociReady(holdClip, emptyDeps)).toBe(true);
  });

  it('clipFociReady is true for focusId(null)', () => {
    // A focus-clear cue carries id: null. The predicate must return true without
    // calling resolveFocusId — clearing focus needs no data.
    const clearFocusClip: ClipData = {
      start: 'live',
      timeline: [focus(null)],
    };
    expect(clipFociReady(clearFocusClip, emptyDeps)).toBe(true);
  });

  it('returns false when a dollyToId id is not resolvable', () => {
    // Verify the dollyToId arm is checked, not just moveTargetId.
    const dollyOnlyClip: ClipData = {
      start: 'live',
      timeline: [dollyToId(id('m87'), 5)],
    };
    expect(clipFociReady(dollyOnlyClip, depsM87NotLoaded)).toBe(false);
  });

  it('returns false when an id inside a seq block is not resolvable', () => {
    // Readiness propagates through structural nodes: a seq containing an
    // unresolvable id makes the whole clip not ready.
    const seqClip: ClipData = {
      start: 'live',
      timeline: [seq([hold(2), moveTargetId(id('m87'), 5)])],
    };
    expect(clipFociReady(seqClip, depsM87NotLoaded)).toBe(false);
  });

  it('returns false when an id inside a fork block is not resolvable', () => {
    // fork recurses into its single child — an unresolvable id there propagates up.
    const forkClip: ClipData = {
      start: 'live',
      timeline: [fork(focus(id('m87')))],
    };
    expect(clipFociReady(forkClip, depsM87NotLoaded)).toBe(false);
  });

  it('returns false when a flyPath has an unresolvable atFocus waypoint', () => {
    // A flyPath carries id-bearing waypoints; the gate must check each one,
    // not treat the whole flyPath as trivially ready.
    const clip: ClipData = {
      start: 'live',
      timeline: [flyPath([atFocus(id('m87'))], { over: 4 })],
    };
    expect(clipFociReady(clip, depsM87NotLoaded)).toBe(false);
  });

  it('is true for a flyPath with only concrete (atPoint) waypoints', () => {
    const clip: ClipData = {
      start: 'live',
      timeline: [flyPath([atPoint([1, 0, 0], 5), atPoint([2, 0, 0], 10)], { over: 4 })],
    };
    expect(clipFociReady(clip, emptyDeps)).toBe(true);
  });
});
