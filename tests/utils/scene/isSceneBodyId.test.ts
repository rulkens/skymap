import { describe, it, expect } from 'vitest';

import { isSceneBodyId } from '../../../src/utils/scene/isSceneBodyId';

describe('isSceneBodyId', () => {
  it('accepts a real SCENE_BODIES id', () => {
    expect(isSceneBodyId('earth')).toBe(true);
  });

  it('rejects an id outside SCENE_BODIES', () => {
    expect(isSceneBodyId('not-a-body')).toBe(false);
  });
});
