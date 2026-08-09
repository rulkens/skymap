/**
 * HII_TIERS — the ONE table `createGalaxyRenderTargets.ts` and
 * `createGalaxyEngine.ts` both loop over for the three HII sub-tiers that
 * each get their own render target, divisor and timing slot: shells, young
 * stars, and DIG (the diffuse ionized gas veil, the original split this
 * table generalizes — see `docs/research/milky-way/hii-regions.md`).
 * `'hii:extras'` stays its own thing (`hiiTex`'s single pass), not a fourth
 * row — see `HiiTierSpec`'s own doc.
 *
 * Row order is draw/composite/HUD order: every array `drawFrame` walks with
 * this table (per-tier passes, the scene composite) and `timingSlots.ts`'s
 * own list share it, so reordering a row here moves the HUD row and the
 * composite order together rather than drifting apart.
 */
import type { HiiTierSpec } from '../../@types/engine/HiiTierSpec';

export const HII_TIERS: readonly HiiTierSpec[] = [
  { kind: 'shells', label: 'hii:shells', divisorKey: 'shellsDivisor' },
  { kind: 'young', label: 'hii:young', divisorKey: 'youngDivisor' },
  { kind: 'dig', label: 'hii:dig', divisorKey: 'digDivisor' },
];
