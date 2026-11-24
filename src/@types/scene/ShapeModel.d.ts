import type { Tier } from '../data/Tier';

/** A celestial body drawn from a mission shape model instead of a sphere. */
export type ShapeModel = {
  readonly meshKey: string;
  /** Baked bounding sphere, metres — the pick proxy. */
  readonly boundingRadiusM: number;
  /** The highest tier the baked mesh ships. */
  readonly tierCeiling?: Tier;
};
