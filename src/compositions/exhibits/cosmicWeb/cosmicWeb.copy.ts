/**
 * Every word a visitor reads in the Cosmic Web exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitFact } from '../../../@types/exhibits/ExhibitFact';
import type { ExhibitKeySection } from '../../../@types/exhibits/ExhibitKeySection';
import type { ExhibitProseSection } from '../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'Cosmic Web';

export const LEDE =
  'Every galaxy, ours included, sits somewhere in this web. Its strands and knots surround nearly empty voids.';

export const WHAT_YOURE_SEEING: ExhibitProseSection = {
  heading: 'What you’re seeing',
  text: 'The colour is density. Black is a void, almost empty. Pink is a filament, and pale yellow is a knot, where filaments cross and clusters of galaxies form.',
};

export const HOW_IT_WAS_MADE: ExhibitProseSection = {
  heading: 'How it was made',
  text: 'A <a href="https://en.wikipedia.org/wiki/Physarum_polycephalum">slime mould</a>, <i>Physarum polycephalum</i>, grows a network of tubes between pieces of food. In 2020 astronomers first used a simulated one to trace the cosmic web, with galaxies as the food. Here it grew from about 325,000 Sloan galaxies and 2MRS, an all-sky survey of the galaxies near us.',
};

export const KEY: Pick<ExhibitKeySection, 'heading' | 'ends'> = {
  heading: 'Density',
  ends: ['Void', 'Filament', 'Knot'],
};

// The Sloan run: 44 to 476 Mpc deep at 0.78 Mpc per cell, at 3.26 Mly per Mpc. No "nearest
// part": the 2MRS run fills the sky near us, and its input count isn't recorded (DATA.md).
export const FACTS: readonly ExhibitFact[] = [
  { label: 'Sloan galaxies', value: 'About 325,000' },
  { label: 'Finest detail', value: '2.5 million light-years' },
  { label: 'Farthest part', value: '1.6 billion light-years' },
];

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Data',
      title: 'SDSS DR17 Cosmic Slime catalog',
      citation: 'Wilde et al. 2023',
      href: 'https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold',
    },
    {
      role: 'Data',
      title: '2MASS Redshift Survey',
      citation: 'Huchra et al. 2012',
      href: 'https://doi.org/10.1088/0067-0049/199/2/26',
    },
    {
      role: 'Method',
      title: 'Monte Carlo Physarum Machine',
      citation: 'Elek et al. 2022',
      href: 'https://arxiv.org/abs/2204.01256',
    },
    {
      role: 'First use',
      title: 'Revealing the dark threads of the cosmic web',
      citation: 'Burchett et al. 2020',
      href: 'https://doi.org/10.3847/2041-8213/ab700c',
    },
    {
      role: 'Software',
      title: 'Polyphorm',
      citation: 'GitHub',
      href: 'https://github.com/CreativeCodingLab/Polyphorm',
    },
  ],
};
