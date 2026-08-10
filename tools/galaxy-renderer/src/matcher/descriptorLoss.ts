/**
 * descriptorLoss — weighted squared distance between two `GalaxyDescriptor`s.
 * Ported verbatim from the spike's `galaxy-matcher.js`. Each structural channel
 * (radial profile, axis ratio, inner/outer colour, arm harmonics, dust) is a
 * squared gap scaled by its per-category weight, so the fit loop can silence
 * channels that are meaningless for a given morphology by zeroing their weight
 * rather than branching on category.
 */
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';
import type { DescriptorWeights } from '../../@types/matcher/DescriptorWeights';

const NB = 15; // radial profile bins — must match computeDescriptor

export function descriptorLoss(
  a: GalaxyDescriptor,
  b: GalaxyDescriptor,
  w: DescriptorWeights,
): number {
  let pf = 0;
  for (let i = 0; i < NB; i++) {
    const d = a.fluxFrac[i]! - b.fluxFrac[i]!;
    pf += d * d;
  }
  const dq = a.q - b.q;
  const ci = a.colorInner - b.colorInner,
    co = a.colorOuter - b.colorOuter;
  let ar = 0;
  for (let i = 0; i < 6; i++) {
    const d = a.arm[i]! - b.arm[i]!;
    ar += d * d;
  }
  const du = a.dustIdx - b.dustIdx;
  return (
    w.profile * pf + w.q * dq * dq + w.color * (ci * ci + co * co) + w.arm * ar + w.dust * du * du
  );
}
