import { describe, it, expect } from 'vitest';
import { createFlowFieldStore } from '../../../../src/services/engine/data/createFlowFieldStore';

describe('createFlowFieldStore', () => {
  it('seeds default values', () => {
    const s = createFlowFieldStore();
    expect(s.loaded).toBe(false);
    expect(s.enabled).toBe(false);
    expect(s.mode).toBe('advect');
    expect(s.intensity).toBeGreaterThan(0);
    expect(s.intensity).toBeLessThanOrEqual(1);
    expect(s.count).toBeGreaterThan(0);
  });

  it('setLoaded flips loaded true', () => {
    const s = createFlowFieldStore();
    s.setLoaded();
    expect(s.loaded).toBe(true);
  });

  it('setEnabled toggles enabled', () => {
    const s = createFlowFieldStore();
    s.setEnabled(true);
    expect(s.enabled).toBe(true);
    s.setEnabled(false);
    expect(s.enabled).toBe(false);
  });

  it('setMode switches between advect and streamline', () => {
    const s = createFlowFieldStore();
    s.setMode('streamline');
    expect(s.mode).toBe('streamline');
    s.setMode('advect');
    expect(s.mode).toBe('advect');
  });

  it('setIntensity clamps to [0, 1]', () => {
    const s = createFlowFieldStore();
    s.setIntensity(2);
    expect(s.intensity).toBe(1);
    s.setIntensity(-1);
    expect(s.intensity).toBe(0);
  });

  it('setCount clamps to [0, ceiling]', () => {
    const s = createFlowFieldStore();
    s.setCount(10_000_000);
    expect(s.count).toBe(40000);
    s.setCount(-5);
    expect(s.count).toBe(0);
  });

  it('setTrail / setFlowSpeed / setDensityBias / setWander each set their field', () => {
    const s = createFlowFieldStore();
    s.setTrail(0.5);
    s.setFlowSpeed(0.25);
    s.setDensityBias(0.4);
    s.setWander(0.1);
    expect(s.trail).toBe(0.5);
    expect(s.flowSpeed).toBe(0.25);
    expect(s.densityBias).toBe(0.4);
    expect(s.wander).toBe(0.1);
  });

  it('store is frozen', () => {
    const s = createFlowFieldStore();
    expect(Object.isFrozen(s)).toBe(true);
  });
});
