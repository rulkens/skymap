/**
 * Every word a visitor reads in the Cosmic Flows exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitFact } from '../../../@types/exhibits/ExhibitFact';
import type { ExhibitKeySection } from '../../../@types/exhibits/ExhibitKeySection';
import type { ExhibitProseSection } from '../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'Cosmic Flows';

export const LEDE =
  'Everything in the universe is moving. Scientists have mapped the motions of galaxies, forming a cosmic flow.';

export const WHAT_YOURE_SEEING: ExhibitProseSection = {
  heading: 'What you’re seeing',
  text: "Superclusters attract galaxies around them, voids, with less mass, let them drain away. The particles you're seeing are not galaxies, but show where and how fast they are moving through space.",
};

export const HOW_IT_WAS_MADE: ExhibitProseSection = {
  heading: 'How it was made',
  text: '<a href="https://en.wikipedia.org/wiki/Redshift">Redshift</a> tells us how fast a galaxy moves away from us, but most of that speed is the expansion of space. Cosmicflows-4 measured the distances of about 56,000 galaxies a second way. Subtract the expansion, and each galaxy\'s <a href="https://en.wikipedia.org/wiki/Peculiar_velocity">own motion</a> is left over.',
};

export const LANIAKEA: ExhibitProseSection = {
  heading: 'Laniakea',
  text: 'In 2014 Brent Tully’s team mapped where galaxies, ours included, fall towards the Great Attractor. They named the region <a href="https://en.wikipedia.org/wiki/Laniakea_Supercluster">Laniakea</a>, Hawaiian for “immense heaven”. It is 520 million light-years across.',
};

export const KEY: Pick<ExhibitKeySection, 'heading' | 'ends'> = {
  heading: 'Speed',
  // The top end is `SPEED_COLOR_MAX` in `shaders/flow/constants.wesl`; about 1% of the field is faster and clamps to it.
  ends: ['0 km/s', '1200+ km/s'],
};

// Width: the 1000 Mpc box, at 3.26 Mly per Mpc.
export const FACTS: readonly ExhibitFact[] = [
  { label: 'Galaxies measured', value: '55,877' },
  { label: 'Width mapped', value: '3.3 billion light-years' },
];

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Data',
      title: 'CF4++ velocity reconstruction',
      citation: 'Courtois et al. 2025',
      href: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
    },
    {
      role: 'Catalogue',
      title: 'Cosmicflows-4',
      citation: 'Tully et al. 2023',
      href: 'https://doi.org/10.3847/1538-4357/ac94d8',
    },
    {
      role: 'Concept',
      title: 'The Laniakea supercluster of galaxies',
      citation: 'Tully et al. 2014',
      href: 'https://arxiv.org/abs/1409.0880',
    },
    {
      role: 'Video',
      title: 'Laniakea: Our home supercluster',
      citation: 'Nature Video 2014',
      href: 'https://www.youtube.com/watch?v=rENyyRwxpHo',
      video: true,
    },
  ],
};
