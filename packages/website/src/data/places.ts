import type { Place } from '../@types/Place';

/**
 * Places to start on Home. `hash` is an app deep-link body; `shot` is the
 * thumbnail's row in the shot manifest and `loop` its film's in the loop manifest.
 */
export const PLACES: readonly Place[] = [
  // The app's own label for home, borrowed (it is in the flight above the Milky Way).
  { id: 'earth', name: 'Earth, now', note: 'you are here', shot: 'place-earth', loop: 'place-earth', hash: 'focus=body-earth' },
  { id: 'moon', name: 'The Moon', factId: 'moon-distance', shot: 'place-moon', loop: 'place-moon', hash: 'focus=body-moon' },
  { id: 'saturn', name: 'Saturn', factId: 'saturn-distance', shot: 'place-saturn', loop: 'place-saturn', hash: 'focus=body-saturn' },
  { id: 'voyager1', name: 'Voyager 1', factId: 'voyager1-light-day', shot: 'place-voyager1', loop: 'place-voyager1', hash: 'focus=body-voyager1' },
  { id: 'betelgeuse', name: 'Betelgeuse', factId: 'betelgeuse-distance', shot: 'place-betelgeuse', loop: 'place-betelgeuse', hash: 'focus=star-betelgeuse' },
  { id: 'sgr-a', name: 'The black hole Sagittarius A*', factId: 'sgr-a-distance', shot: 'place-sgr-a', loop: 'place-sgr-a', hash: 'focus=blackhole-sgr-a-star' },
  { id: 'andromeda', name: 'Andromeda', factId: 'andromeda-distance', shot: 'place-andromeda', loop: 'place-andromeda', hash: 'focus=m31' },
  { id: 'virgo', name: 'The Virgo cluster', factId: 'virgo-distance', shot: 'place-virgo', loop: 'place-virgo', hash: 'focus=cluster-virgo-m87' },
  { id: 'laniakea', name: 'Laniakea', factId: 'laniakea-home', shot: 'place-laniakea', loop: 'place-laniakea', hash: 'focus=supercluster-laniakea-sc' },
];
