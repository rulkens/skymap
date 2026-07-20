import { test, expect } from 'vitest';
import { resolveDepthCompare } from '../../../src/utils/gpu/resolveDepthCompare';

test('resolveDepthCompare maps every (intent, reversedZ) to the right GPUCompareFunction', () => {
  // The occlusion-direction truth table: an inverted cell here silently flips
  // every NEAR0 body's occlusion with no type error (both sides are valid
  // GPUCompareFunctions), so all four cells are pinned explicitly.
  expect(resolveDepthCompare('nearer', false)).toBe('less');
  expect(resolveDepthCompare('nearer', true)).toBe('greater');
  expect(resolveDepthCompare('nearer-or-equal', false)).toBe('less-equal');
  expect(resolveDepthCompare('nearer-or-equal', true)).toBe('greater-equal');
});
