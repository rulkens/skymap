import { describe, expect, it } from 'vitest';
import { createPickCodeAllocator } from '../../../../src/services/engine/selection/createPickCodeAllocator';

describe('createPickCodeAllocator', () => {
  it('same layer and id return the same code', () => {
    const a = createPickCodeAllocator();
    expect(a.codeOf('body', 'planet')).toBe(a.codeOf('body', 'planet'));
  });

  it('two layers with the same id get different codes', () => {
    const a = createPickCodeAllocator();
    expect(a.codeOf('one', 'points')).not.toBe(a.codeOf('two', 'points'));
  });

  it('a seeded id returns its seed value', () => {
    const a = createPickCodeAllocator({ body: { planet: 9 } });
    expect(a.codeOf('body', 'planet')).toBe(9);
  });

  it('an unseeded id never takes a seeded code', () => {
    const a = createPickCodeAllocator({ body: { planet: 0, moon: 1 } });
    expect(a.codeOf('other', 'x')).toBe(2);
  });

  it('throws when a 63rd code is asked for', () => {
    const a = createPickCodeAllocator();
    for (let i = 0; i < 62; i++) a.codeOf('layer', `id${i}`);
    expect(() => a.codeOf('layerX', 'overflow')).toThrow(/layerX.*overflow/);
  });

  it('ownerOf inverts codeOf', () => {
    const a = createPickCodeAllocator();
    const code = a.codeOf('body', 'planet');
    expect(a.ownerOf(code)).toEqual({ layer: 'body', pickSourceId: 'planet' });
    expect(a.ownerOf(code + 1)).toBeNull();
  });
});
