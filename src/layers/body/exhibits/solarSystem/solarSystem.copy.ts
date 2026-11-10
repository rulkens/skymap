/**
 * Every word a visitor reads in the Solar System exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitFact } from '../../../../@types/exhibits/ExhibitFact';
import type { ExhibitProseSection } from '../../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'Solar System';

export const LEDE =
  'One star, eight planets, and mostly distance. The Sun holds about 99.8% of the mass; the rest is spread across orbits that take from 88 days to 165 years.';

export const WHAT_YOURE_SEEING: ExhibitProseSection = {
  heading: 'What you’re seeing',
  text: 'The rings are the planets’ orbits and the planets sit on them, moving as the clock runs. The four inner orbits are crowded around the centre: Mercury is 0.39 times Earth’s distance from the Sun, Neptune thirty times it. Most of what the view shows is the gap between the two groups.',
};

export const HOW_IT_WAS_MADE: ExhibitProseSection = {
  heading: 'How it was made',
  text: 'The orbits come from JPL’s table of approximate Keplerian elements — six numbers per planet, plus the rate each of them drifts per century. The same six place the planet and draw its ring, so a planet always sits on its own orbit rather than near it.',
};

export const FACTS: readonly ExhibitFact[] = [
  { label: 'Planets', value: '8' },
  { label: 'Sun’s share of mass', value: '99.8%' },
  { label: 'Innermost orbit', value: '0.39 AU' },
  { label: 'Outermost orbit', value: '30 AU' },
];

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Data',
      title: 'Keplerian elements for approximate positions of the major planets',
      citation: 'JPL Solar System Dynamics',
      href: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    },
  ],
};
