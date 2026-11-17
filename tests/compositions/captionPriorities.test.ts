/**
 * Every caption's priority is authored by the Layer that owns it, so this is the one place
 * the whole order reads top to bottom. Captions are a navigation aid: the descent's landmarks
 * must stay named, so the Sun and the solar system outrank whatever merely looms larger, and
 * the star map and the constellation names yield to them.
 */

import { describe, expect, it } from 'vitest';
import { BLACK_HOLE_CAPTION_PRIORITY } from '../../src/layers/blackHoles/markers/data/blackHoleCaptionPriority';
import { BODY_CAPTION_ROWS } from '../../src/layers/body/labels/data/bodyCaptionRows';
import { CONSTELLATION_CAPTION_PRIORITY } from '../../src/layers/constellations/figures/data/constellationCaptionPriority';
import { LIGHT_TIME_CAPTION_PRIORITY } from '../../src/layers/lightTime/spheres/data/lightTimeCaptionPriority';
import { MESH_BODY_CAPTION_PRIORITY } from '../../src/layers/missions/craft/data/meshBodyCaptionPriority';
import { STAR_CAPTION_STYLES } from '../../src/layers/starCatalog/captions/present/starCaptionStyles';

describe('caption priorities across Layers', () => {
  it('reads sun, earth, planet, small body, Sgr A*, mesh body, star, constellation, descending', () => {
    const descending = [
      STAR_CAPTION_STYLES.sun.priority,
      BODY_CAPTION_ROWS.earth.priority,
      BODY_CAPTION_ROWS.planet.priority,
      BODY_CAPTION_ROWS.smallBody.priority,
      BLACK_HOLE_CAPTION_PRIORITY,
      MESH_BODY_CAPTION_PRIORITY,
      STAR_CAPTION_STYLES.famousStar.priority,
      CONSTELLATION_CAPTION_PRIORITY,
    ];
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(new Set(descending).size).toBe(descending.length);
  });

  it('ranks the light-time captions with the craft captions', () => {
    expect(LIGHT_TIME_CAPTION_PRIORITY).toBe(MESH_BODY_CAPTION_PRIORITY);
  });
});
