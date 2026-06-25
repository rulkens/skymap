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
  dollyTo,
  moveTarget,
  aimAt,
  spin,
  rate,
  oscillate,
  hold,
  wait,
  show,
  hide,
  fade,
  scene,
  focus,
  seq,
  all,
  fork,
} from '../../../../src/services/engine/animation/effectHelpers';

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
    expect(a.ease).toBe('inOut');
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

  it('ease defaults to "inOut"', () => {
    const a = tween('pitch', { to: 0, over: 1 });
    expect(a.ease).toBe('inOut');
  });

  it('explicit ease is forwarded', () => {
    const a = tween('yaw', { to: 1, over: 2, ease: 'out' });
    expect(a.ease).toBe('out');
  });
});

// ---------------------------------------------------------------------------
// dollyTo
// ---------------------------------------------------------------------------

describe('dollyTo', () => {
  it('emits a set on distance with space:log from CHANNEL_SPACE', () => {
    const a = dollyTo(300, 4);
    expect(a).toEqual({
      kind: 'set',
      ch: 'distance',
      to: 300,
      over: 4,
      ease: 'inOut',
      space: 'log',
    });
  });

  it('forwards explicit ease', () => {
    const a = dollyTo(50, 2, 'out');
    expect(a.ease).toBe('out');
  });
});

// ---------------------------------------------------------------------------
// moveTarget (setVec)
// ---------------------------------------------------------------------------

describe('moveTarget', () => {
  it('emits a setVec on target', () => {
    const a = moveTarget([1, 2, 3], 5);
    expect(a.kind).toBe('setVec');
    expect(a.ch).toBe('target');
    expect(a.to).toEqual([1, 2, 3]);
    expect(a.over).toBe(5);
    expect(a.space).toBe('lin');
    expect(a.ease).toBe('inOut');
  });

  it('moveTarget to deep-equals the given Vec3', () => {
    const a = moveTarget([1, 2, 3], 5);
    expect(a.to).toEqual([1, 2, 3]);
  });

  it('forwards explicit ease', () => {
    const a = moveTarget([0, 0, 0], 1, 'in');
    expect(a.ease).toBe('in');
  });
});

// ---------------------------------------------------------------------------
// aimAt
// ---------------------------------------------------------------------------

describe('aimAt', () => {
  it('wraps yaw + pitch set actions in an all', () => {
    const e = aimAt({ yaw: 1.5, pitch: 0.2 }, 3);
    expect(e.kind).toBe('all');
    if (e.kind !== 'all') return;
    expect(e.children).toHaveLength(2);

    const [yawAction, pitchAction] = e.children;
    expect(yawAction).toMatchObject({ kind: 'set', ch: 'yaw', to: 1.5, over: 3, ease: 'inOut' });
    expect(pitchAction).toMatchObject({
      kind: 'set',
      ch: 'pitch',
      to: 0.2,
      over: 3,
      ease: 'inOut',
    });
  });

  it('forwards explicit ease to both children', () => {
    const e = aimAt({ yaw: 0, pitch: 0 }, 2, 'out');
    if (e.kind !== 'all') return;
    expect(e.children[0]).toMatchObject({ ease: 'out' });
    expect(e.children[1]).toMatchObject({ ease: 'out' });
  });
});

// ---------------------------------------------------------------------------
// spin
// ---------------------------------------------------------------------------

describe('spin', () => {
  it('emits a spin action on the given channel', () => {
    const a = spin('yaw', { by: 6.28, over: 30 });
    expect(a.kind).toBe('spin');
    expect(a.ch).toBe('yaw');
    expect(a.by).toBe(6.28);
    expect(a.over).toBe(30);
    expect(a.ease).toBe('inOut');
    expect(a.loop).toBeUndefined();
  });

  it('spin carries loop flag when set to true', () => {
    const a = spin('yaw', { by: 6.28, over: 30, loop: true });
    expect(a.loop).toBe(true);
  });

  it('forwards explicit ease', () => {
    const a = spin('pitch', { by: 1, over: 5, ease: 'linear' });
    expect(a.ease).toBe('linear');
  });
});

