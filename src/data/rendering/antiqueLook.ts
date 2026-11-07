/** The antique look's sizing constants and target ids, shared by its rows, packers and pass. */

/** Canvas height (CSS px) at which a print unit is one CSS px: the plate scales with the window. */
export const ANTIQUE_REFERENCE_HEIGHT_CSS = 900;

/** One quarter-res cell per 4×4 print texels: scales the quarter-res rows and sets the
 * glyph pass's instance count; mirrored as `CELL` in `reduce.wesl`. */
export const ANTIQUE_CELL = 4;

/** Camera distance from the Sun (Mpc) over which ornaments go from star chart to cosmos. */
export const ANTIQUE_REGIME_MPC = [0.003, 0.03] as const;

/** Sizes of io.wesl `AntiqueUniforms`, ornaments.wesl `AntiqueOrnaments` and fragment.wesl
 * `AntiqueLettering` (each list: a 16-byte header, then fixed rows). */
export const ANTIQUE_UNIFORM_BYTES = 96;
export const ANTIQUE_MAX_ORNAMENTS = 16;
export const ANTIQUE_ORNAMENT_BYTES = 16 + ANTIQUE_MAX_ORNAMENTS * 64;
export const ANTIQUE_MAX_GLYPHS = 96;
export const ANTIQUE_GLYPH_BYTES = 16 + ANTIQUE_MAX_GLYPHS * 32;

/** The border in print units from the canvas edge: the ladder's centre line
 * (`MARGIN` + `BAND` / 2 in `fragment.wesl`) is what the numbering reads. */
export const ANTIQUE_LADDER_UNITS = 33.5;
export const ANTIQUE_NUMERAL_INSET_UNITS = 50;
export const ANTIQUE_NUMERAL_UNITS = 22;

/** RA/Dec ruling intervals (degrees) the plate picks from, ~`GAP` units apart at its centre. */
export const ANTIQUE_RULING_STEPS_DEG = [1, 2, 5, 10, 15, 20, 30, 45, 90] as const;
export const ANTIQUE_RULING_GAP_UNITS = 120;

/** Passes no period plate shows: cloud shells (no 1600s globe drew weather), leader
 * stems (an engraved name sits beside its glyph), selection rings. */
export const ANTIQUE_HIDDEN_PASSES: readonly string[] = [
  'cloud-shell',
  'marker-lines',
  'selection-ring',
  'near0-selection-ring',
];

/** Passes that exist only for the look: they draw nothing with it off. */
export const ANTIQUE_ONLY_PASSES: readonly string[] = ['earth-ocean-mask'];

/** Passes the look moves off their line onto a row of its own, which the plate inks
 * as line work: the quarter-res reduce would average a 1-px line away. */
export const ANTIQUE_MOVED_PASSES: Readonly<Record<string, string>> = {
  constellations: 'antique-lines',
};

/** The land row's format: r land share, g covered (`earth/fragment.wesl` `fsOceanMask`). */
export const ANTIQUE_LAND_FORMAT: GPUTextureFormat = 'rg8unorm';

/** The look's row ids; each row's channels are documented by the shader that writes it. */
export const ANTIQUE_TARGETS = {
  print: 'print',
  overlay: 'overlay',
  paper: 'antique-paper',
  wash: 'antique-wash',
  glow: 'antique-glow',
  peaks: 'antique-peaks',
  stars: 'antique-stars',
  starInk: 'antique-star-ink',
  decor: 'antique-decor',
  decorHue: 'antique-decor-hue',
  land: 'antique-land',
  lines: 'antique-lines',
} as const;
