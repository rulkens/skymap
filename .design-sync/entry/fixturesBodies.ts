/**
 * Mock BodyInfo fixtures for the InfoCard body-card previews.
 *
 * Two branches of BodyDetailCard:
 *  - Famous star (id in FAMOUS_STAR_IDS + a matching meta entry): rich physical
 *    rows + prose. The mock useFamousStarsMeta supplies entries for 'sun',
 *    'betelgeuse', 'sirius', 'vega'; fixture ids must match one of those AND be
 *    a real generated star id.
 *  - Non-star body (planet / moon): only a Radius row off radiusKm — that is all
 *    the real card shows for solar-system bodies, so these previews are honest,
 *    minimal cards by design.
 */

import type { BodyInfo } from '../../src/@types/engine/BodyInfo';

/** The Sun — takes the star branch (id 'sun' is in FAMOUS_STAR_IDS + mock meta). */
export const sun: BodyInfo = {
  type: 'body',
  id: 'sun',
  label: 'The Sun',
  positionMpc: [0, 0, 0],
  radiusKm: 696340,
};

/** Betelgeuse — a red supergiant; showcases the full rich star card incl. variability. */
export const famousStar: BodyInfo = {
  type: 'body',
  id: 'betelgeuse',
  label: 'Betelgeuse',
  positionMpc: [-0.0000105, 0.0000201, 0.0000442],
  radiusKm: 617_000_000,
};

/** Jupiter — non-star body; radius-only card. */
export const planet: BodyInfo = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [1.7e-13, -4.2e-14, 9.1e-14],
  radiusKm: 69911,
};

/** The Moon — non-star body; radius-only card. */
export const moon: BodyInfo = {
  type: 'body',
  id: 'moon',
  label: 'The Moon',
  positionMpc: [1.2e-16, 3.4e-17, -8.8e-17],
  radiusKm: 1737,
};
