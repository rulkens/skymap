import { describe, expect, it } from 'vitest';

import type { NavigatorState } from '../../../src/@types/camera/NavigatorState';
import type { NavSettings } from '../../../src/@types/camera/NavSettings';
import type { NavStep } from '../../../src/@types/camera/NavStep';
import { NAV_AT_REST } from '../../../src/data/camera/openSpaceNavigation';
import { stepNavigator } from '../../../src/utils/camera/stepNavigator';

const RAD_PER_PX = 0.001;
const ALL_ON: NavSettings = {
  friction: 0.5,
  frictionOn: { rotational: true, zoom: true, roll: true },
};
const ALL_OFF: NavSettings = {
  friction: 0.5,
  frictionOn: { rotational: false, zoom: false, roll: false },
};

const coasting = (lastNowMs = 1000): NavigatorState => ({
  velocity: { orbit: [1, -2], look: [0.5, 0.25], zoom: 3, roll: -1 },
  held: null,
  lastNowMs,
});
const drag = (axis: 'orbit' | 'look' | 'zoom' | 'roll', x: number, y: number): NavStep => ({
  kind: 'navDrag',
  axis,
  deltaPx: [x, y],
});

describe('stepNavigator', () => {
  it.each([8, 16, 50])('release decays by 1 − min(dt/friction, 1) at %i ms', (dtMs) => {
    const { state } = stepNavigator(coasting(), [], 1000 + dtMs, ALL_ON, RAD_PER_PX);
    const s = 1 - dtMs / 1000 / (0.5 + 1e-7);
    expect(state.velocity.orbit[0]).toBeCloseTo(1 * s, 12);
    expect(state.velocity.orbit[1]).toBeCloseTo(-2 * s, 12);
    expect(state.velocity.look[0]).toBeCloseTo(0.5 * s, 12);
    expect(state.velocity.zoom).toBeCloseTo(3 * s, 12);
    expect(state.velocity.roll).toBeCloseTo(-1 * s, 12);
  });

  it('friction 0 stops a released axis in one frame', () => {
    const settings = { ...ALL_ON, friction: 0 };
    const { state, moving } = stepNavigator(coasting(), [], 1016, settings, RAD_PER_PX);
    expect(state.velocity).toEqual(NAV_AT_REST.velocity);
    expect(moving).toBe(false);
  });

  it('an axis with friction off holds its velocity', () => {
    const settings = { ...ALL_ON, frictionOn: { ...ALL_ON.frictionOn, zoom: false } };
    let state = coasting(0);
    for (let i = 1; i <= 100; i++) {
      state = stepNavigator(state, [], i * 16, settings, RAD_PER_PX).state;
    }
    expect(state.velocity.zoom).toBe(3);
    expect(Math.abs(state.velocity.orbit[0])).toBeLessThan(0.1);
    expect(Math.abs(state.velocity.roll)).toBeLessThan(0.1);
  });

  it('look decays under the roll toggle, not the rotational one', () => {
    const rollOff = { ...ALL_ON, frictionOn: { ...ALL_ON.frictionOn, roll: false } };
    const a = stepNavigator(coasting(), [], 1016, rollOff, RAD_PER_PX).state.velocity;
    expect(a.look).toEqual([0.5, 0.25]);
    expect(a.roll).toBe(-1);
    expect(Math.abs(a.orbit[0])).toBeLessThan(1);

    const rotOff = { ...ALL_ON, frictionOn: { ...ALL_ON.frictionOn, rotational: false } };
    const b = stepNavigator(coasting(), [], 1016, rotOff, RAD_PER_PX).state.velocity;
    expect(b.orbit).toEqual([1, -2]);
    expect(Math.abs(b.look[0])).toBeLessThan(0.5);
  });

  it('dt is capped at 100 ms', () => {
    const gap = stepNavigator(coasting(), [], 3000, ALL_ON, RAD_PER_PX);
    const capped = stepNavigator(coasting(), [], 1100, ALL_ON, RAD_PER_PX);
    expect(gap.state.velocity).toEqual(capped.state.velocity);
    expect(gap.delta).toEqual(capped.delta);
  });

  it('the first frame moves nothing', () => {
    const first = { ...coasting(), lastNowMs: null };
    const { delta } = stepNavigator(first, [drag('orbit', 10, 0)], 5000, ALL_ON, RAD_PER_PX);
    expect(delta).toEqual({});
  });

  it('a held motionless mouse comes to rest even with friction off', () => {
    let state = stepNavigator(NAV_AT_REST, [], 0, ALL_OFF, RAD_PER_PX).state;
    state = stepNavigator(state, [drag('orbit', 10, 5)], 16, ALL_OFF, RAD_PER_PX).state;
    expect(state.velocity.orbit[0]).toBeGreaterThan(0);
    let moving = true;
    for (let i = 2; i < 2000 && moving; i++) {
      ({ state, moving } = stepNavigator(
        state,
        [drag('orbit', 0, 0)],
        i * 16,
        ALL_OFF,
        RAD_PER_PX,
      ));
    }
    expect(moving).toBe(false);
    expect(state.velocity.orbit).toEqual([0, 0]);
    expect(state.held).toBe('orbit');
  });

  it('steady hold moves at the drag rate', () => {
    let state = stepNavigator(NAV_AT_REST, [], 0, ALL_ON, RAD_PER_PX).state;
    let delta = {};
    for (let i = 1; i <= 600; i++) {
      ({ state, delta } = stepNavigator(
        state,
        [drag('orbit', 10, -4)],
        i * 16,
        ALL_ON,
        RAD_PER_PX,
      ));
    }
    expect(delta).toEqual({
      orbit: [expect.closeTo(10 * RAD_PER_PX, 9), expect.closeTo(-4 * RAD_PER_PX, 9)],
    });
  });

  it('moving falls exactly once', () => {
    let state = coasting(0);
    const trace: boolean[] = [];
    for (let i = 1; i <= 1000; i++) {
      const r = stepNavigator(state, [], i * 16, ALL_ON, RAD_PER_PX);
      state = r.state;
      trace.push(r.moving);
    }
    const firstFalse = trace.indexOf(false);
    expect(firstFalse).toBeGreaterThan(0);
    expect(trace.slice(firstFalse).every((m) => !m)).toBe(true);
  });

  it('zero axes are omitted', () => {
    let state = stepNavigator(NAV_AT_REST, [], 0, ALL_ON, RAD_PER_PX).state;
    let delta = {};
    for (let i = 1; i <= 5; i++) {
      ({ state, delta } = stepNavigator(state, [drag('orbit', 3, 2)], i * 16, ALL_ON, RAD_PER_PX));
    }
    expect(Object.keys(delta)).toEqual(['orbit']);
  });

  it('a gestureEnd in the same frame applies the final delta before releasing', () => {
    const start: NavigatorState = { ...NAV_AT_REST, held: 'orbit', lastNowMs: 0 };
    const stillHeld = stepNavigator(start, [drag('orbit', 10, 0)], 16, ALL_ON, RAD_PER_PX);
    const released = stepNavigator(
      start,
      [drag('orbit', 10, 0), { kind: 'gestureEnd' }],
      16,
      ALL_ON,
      RAD_PER_PX,
    );
    expect(released.state.held).toBeNull();
    expect(released.state.velocity.orbit[0]).toBeGreaterThan(0);
    expect(released.state.velocity).toEqual(stillHeld.state.velocity);
  });
});
