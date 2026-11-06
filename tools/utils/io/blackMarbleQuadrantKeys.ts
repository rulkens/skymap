/**
 * `BLACK_MARBLE_QUADRANT_KEYS` - the raw-data key of each Black Marble 2016
 * (500 m) night-lights quadrant, shaped like `BMNG_QUADRANT_KEYS`: the night
 * bake reads their pixels and `fetchTextures` downloads them from this one list.
 */

import type { ImageryQuadrant } from '../../textures/quadrantImagerySource';
import type { RawDataKey } from './rawDataRegistry';

export const BLACK_MARBLE_QUADRANT_KEYS = {
  A1: 'textures.blackMarbleQuadrantA1',
  A2: 'textures.blackMarbleQuadrantA2',
  B1: 'textures.blackMarbleQuadrantB1',
  B2: 'textures.blackMarbleQuadrantB2',
  C1: 'textures.blackMarbleQuadrantC1',
  C2: 'textures.blackMarbleQuadrantC2',
  D1: 'textures.blackMarbleQuadrantD1',
  D2: 'textures.blackMarbleQuadrantD2',
} as const satisfies Record<ImageryQuadrant, RawDataKey>;
