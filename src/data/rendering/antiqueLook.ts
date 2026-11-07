/** The antique look's sizing constants and target ids, shared by its rows, packers and pass. */

/** Canvas height (CSS px) at which a print unit is one CSS px: the plate scales with the window. */
export const ANTIQUE_REFERENCE_HEIGHT_CSS = 900;

/** One quarter-res cell per 4×4 print texels: scales the quarter-res rows; mirrored as
 * `CELL` in `reduce.wesl`. */
export const ANTIQUE_CELL = 4;

/** One print-point texel (one star glyph at most) per 4×4 PRINT UNITS, not device px,
 * so a retina plate carries the same stars as a 1× one. */
export const ANTIQUE_PRINT_CELL_UNITS = 4;

/** Camera distance from the Sun (Mpc) over which ornaments go from star chart to cosmos. */
export const ANTIQUE_REGIME_MPC = [0.003, 0.03] as const;

/** Sizes of io.wesl `AntiqueUniforms`, ornaments.wesl `AntiqueOrnaments` and fragment.wesl
 * `AntiqueLettering` (each list: a 16-byte header, then fixed rows). */
export const ANTIQUE_UNIFORM_BYTES = 256;
export const ANTIQUE_MAX_ORNAMENTS = 16;
export const ANTIQUE_ORNAMENT_BYTES = 16 + ANTIQUE_MAX_ORNAMENTS * 64;
export const ANTIQUE_MAX_GLYPHS = 96;
export const ANTIQUE_GLYPH_BYTES = 16 + ANTIQUE_MAX_GLYPHS * 32;

/** `skyFloor.wesl`'s output, one f32 padded to WebGPU's 16-byte minimum binding size. */
export const ANTIQUE_SKY_FLOOR_BYTES = 16;

/** The border in print units from the canvas edge: the ladder's centre line
 * (`MARGIN` + `BAND` / 2 in `fragment.wesl`) is what the numbering reads. */
export const ANTIQUE_LADDER_UNITS = 33.5;
export const ANTIQUE_NUMERAL_INSET_UNITS = 50;
export const ANTIQUE_NUMERAL_UNITS = 22;

/** Passes no period plate shows: cloud shells (no 1600s globe drew weather), leader
 * stems (an engraved name sits beside its glyph), selection rings, and the density's
 * upsample: the plate reads that row itself as isobaths, never as print to engrave. */
export const ANTIQUE_HIDDEN_PASSES: readonly string[] = [
  'cloud-shell',
  'marker-lines',
  'selection-ring',
  'near0-selection-ring',
  'cosmic-web-density-upsample',
];

/** Passes that exist only for the look: they draw nothing with it off. */
export const ANTIQUE_ONLY_PASSES: readonly string[] = [
  'earth-ocean-mask',
  'earth-antique-map',
  'body-albedo-mask',
  'moon-print',
  'star-points-print',
  'star-catalog-print',
];

/** Passes the look moves off their line onto a row of its own, which the plate inks
 * as line work: the quarter-res reduce would average a 1-px line away. */
export const ANTIQUE_MOVED_PASSES: Readonly<Record<string, string>> = {
  constellations: 'antique-lines',
  'orbit-trails': 'antique-lines',
  'mission-trails': 'antique-lines',
  'cosmic-web-filaments': 'antique-lines',
  'structure-markers-cosmo': 'antique-structures',
  'structure-markers-near': 'antique-structures',
};

/** The structure markers' row is half res: their halos are soft, and the low band
 * erodes their rings away anyway. Mirrored by `structureGlow.wesl`'s 8×8 box (1/16
 * of the print). */
export const ANTIQUE_STRUCTURE_CELL = 2;

/** The land row's format: r land share, g covered (`earth/fragment.wesl` `fsOceanMask`,
 * `texturedBody/fragment.wesl` `fsAlbedoMask`). */
export const ANTIQUE_LAND_FORMAT: GPUTextureFormat = 'rg8unorm';

/** The geography row (`earth/antiqueMap/*.wesl`): r realm colour code, g border
 * proximity (the outline-colour band), b line ink, a sign ink. */
export const ANTIQUE_GEOGRAPHY_FORMAT: GPUTextureFormat = 'rgba8unorm';

/** The print-points row (`antiqueLook/printPoint.wesl`): xy NDC and a magnitude need
 * floats; its depth ranks the points in a texel by magnitude. */
export const ANTIQUE_PRINT_POINTS_FORMAT: GPUTextureFormat = 'rgba16float';
export const ANTIQUE_PRINT_POINTS_DEPTH: GPUTextureFormat = 'depth32float';

/** The look's row ids; each row's channels are documented by the shader that writes it. */
export const ANTIQUE_TARGETS = {
  print: 'print',
  overlay: 'overlay',
  full: 'antique-full',
  quarter: 'antique-quarter',
  low: 'antique-low',
  structures: 'antique-structures',
  printPoints: 'antique-print-points',
  land: 'antique-land',
  landBlurAcross: 'antique-land-blur-across',
  lines: 'antique-lines',
  geography: 'antique-geography',
  relief: 'antique-relief',
} as const;

/** The layers of the plate's array rows, one row per size and format (full res rgba8,
 * ¼ res and 1/16 res rgba16float), mirrored by the `*_LAYER` constants in fragment.wesl.
 * A new row the look writes and the plate reads is a layer here, never a plate binding:
 * WebGPU allows a stage 16 sampled textures and a phone may offer no more. */
export const ANTIQUE_FULL_LAYERS = { paper: 0, starInk: 1, decor: 2, decorHue: 3 } as const;
export const ANTIQUE_QUARTER_LAYERS = { wash: 0, nebula: 1, landBlur: 2 } as const;
export const ANTIQUE_LOW_LAYERS = { glow: 0, structureGlow: 1 } as const;
