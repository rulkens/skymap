/**
 * HII_TIERS — the ONE table `createGalaxyRenderTargets.ts` and
 * `createGalaxyEngine.ts` both loop over for the three HII sub-tiers that
 * each get their own render target, divisor and timing slot: shells, young
 * stars, and DIG (see `docs/research/milky-way/hii-regions.md`).
 * `'hii:extras'` stays its own thing (`hiiTex`'s single pass), not a fourth
 * row — see `HiiTierSpec`'s own doc.
 *
 * Row order is draw/composite/HUD order, shared with `timingSlots.ts` —
 * reordering a row here moves the HUD row and composite order together.
 */
import type { HiiTierSpec } from '../../@types/engine/HiiTierSpec';

export const HII_TIERS: readonly HiiTierSpec[] = [
  { kind: 'shells', label: 'hii:shells', divisorKey: 'shellsDivisor' },
  { kind: 'young', label: 'hii:young', divisorKey: 'youngDivisor' },
  { kind: 'dig', label: 'hii:dig', divisorKey: 'digDivisor' },
];
