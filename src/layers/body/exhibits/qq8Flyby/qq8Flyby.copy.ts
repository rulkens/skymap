/**
 * Every word a visitor reads in the 2026 QQ8 exhibit, hand-written and owner-owned, the
 * timeline's dated events included. New copy goes through the `copy` skill
 * (`.claude/skills/copy/SKILL.md`).
 */

import type { ExhibitProseSection } from '../../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSourcesSection } from '../../../../@types/exhibits/ExhibitSourcesSection';
import type { TimelineEvent } from '../../../../@types/exhibits/timeline/TimelineEvent';

export const LABEL = 'The flyby of 2026 QQ8';

export const LEDE =
  'Asteroid 2026 QQ8 spent 225 days held by Earth’s gravity. The line around Earth is its path, the circle the Moon’s orbit.';

export const CAPTURED: ExhibitProseSection = {
  heading: 'Captured for 225 days',
  text: 'From 26 April to 7 December 2026, the rock moved too slowly to escape Earth’s gravity. Measured from the line between Earth and the Sun, it went three quarters of the way round us. Less than one full turn makes it a flyby.',
};

export const TIMELINE_HEADING = 'Timeline';

export const LANE = { bodyId: '2026-qq8', label: '2026 QQ8' };

// Every event names Earth, so the timeline camera frames the rock with Earth throughout. The
// first is the track's first sample; the closest pass is JPL Horizons'.
export const EVENTS: readonly TimelineEvent[] = [
  {
    id: 'qq8-approach',
    bodyId: LANE.bodyId,
    kind: 'milestone',
    iso: '2026-02-01T00:00:00.000Z',
    label: 'Approach',
    targetId: 'earth',
  },
  {
    id: 'qq8-captured',
    bodyId: LANE.bodyId,
    kind: 'boundary',
    iso: '2026-04-26T00:00:00.000Z',
    label: 'Captured',
    targetId: 'earth',
  },
  {
    id: 'qq8-closest',
    bodyId: LANE.bodyId,
    kind: 'flyby',
    iso: '2026-08-18T23:40:00.000Z',
    label: 'Closest pass',
    closestKm: 537057,
    targetId: 'earth',
  },
  {
    id: 'qq8-capture-ends',
    bodyId: LANE.bodyId,
    kind: 'boundary',
    iso: '2026-12-07T00:00:00.000Z',
    label: 'Capture ends',
    targetId: 'earth',
  },
];

export const SIZE_FROM_BRIGHTNESS: ExhibitProseSection = {
  heading: 'Size from brightness',
  text: 'Telescopes see the rock only as a point of light. Bryce Bolin’s team worked out its size from how bright it is. It is 1.4 to 2.5 metres across, depending on how much light its surface reflects.',
};

export const MOON_OR_BELT: ExhibitProseSection = {
  heading: 'Moon or asteroid belt?',
  text: '2026 QQ8 may be a piece of the Moon or a rock from the asteroid belt. The colours measured in November 2026 fit both.',
};

export const SOURCES: ExhibitSourcesSection = {
  heading: 'Sources',
  links: [
    {
      role: 'Paper',
      title: 'VLT, Keck, and Gemini characterization of the temporarily captured flyby 2026 QQ8',
      citation: 'Bolin et al. 2026, arXiv:2611.31213',
      href: 'https://arxiv.org/abs/2611.31213',
    },
    {
      role: 'Data',
      title: 'Horizons System, 2026 QQ8 vectors',
      citation: 'JPL Solar System Dynamics',
      href: 'https://ssd.jpl.nasa.gov/horizons/',
    },
    {
      role: 'Orbit',
      title: 'Small-Body Database, 2026 QQ8',
      citation: 'JPL Solar System Dynamics',
      href: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2026%20QQ8',
    },
  ],
};
