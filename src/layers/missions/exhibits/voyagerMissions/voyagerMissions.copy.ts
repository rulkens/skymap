/**
 * Every word a visitor reads in the Voyager missions exhibit, hand-written and owner-owned.
 * New copy goes through the `copy` skill (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitProseSection } from '../../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../../@types/exhibits/ExhibitSourcesSection';

export const LABEL = 'The Voyager missions';

export const LEDE =
  'Two spacecraft launched sixteen days apart in 1977. Between them they passed all four giant planets, and both still send data from beyond the edge of the solar wind.';

export const THE_VOYAGER_MISSIONS: ExhibitProseSection = {
  heading: 'The Voyager missions',
  text: 'NASA sent the twin Voyagers to study Jupiter and Saturn up close. Voyager 2 went on to Uranus and Neptune. Since 1989 both have been on an interstellar mission, measuring where the Sun’s influence ends and what lies beyond it.',
};

export const TIMELINE_HEADING = 'Timeline';

// The timeline's tabs, in order; the first opens.
export const CRAFTS = [
  { bodyId: 'voyager1', label: 'Voyager 1' },
  { bodyId: 'voyager2', label: 'Voyager 2' },
];

export const THE_GRAND_TOUR: ExhibitProseSection = {
  heading: 'The Grand Tour',
  text: 'In the late 1970s the outer planets lined up in a way that comes round about once every 175 years, so one craft could swing from each giant to the next. Voyager 2 flew the whole route. Voyager 1 left it for a close look at Titan.',
};

export const THE_GOLDEN_RECORD: ExhibitProseSection = {
  heading: 'The Golden Record',
  text: 'Each craft carries a gold-plated record of greetings in 55 languages, 90 minutes of music and 115 images. Its cover uses 14 pulsars to show where the Sun is.',
};

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Data',
      title: 'Horizons System, Voyager 1 (−31) and 2 (−32) vectors',
      citation: 'JPL Solar System Dynamics',
      href: 'https://ssd.jpl.nasa.gov/horizons/',
    },
    {
      role: 'Mission',
      title: 'Voyager mission',
      citation: 'NASA Science',
      href: 'https://science.nasa.gov/mission/voyager/',
    },
    {
      role: 'Heliopause',
      title: 'In situ observations of interstellar plasma with Voyager 1',
      citation: 'Gurnett et al. 2013, Science 341:1489',
      href: 'https://doi.org/10.1126/science.1241681',
    },
    {
      role: 'Record',
      title: 'The Golden Record',
      citation: 'NASA/JPL',
      href: 'https://science.nasa.gov/mission/voyager/golden-record/',
    },
  ],
};
