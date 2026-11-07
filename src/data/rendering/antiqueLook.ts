/** The antique look's sizing constants and target ids, shared by its rows, packer and pass. */

/** `AntiqueUniforms` in `shaders/antiqueLook/io.wesl`. */
export const ANTIQUE_UNIFORM_BYTES = 96;

/**
 * Canvas height, in CSS px, at which one print unit is one CSS px: the plate's
 * line work scales with the window, so a small window reads as a small plate
 * rather than a crop of a big one.
 */
export const ANTIQUE_REFERENCE_HEIGHT_CSS = 900;

/**
 * The reduce pass's block size: one quarter-res cell per 4×4 print texels.
 * Mirrored as `CELL` in `reduce.wesl` and `fragment.wesl`.
 */
export const ANTIQUE_CELL = 4;

/**
 * Camera distance from the Sun (Mpc) over which ornaments cross from the star
 * chart (inside the Galaxy) to the cosmos (out among the galaxies, where the
 * Zone of Avoidance is real terra incognita): 3 kpc → 30 kpc.
 */
export const ANTIQUE_REGIME_MPC = [0.003, 0.03] as const;

/** `AntiqueOrnaments` in `fragment.wesl`: a 16-byte header, then 64-byte rows. */
export const ANTIQUE_MAX_ORNAMENTS = 16;
export const ANTIQUE_ORNAMENT_BYTES = 16 + ANTIQUE_MAX_ORNAMENTS * 64;

export const ANTIQUE_TARGETS = {
  /** The tone-mapped scene, in the swap format. */
  print: 'print',
  /** Captions and rings on transparent, in the swap format. */
  overlay: 'overlay',
  /** The baked sheet: albedo rgb, fibre relief alpha. */
  paper: 'antique-paper',
  /** Quarter res: block mean colour, land share on bodies in alpha. */
  wash: 'antique-wash',
  /** 1/16 res: the low band smoothed past star scale. */
  glow: 'antique-glow',
  /** Quarter res: each block's brightest sky texel. */
  peaks: 'antique-peaks',
  /** Quarter res: the peaks that survive suppression, with their contrast. */
  stars: 'antique-stars',
} as const;
