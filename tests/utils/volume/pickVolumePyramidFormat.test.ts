import { describe, it, expect } from 'vitest';
import { pickVolumePyramidFormat } from '../../../src/utils/volume/pickVolumePyramidFormat';

const pick = (...features: string[]) => pickVolumePyramidFormat(new Set(features)).format;

describe('pickVolumePyramidFormat', () => {
  it('ASTC needs both ASTC features', () => {
    expect(pick('texture-compression-astc', 'texture-compression-astc-sliced-3d')).toBe('astc6');
    expect(pick('texture-compression-astc')).toBe('r8');
  });

  it('BC4 needs both BC4 features', () => {
    expect(pick('texture-compression-bc', 'texture-compression-bc-sliced-3d')).toBe('bc4');
    expect(pick('texture-compression-bc')).toBe('r8');
  });

  it('ASTC wins when both families are present', () => {
    expect(
      pick(
        'texture-compression-bc',
        'texture-compression-bc-sliced-3d',
        'texture-compression-astc',
        'texture-compression-astc-sliced-3d',
      ),
    ).toBe('astc6');
  });

  it('no features picks r8', () => {
    expect(pick()).toBe('r8');
  });
});
