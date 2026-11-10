/**
 * Every word a visitor reads in the Zone of Avoidance exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitFact } from '../../../@types/exhibits/ExhibitFact';
import type { ExhibitProseSection } from '../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'Zone of Avoidance';

export const LEDE =
  'About a fifth of the extragalactic sky is blocked by our own galaxy. The band marks where the dust and stars of the Milky Way’s disc hide whatever lies behind them.';

export const WHAT_YOURE_SEEING: ExhibitProseSection = {
  heading: 'What you’re seeing',
  text: 'The haze follows the plane of the Milky Way, where the galaxy catalogues thin out and stop. That gap is not empty space; it is the part of the sky optical surveys cannot see through. The band is a guide drawn over the gap, not measured data.',
};

export const WHY_IT_IS_THERE: ExhibitProseSection = {
  heading: 'Why it is there',
  text: 'Dust in the galactic disc absorbs visible light, and the disc’s own stars crowd out anything faint behind them. Longer wavelengths get through: neutral hydrogen radiates at 21 cm, where the Milky Way is effectively transparent, and near-infrared surveys recover much of what optical ones lose. The first two galaxies found this way, <a href="https://en.wikipedia.org/wiki/Maffei_1">Maffei 1 and 2</a>, turned up in 1968.',
};

export const FACTS: readonly ExhibitFact[] = [
  { label: 'Obscured sky', value: '~20%' },
  { label: 'Sees through', value: '21 cm (H I)' },
  { label: 'First detections', value: 'Maffei 1 & 2, 1968' },
  { label: 'First described', value: 'Proctor, 1878' },
];

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Review',
      title: 'The Universe behind the Milky Way',
      citation: 'Kraan-Korteweg & Lahav 2000',
      href: 'https://arxiv.org/abs/astro-ph/0005501',
    },
  ],
};
