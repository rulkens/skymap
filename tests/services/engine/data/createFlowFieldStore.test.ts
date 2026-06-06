import { describe, it, expect } from 'vitest';
import { createFlowFieldStore } from '../../../../src/services/engine/data/createFlowFieldStore';

describe('createFlowFieldStore', () => {
  it('starts not loaded', () => {
    const s = createFlowFieldStore();
    expect(s.loaded).toBe(false);
  });

  it('setLoaded flips loaded true', () => {
    const s = createFlowFieldStore();
    s.setLoaded();
    expect(s.loaded).toBe(true);
  });

  it('store is frozen', () => {
    const s = createFlowFieldStore();
    expect(Object.isFrozen(s)).toBe(true);
  });
});
