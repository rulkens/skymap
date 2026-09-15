/**
 * effectHelpers — unit tests for the one-line Effect authoring constructors.
 *
 * These tests verify the exact shape emitted by each helper. They are
 * deliberately structural: every assertion checks a specific field value
 * rather than asserting broad 'toMatchObject' shapes, so a field rename in
 * the implementation breaks the test rather than silently passing.
 */

import { describe, it, expect } from 'vitest';
import {
  tween,
  moveTargetId,
  dollyToId,
  spinToId,
  aimAlong,
  show,
  hide,
  focus,
  focusOnId,
  seq,
  all,
  flyPath,
  atPoint,
} from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';

// ---------------------------------------------------------------------------
// tween (scalar set)
// ---------------------------------------------------------------------------

describe('tween', () => {
  it('tween override space wins — explicit space:lin overrides log', () => {
    const a = tween('distance', { to: 5, over: 1, space: 'lin' });
    expect(a.space).toBe('lin');
  });
});

// ---------------------------------------------------------------------------
// show / hide
// ---------------------------------------------------------------------------

describe('show', () => {
  it('splits scoped entries out of the layer list', () => {
    const e = show(['flow', 'survey:milliquas', 'label:group']);
    expect(e.layers).toEqual(['flow']);
    expect(e.scoped).toEqual(['survey:milliquas', 'label:group']);
  });
});

describe('hide', () => {
  it("mixes aggregates and scoped entries: 'labels' expands, scoped separates", () => {
    const e = hide(['labels', 'survey:milliquas'], 0);
    expect(e.layers).toEqual([
      'surveyLabel',
      'structureLabel',
      'milkyWayLabel',
      'starCatalogLabel',
      'bodyLabel',
    ]);
    expect(e.scoped).toEqual(['survey:milliquas']);
    expect(e.over).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// focusOnId
// ---------------------------------------------------------------------------

describe('focusOnId', () => {
  it('composes focus-then-fly: a seq of the focusId cue and the concurrent camera move', () => {
    const id = focusId('m87');
    const e = focusOnId(id, 5);
    expect(e).toEqual(seq([focus(id), all([moveTargetId(id, 5), dollyToId(id, 5)])]));
  });
});

// ---------------------------------------------------------------------------
// spinToId
// ---------------------------------------------------------------------------

describe('spinToId', () => {
  it('emits kind:spinToId carrying id/over/ease, with turns omitted by default', () => {
    const id = focusId('m81');
    const e = spinToId(id, { over: 4 });
    expect(e.kind).toBe('spinToId');
    expect(e.id).toBe(id);
    expect(e.over).toBe(4);
    expect(e.ease).toBe('easeInOutCubic');
    expect('turns' in e).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aimAlong
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// flyPath — the cinematographic authoring defaults
// ---------------------------------------------------------------------------

describe('flyPath', () => {
  const wps = [atPoint([0, 0, 100], 10), atPoint([100, 0, 100], 10)];

  it('stamps the default pass-by (4 radii, outsideBend) when none is authored', () => {
    // The authoring default flies the eye BESIDE each galaxy subject. Structures
    // opt out by resolving to radius 0 (focusFraming), so this is safe to stamp
    // on every flyPath — a group cloud flies through-centre regardless.
    const e = flyPath(wps, { over: 20 });
    expect(e.passBy).toEqual({ offset: 4, dir: 'outsideBend' });
  });
});
