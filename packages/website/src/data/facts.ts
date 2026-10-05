import type { Fact } from '../@types/Fact';

/** Every number the site shows. `source` is where a reader verifies it; `checked` is when we last did. */
export const FACTS: readonly Fact[] = [
  {
    id: 'moon-distance',
    text: 'The Moon is about 1.3 light-seconds from Earth.',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
    checked: '2026-10-05',
    evidence: 'Mean distance 384,400 km divided by the speed of light is 1.28 s.',
  },
  {
    id: 'saturn-distance',
    text: 'Saturn is between 67 and 92 light-minutes from Earth, depending on where both planets are on their orbits.',
    source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html',
    checked: '2026-10-05',
    evidence: 'Fact sheet range 1,205.5 to 1,658.6 million km, divided by the speed of light.',
  },
  {
    id: 'voyager1-light-day',
    text: 'Voyager 1 reaches one light-day from Earth on 18 November 2026.',
    source: 'https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/',
    checked: '2026-10-05',
  },
  {
    id: 'betelgeuse-distance',
    text: 'Betelgeuse is about 550 light-years away (168 parsecs, with an uncertainty of +27 and -15).',
    source: 'https://arxiv.org/abs/2006.09837',
    checked: '2026-10-05',
  },
  {
    id: 'sgr-a-distance',
    text: 'Sagittarius A* is about 26,700 light-years away (8,178 parsecs).',
    source: 'https://arxiv.org/abs/1904.05721',
    checked: '2026-10-05',
  },
  {
    id: 'virgo-distance',
    text: 'The Virgo cluster is about 54 million light-years away (16.5 megaparsecs).',
    source: 'https://arxiv.org/abs/astro-ph/0702510',
    checked: '2026-10-05',
  },
];
