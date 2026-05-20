import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLabelStyleOverride,
  setLabelStyleOverride,
  clearLabelStyleOverride,
  type LabelStyleOverrideTarget,
} from '../../../src/services/engine/labelStyleOverride';

describe('labelStyleOverride', () => {
  beforeEach(() => clearLabelStyleOverride());

  it('returns null target when no override is set', () => {
    expect(getLabelStyleOverride().targetCategory).toBeNull();
  });

  it('stores the most recent override', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.05,
      glowColor: [0, 0, 1, 0.5],
      glowEmFrac: 0.2,
    });
    const v = getLabelStyleOverride();
    expect(v.targetCategory).toBe<LabelStyleOverrideTarget>('cluster');
    expect(v.outlineColor).toEqual([1, 0, 0, 1]);
    expect(v.outlineEmFrac).toBe(0.05);
    expect(v.glowColor).toEqual([0, 0, 1, 0.5]);
    expect(v.glowEmFrac).toBe(0.2);
  });

  it('clearLabelStyleOverride resets targetCategory to null', () => {
    setLabelStyleOverride({
      targetCategory: 'void',
      outlineColor: [0, 0, 0, 0],
      outlineEmFrac: 0,
      glowColor: [0, 0, 0, 0],
      glowEmFrac: 0,
    });
    clearLabelStyleOverride();
    expect(getLabelStyleOverride().targetCategory).toBeNull();
  });
});
