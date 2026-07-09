/**
 * descriptorLoss — weighted squared distance between two descriptors. These
 * tests build descriptors by hand (no imaging) so each property is isolated:
 * the loss is zero at identity, grows monotonically with a widening q gap, and
 * a zeroed weight channel removes that channel's contribution entirely.
 */
import { describe, expect, it } from 'vitest';
import { descriptorLoss } from '../../../../tools/galaxy-renderer/src/matcher/descriptorLoss';
import type { GalaxyDescriptor } from '../../../../tools/galaxy-renderer/@types/matcher/GalaxyDescriptor';
import type { DescriptorWeights } from '../../../../tools/galaxy-renderer/@types/matcher/DescriptorWeights';

function makeDesc(overrides: Partial<GalaxyDescriptor> = {}): GalaxyDescriptor {
  return {
    q: 0.5,
    rHalf: 10,
    fluxFrac: new Float32Array(15).fill(1 / 15),
    colorInner: 0.1,
    colorOuter: -0.05,
    arm: new Float32Array([0.2, 0.4, 0.1, 0.05, 0.02, 0.01]),
    dustIdx: 0.3,
    ...overrides,
  };
}

const w: DescriptorWeights = { profile: 6, q: 3, color: 2.4, arm: 5, dust: 2.4 };

describe('descriptorLoss', () => {
  it('is zero at identity', () => {
    const d = makeDesc();
    expect(descriptorLoss(d, d, w)).toBe(0);
  });

  it('grows monotonically with the q gap', () => {
    const base = makeDesc({ q: 0.5 });
    const near = makeDesc({ q: 0.6 });
    const far = makeDesc({ q: 0.9 });
    const lNear = descriptorLoss(base, near, w);
    const lFar = descriptorLoss(base, far, w);
    expect(lNear).toBeGreaterThan(0);
    expect(lFar).toBeGreaterThan(lNear);
  });

  it('lets each weight channel contribute independently', () => {
    const a = makeDesc();
    const b = makeDesc({
      q: 0.9,
      colorInner: 0.5,
      arm: new Float32Array([0.9, 0.1, 0.1, 0.1, 0.1, 0.1]),
      dustIdx: 0.9,
      fluxFrac: new Float32Array(15).fill(1 / 15).map((v, i) => (i === 0 ? v + 0.3 : v)),
    });

    // Zeroing a channel's weight must drop exactly that channel's term.
    const noQ = descriptorLoss(a, b, { ...w, q: 0 });
    const full = descriptorLoss(a, b, w);
    expect(noQ).toBeLessThan(full);
    expect(full - noQ).toBeCloseTo(w.q * (a.q - b.q) * (a.q - b.q), 10);

    // Killing every weight yields exactly zero regardless of the gaps.
    const dead: DescriptorWeights = { profile: 0, q: 0, color: 0, arm: 0, dust: 0 };
    expect(descriptorLoss(a, b, dead)).toBe(0);
  });
});
