import type { Place } from '../@types/Place';

const FEATURED = '/images/featured';

/**
 * Places to start on Home. `hash` is an app deep-link body; `image` is the
 * app's own palette card thumbnail, a root file of the main shell.
 */
export const PLACES: readonly Place[] = [
  { id: 'earth', name: 'Earth, tonight', image: `${FEATURED}/body-earth.webp`, hash: 'focus=body-earth' },
  { id: 'moon', name: 'The Moon', factId: 'moon-distance', image: `${FEATURED}/body-moon.webp`, hash: 'focus=body-moon' },
  { id: 'saturn', name: 'Saturn', factId: 'saturn-distance', image: `${FEATURED}/body-saturn.webp`, hash: 'focus=body-saturn' },
  { id: 'voyager1', name: 'Voyager 1', factId: 'voyager1-light-day', image: `${FEATURED}/body-voyager1.webp`, hash: 'focus=body-voyager1' },
  { id: 'betelgeuse', name: 'Betelgeuse', factId: 'betelgeuse-distance', image: `${FEATURED}/star-betelgeuse.webp`, hash: 'focus=star-betelgeuse' },
  { id: 'sgr-a', name: 'Sagittarius A*', factId: 'sgr-a-distance', image: `${FEATURED}/blackhole-sgr-a-star.webp`, hash: 'focus=blackhole-sgr-a-star' },
  { id: 'andromeda', name: 'Andromeda', factId: 'andromeda-distance', image: `${FEATURED}/m31.webp`, hash: 'focus=m31' },
  { id: 'virgo', name: 'The Virgo cluster', factId: 'virgo-distance', image: `${FEATURED}/cluster-virgo-m87.webp`, hash: 'focus=cluster-virgo-m87' },
  { id: 'laniakea', name: 'Laniakea', image: `${FEATURED}/supercluster-laniakea-sc.webp`, hash: 'focus=supercluster-laniakea-sc' },
];
