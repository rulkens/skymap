/**
 * structureTips — glossary content for the structure detail card's InfoTip icons.
 * Typed keys, not Record<string, …>, so the card reads them without `!`.
 */

import type { TipContent } from '../../../@types/components/infoCard/TipContent';

export const STRUCTURE_TIPS = {
  structureDistance: {
    title: 'Distance',
    body: (
      <>
        How far the centre of this structure lies from us, in parsecs and light-years. It's the
        distance to the catalogued middle; the individual member galaxies are strewn through a huge
        volume, some nearer and some farther than this single figure. Think of it as the address of
        the group's heart, not a wall at a fixed range.
      </>
    ),
  },
  structureRadius: {
    title: 'Radius',
    body: (
      <>
        The structure's physical reach: the radius of the sphere we treat as its territory, and the
        size of the ring drawn around it on the sky. It's a radius (centre to edge), not a diameter,
        so the full span across is twice this. Clusters of galaxies run to millions of light-years,
        the largest structures gravity has managed to bind together.
      </>
    ),
  },
  memberCount: {
    title: 'Member galaxies',
    body: (
      <>
        How many catalogued galaxies currently fall inside this structure's sphere, given the tiers
        and catalogs you have switched on right now. Load a deeper tier or enable more surveys and
        this climbs, because you're revealing more of the same real population, not creating new
        galaxies. Read it as "how many we can show you here," not the true head-count, which is far
        larger.
      </>
    ),
  },
  abell: {
    title: 'Abell designation',
    body: (
      <>
        The cluster's ID in the Abell catalogue, the classic 1958 census of rich galaxy clusters
        compiled by George Abell (extended to the southern sky in 1989). Abell hunted them by eye on
        photographic plates, a monumental effort long before computers could help. For example,{' '}
        <code>A1656</code> is the famous Coma Cluster.
      </>
    ),
  },
} as const satisfies Record<string, TipContent>;
