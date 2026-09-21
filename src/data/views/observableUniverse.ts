/**
 * observableUniverse — the whole horizon shell in frame, everything catalogued
 * reduced to the knot at its centre. Copy is hand-written and user-owned;
 * nothing generates this file. `fitRadiusMpc` re-derives `pose.distance` at fly
 * time (`viewBodySaga.ts`) so the sphere fits the live viewport at any aspect;
 * `pose.distance` below is only the pre-runtime fallback — the landscape answer
 * at the default 60° FOV (`R / sin(fovY/2)`).
 */

import type { View } from '../../@types/views/View';
import { HORIZON_RADIUS_MPC } from '../rendering/horizonRadiusMpc';

export const observableUniverse: View = {
  id: 'observableUniverse',
  label: 'Observable Universe',
  settings: {},
  fitRadiusMpc: HORIZON_RADIUS_MPC,
  pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 28600 },
  lede: 'Everything whose light has had time to reach us since the Big Bang. The shell is the far edge of that — a sphere some 46 billion light-years in every direction, centred on us.',
  body: [
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'The shell is a boundary, not an object: there is nothing at that distance to look at, and the sphere is drawn rather than observed. Everything the catalogues actually hold is the bright knot at the centre — the deepest survey here reaches a few hundred megaparsecs, a few percent of the way out. The rest is the part of the universe we know is there and cannot see.',
    },
    {
      kind: 'prose',
      heading: 'Why 46 billion and not 13.8',
      text: 'The universe is 13.8 billion years old, so nothing arriving now has been travelling longer than that. But space expanded while the light was in flight, carrying its source away behind it: the matter that emitted the oldest light we can collect is some 46 billion light-years off today. That oldest light is the <a href="https://en.wikipedia.org/wiki/Cosmic_microwave_background">cosmic microwave background</a>, released about 380,000 years after the Big Bang, when the universe first cooled enough to turn transparent. Before that there is nothing to see, at any wavelength.',
    },
    {
      kind: 'facts',
      facts: [
        { label: 'Radius', value: '46.5 billion ly' },
        { label: 'In parsecs', value: '14.3 Gpc' },
        { label: 'Age', value: '13.8 billion years' },
        { label: 'Oldest light', value: 'CMB, 380,000 yr' },
      ],
    },
    {
      kind: 'sources',
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
    },
  ],
};
