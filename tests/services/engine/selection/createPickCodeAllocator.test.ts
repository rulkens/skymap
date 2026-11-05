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

  it('codes run densely from 1 and throw past 62', () => {
    const a = createPickCodeAllocator();
    const codes = Array.from({ length: 62 }, (_, i) => a.codeOf('layer', `id${i}`));
    expect(codes[0]).toBe(1);
    expect(codes[61]).toBe(62);
    expect(() => a.codeOf('layerX', 'overflow')).toThrow(/layerX.*overflow/);
  });

  it('ownerOf inverts codeOf', () => {
    const a = createPickCodeAllocator();
    const code = a.codeOf('body', 'planet');
    expect(a.ownerOf(code)).toEqual({ layer: 'body', pickSourceId: 'planet' });
    expect(a.ownerOf(code + 1)).toBeNull();
  });
});