// ---------------------------------------------------------------------------
// rate
// ---------------------------------------------------------------------------

describe('rate', () => {
  it('emits a rate action', () => {
    const a = rate('yaw', { to: 0.5, over: 2 });
    expect(a.kind).toBe('rate');
    expect(a.ch).toBe('yaw');
    expect(a.to).toBe(0.5);
    expect(a.over).toBe(2);
    expect(a.ease).toBe('inOut');
  });

  it('forwards explicit ease', () => {
    const a = rate('distance', { to: 1, over: 1, ease: 'in' });
    expect(a.ease).toBe('in');
  });
});

// ---------------------------------------------------------------------------
// oscillate
// ---------------------------------------------------------------------------

describe('oscillate', () => {
  it('oscillate has no over/ease — emits kind:osc with amp and period', () => {
    const a = oscillate('pitch', { amp: 0.1, period: 8 });
    expect(a).toEqual({ kind: 'osc', ch: 'pitch', amp: 0.1, period: 8 });
  });

  it('does NOT include over or ease fields', () => {
    const a = oscillate('yaw', { amp: 0.5, period: 10 });
    expect(a).not.toHaveProperty('over');
    expect(a).not.toHaveProperty('ease');
  });
});

// ---------------------------------------------------------------------------
// hold / wait
// ---------------------------------------------------------------------------

describe('hold', () => {
  it('emits kind:hold with sec', () => {
    const e = hold(3.5);
    expect(e).toEqual({ kind: 'hold', sec: 3.5 });
  });
});

describe('wait', () => {
  it('emits kind:wait with sec', () => {
    const e = wait(1);
    expect(e).toEqual({ kind: 'wait', sec: 1 });
  });
});

// ---------------------------------------------------------------------------
// show / hide / fade
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
});

describe('fade', () => {
  it('emits kind:fade with layers, to, and over', () => {
    const e = fade(['structureRing'], 0.5, 3);
    expect(e).toEqual({ kind: 'fade', layers: ['structureRing'], to: 0.5, over: 3 });
  });
});

// ---------------------------------------------------------------------------
// scene / focus
// ---------------------------------------------------------------------------

describe('scene', () => {
  it('emits kind:scene wrapping the action', () => {
    const fakeAction = { type: 'settings/setFlowEnabled', payload: true } as any;
    const e = scene(fakeAction);
    expect(e.kind).toBe('scene');
    expect(e.action).toBe(fakeAction);
  });
});

describe('focus', () => {
  it('emits kind:focus with the given ref', () => {
    const ref = { kind: 'structure', id: 'virgo' } as any;
    const e = focus(ref);
    expect(e.kind).toBe('focus');
    expect(e.ref).toBe(ref);
  });

  it('emits kind:focus with null to clear', () => {
    const e = focus(null);
    expect(e).toEqual({ kind: 'focus', ref: null });
  });
});

// ---------------------------------------------------------------------------
// seq / all / fork
// ---------------------------------------------------------------------------

describe('seq', () => {
  it('wraps children with kind:seq', () => {
    const e = seq([hold(1), hold(2)]);
    expect(e.kind).toBe('seq');
    expect(e.children).toHaveLength(2);
  });
});

describe('all', () => {
  it('wraps children with kind:all', () => {
    const e = all([dollyTo(100, 3), moveTarget([0, 0, 0], 3)]);
    expect(e.kind).toBe('all');
    expect(e.children).toHaveLength(2);
  });
});

describe('fork', () => {
  it('wraps a single child with kind:fork', () => {
    const child = spin('yaw', { by: 6.28, over: 60, loop: true });
    const e = fork(child);
    expect(e.kind).toBe('fork');
    expect(e.child).toBe(child);
  });
});
