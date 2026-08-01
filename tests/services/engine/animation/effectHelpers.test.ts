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
  it('defaults space from CHANNEL_SPACE — distance gets "log"', () => {
    const a = tween('distance', { to: 100, over: 5 });
    expect(a.kind).toBe('set');
    expect(a.ch).toBe('distance');
    expect(a.to).toBe(100);
    expect(a.over).toBe(5);
    expect(a.ease).toBe('easeInOutCubic');
    expect(a.space).toBe('log');
  });

  it('defaults space from CHANNEL_SPACE — yaw gets "add"', () => {
    const a = tween('yaw', { to: Math.PI, over: 2 });
    expect(a.space).toBe('add');
  });

  it('defaults space from CHANNEL_SPACE — pitch gets "add"', () => {
    const a = tween('pitch', { to: 0.3, over: 1 });
    expect(a.space).toBe('add');
  });

  it('tween override space wins — explicit space:lin overrides log', () => {
    const a = tween('distance', { to: 5, over: 1, space: 'lin' });
    expect(a.space).toBe('lin');
  });

  it('ease defaults to "easeInOutCubic"', () => {
    const a = tween('pitch', { to: 0, over: 1 });
    expect(a.ease).toBe('easeInOutCubic');
  });

  it('explicit ease is forwarded', () => {
    const a = tween('yaw', { to: 1, over: 2, ease: 'easeOutCubic' });
    expect(a.ease).toBe('easeOutCubic');
  });
});

// ---------------------------------------------------------------------------
// show / hide
// ---------------------------------------------------------------------------

describe('show', () => {
  it('emits kind:show with layers', () => {
    const e = show(['flow', 'filaments']);
    expect(e.kind).toBe('show');
    expect(e.layers).toEqual(['flow', 'filaments']);
    expect(e.over).toBeUndefined();
  });

  it('forwards over when given', () => {
    const e = show(['survey'], 2);
    expect(e.over).toBe(2);
  });

  it('splits scoped entries out of the layer list', () => {
    const e = show(['flow', 'survey:milliquas', 'label:group']);
    expect(e.layers).toEqual(['flow']);
    expect(e.scoped).toEqual(['survey:milliquas', 'label:group']);
  });

  it('omits the scoped field entirely when no scoped entries are given', () => {
    expect('scoped' in show(['flow'])).toBe(false);
  });
});

describe('hide', () => {
  it('emits kind:hide with layers', () => {
    const e = hide(['milkyWayDisk']);
    expect(e.kind).toBe('hide');
    expect(e.layers).toEqual(['milkyWayDisk']);
    expect(e.over).toBeUndefined();
  });

  it('forwards over when given', () => {
    const e = hide(['flow'], 1.5);
    expect(e.over).toBe(1.5);
  });

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

  it('forwards an explicit ease to both camera writers', () => {
    const id = focusId('virgo');
    const e = focusOnId(id, 3, 'easeOutCubic');
    expect(e).toEqual(
      seq([
        focus(id),
        all([moveTargetId(id, 3, 'easeOutCubic'), dollyToId(id, 3, { ease: 'easeOutCubic' })]),
      ]),
    );
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

  it('forwards an explicit ease and turns', () => {
    const id = focusId('m81');
    const e = spinToId(id, { over: 4, turns: -1, ease: 'easeOutCubic' });
    expect(e.ease).toBe('easeOutCubic');
    expect(e.turns).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// aimAlong
// ---------------------------------------------------------------------------

describe('aimAlong', () => {
  it('emits kind:aimAlong carrying forward/over/ease, defaulting ease', () => {
    const e = aimAlong([1, 0, 0], 4);
    expect(e.kind).toBe('aimAlong');
    expect(e.forward).toEqual([1, 0, 0]);
    expect(e.over).toBe(4);
    expect(e.ease).toBe('easeInOutCubic');
  });

  it('forwards an explicit ease', () => {
    const e = aimAlong([0, 1, 0], 2, 'easeOutCubic');
    expect(e.ease).toBe('easeOutCubic');
  });
});

// ---------------------------------------------------------------------------
// flyPath — the cinematographic authoring defaults
// ---------------------------------------------------------------------------

describe('flyPath', () => {
  const wps = [atPoint([0, 0, 100], 10), atPoint([100, 0, 100], 10)];

  it('stamps the default dwell (depth 0.7, window 1.4s) when none is authored', () => {
    const e = flyPath(wps, { over: 20 });
    expect(e.linger).toBe(0.7);
    expect(e.lingerSec).toBe(1.4);
  });

  it('stamps the default pass-by (4 radii, outsideBend) when none is authored', () => {
    // The authoring default flies the eye BESIDE each galaxy subject. Structures
    // opt out by resolving to radius 0 (focusFraming), so this is safe to stamp
    // on every flyPath — a group cloud flies through-centre regardless.
    const e = flyPath(wps, { over: 20 });
    expect(e.passBy).toEqual({ offset: 4, dir: 'outsideBend' });
  });

  it('an authored passBy overrides the default', () => {
    const e = flyPath(wps, { over: 20, passBy: { offset: 2, dir: 'above' } });
    expect(e.passBy).toEqual({ offset: 2, dir: 'above' });
  });
});
