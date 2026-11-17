/**
 * Every word a visitor reads in the Observable Universe exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitFact } from '../../../../@types/exhibits/ExhibitFact';
import type { ExhibitProseSection } from '../../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'Observable Universe';

export const LEDE =
  'Everything whose light has had time to reach us since the Big Bang. The shell is the far edge of that — a sphere some 46 billion light-years in every direction, centred on us.';

export const WHAT_YOURE_SEEING: ExhibitProseSection = {
  heading: 'What you’re seeing',
  text: 'The shell is a boundary, not an object: there is nothing at that distance to look at, and the sphere is drawn rather than observed. Everything the catalogues actually hold is the bright knot at the centre — the deepest survey here reaches a few hundred megaparsecs, a few percent of the way out. The rest is the part of the universe we know is there and cannot see.',
};

export const WHY_46_BILLION: ExhibitProseSection = {
  heading: 'Why 46 billion and not 13.8',
  text: 'The universe is 13.8 billion years old, so nothing arriving now has been travelling longer than that. But space expanded while the light was in flight, carrying its source away behind it: the matter that emitted the oldest light we can collect is some 46 billion light-years off today. That oldest light is the <a href="https://en.wikipedia.org/wiki/Cosmic_microwave_background">cosmic microwave background</a>, released about 380,000 years after the Big Bang, when the universe first cooled enough to turn transparent. Before that there is nothing to see, at any wavelength.',
};

export const FACTS: readonly ExhibitFact[] = [
  { label: 'Radius', value: '46.5 billion ly' },
  { label: 'In parsecs', value: '14.3 Gpc' },
  { label: 'Age', value: '13.8 billion years' },
  { label: 'Oldest light', value: 'CMB, 380,000 yr' },
];

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Explainer',
      title: 'Expanding Confusion: misconceptions about the expansion of the universe',
      citation: 'Davis & Lineweaver 2004',
      href: 'https://arxiv.org/abs/astro-ph/0310808',
    },
    {
      role: 'Parameters',
      title: 'Planck 2018 results. VI. Cosmological parameters',
      citation: 'Planck Collaboration 2020',
      href: 'https://arxiv.org/abs/1807.06209',
    },
  ],
};
