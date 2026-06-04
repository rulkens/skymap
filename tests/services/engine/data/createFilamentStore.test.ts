import { describe, it, expect } from 'vitest';
import { createFilamentStore } from '../../../../src/services/engine/data/createFilamentStore';

describe('createFilamentStore', () => {
  it('starts not-loaded with zero counts', () => {
    const s = createFilamentStore();
    expect(s.loaded).toBe(false);
    expect(s.stripCount).toBe(0);
    expect(s.vertexCount).toBe(0);
  });

  it('setLoaded flips loaded and records counts', () => {
    const s = createFilamentStore();
    s.setLoaded(12, 3400);
    expect(s.loaded).toBe(true);
    expect(s.stripCount).toBe(12);
    expect(s.vertexCount).toBe(3400);
  });
});
