import type { Tier } from '../../@types/data/Tier';

/**
 * tierToTexturePx — maps a `Tier` to the square texture's pixel edge.
 *
 * This mapping IS the fetch filename contract: the build pipeline emits
 * `<body>-<px>.jpg` (and `saturn-ring-<px>.png`) at exactly these three sizes,
 * and the runtime fetcher reconstructs the same URL from the tier. Keeping the
 * mapping in one small pure function means the build and the runtime can never
 * drift onto different size ladders — a mismatch would be a silent 404, not a
 * type error. The three tiers double each step (2k → 4k → 8k), matching the
 * mip-friendly powers of two the GPU wants.
 */
export function tierToTexturePx(tier: Tier): number {
  switch (tier) {
    case 'small':
      return 2048;
    case 'medium':
      return 4096;
    case 'large':
      return 8192;
  }
}
