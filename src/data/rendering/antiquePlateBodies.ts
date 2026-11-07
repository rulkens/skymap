/** Globes the plate ray-casts per frame, the widest on screen first; mirrored by the
 * `items` array length in `antiqueLook/plateBodies.wesl`. */
export const ANTIQUE_PLATE_BODY_CAPACITY = 4;

/** The `PlateBodies` uniform: a 16-byte count header, then 64 bytes per record. */
export const ANTIQUE_PLATE_BODIES_BYTES = 16 + ANTIQUE_PLATE_BODY_CAPACITY * 64;

/** The ring edges the plate engraves past the C ring's inner edge (that one is the
 * `SCENE_RINGS` row's), km, keyed by host body. Saturn's: B inner, the Cassini
 * division's middle, A outer. A ring without a row here is not engraved. */
export const ANTIQUE_RING_LINES_KM: Readonly<Record<string, readonly [number, number, number]>> = {
  saturn: [92_000, 119_875, 136_775],
};
