import type { Tier } from '../../../../@types/data/Tier';

/** Jittered frames averaged after the view stops; each one re-renders the whole scene. */
export const DENSITY_SAMPLE_CAP_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 8,
  medium: 16,
  large: 16,
};
