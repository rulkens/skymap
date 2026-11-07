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

/**
 * The sheet's border, in print units from the canvas edge; mirrored as
 * `MARGIN` (30) + `BAND` (7) in `fragment.wesl`. The ladder's centre line is what the
 * numbering reads, the numbers sit just inside the inner rule.
 */
export const ANTIQUE_LADDER_UNITS = 33.5;
export const ANTIQUE_NUMERAL_INSET_UNITS = 48;
export const ANTIQUE_NUMERAL_UNITS = 15;

/** RA/Dec ruling intervals (degrees) the plate picks from, ~`GAP` units apart at its centre. */
export const ANTIQUE_RULING_STEPS_DEG = [1, 2, 5, 10, 15, 20, 30, 45, 90] as const;
export const ANTIQUE_RULING_GAP_UNITS = 120;

/** `AntiqueLettering` in `fragment.wesl`: a 16-byte header, then 32-byte glyph rows. */
export const ANTIQUE_MAX_GLYPHS = 96;
export const ANTIQUE_GLYPH_BYTES = 16 + ANTIQUE_MAX_GLYPHS * 32;

/**
 * Passes the antique look does not draw: no period plate shows them. Cloud
 * shells (no globe of the 1600s drew weather), caption leader stems (an
 * engraved name sits beside its glyph) and the modern selection rings (the
 * subject is marked by the largest name instead).
 */
export const ANTIQUE_HIDDEN_PASSES: readonly string[] = [
  'cloud-shell',
  'marker-lines',
  'selection-ring',
  'near0-selection-ring',
];

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
  /** Full res: scattered star glyphs, ink r and paper knock-out g. */
  starInk: 'antique-star-ink',
  /** Full res: scattered ornaments — figure ink, plate ink, clear, wash. */
  decor: 'antique-decor',
  /** Full res: the ornaments' wash pigment. */
  decorHue: 'antique-decor-hue',
} as const;
