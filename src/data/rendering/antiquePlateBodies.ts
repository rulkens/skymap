import type { AntiqueBodyPrint } from '../../@types/rendering/AntiqueBodyPrint';

/** Globes the plate ray-casts per frame, the widest on screen first; mirrored by the
 * `items` array length in `antiqueLook/shared/plateBodies.wesl`. */
export const ANTIQUE_PLATE_BODY_CAPACITY = 4;

/** The `PlateBodies` uniform: a 16-byte count header, then 80 bytes per record. */
export const ANTIQUE_PLATE_BODIES_BYTES = 16 + ANTIQUE_PLATE_BODY_CAPACITY * 80;

/** Each body with a print convention of its own; any other is `plain`. */
export const ANTIQUE_BODY_PRINTS: Readonly<Record<string, AntiqueBodyPrint>> = {
  earth: 'earth',
  mars: 'mars',
  moon: 'moon',
  jupiter: 'jupiter',
  // Jupiter's convention reads the bands off the body's own plain texture; `plain` has no
  // tone on a lit face, so a near Saturn printed as a blank disc.
  saturn: 'jupiter',
};

/** The record's code per convention; mirrored by `PRINT_*` in `antiqueLook/shared/plateBodies.wesl`. */
export const ANTIQUE_BODY_PRINT_CODES: Readonly<Record<AntiqueBodyPrint, number>> = {
  plain: 0,
  earth: 1,
  mars: 2,
  moon: 3,
  jupiter: 4,
};

/** A body's one marked feature, body-fixed [east longitude, latitude] in degrees, read
 * off its plain texture so the plate prints it where the plain render shows it. Jupiter's
 * Great Red Spot sits at u 0.368, v 0.386 of the Cassini map (Dec 2000). The real spot
 * drifts about 118° a year in System III, which the fixed texture does not follow. */
export const ANTIQUE_BODY_SPOTS: Readonly<Record<string, readonly [number, number]>> = {
  jupiter: [-47.6, -20.5],
};

/** A globe is cast only from beyond its highest peak's radius times this; nearer,
 * its relief is the horizon and the sphere is not. */
export const ANTIQUE_PLATE_RELIEF_MARGIN = 1.02;

/** The ring edges the plate engraves past the C ring's inner edge (that one is the
 * `SCENE_RINGS` row's), km, keyed by host body. Saturn's: B inner, the Cassini
 * division's middle, A outer. A ring without a row here is not engraved. */
export const ANTIQUE_RING_LINES_KM: Readonly<Record<string, readonly [number, number, number]>> = {
  saturn: [92_000, 119_875, 136_775],
};
