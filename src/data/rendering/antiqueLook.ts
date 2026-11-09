/** The antique look's sizing constants and target ids, shared by its rows, packers and pass. */

/** Canvas height (CSS px) at which a print unit is one CSS px: the plate scales with the window. */
export const ANTIQUE_REFERENCE_HEIGHT_CSS = 900;

/** One quarter-res cell per 4×4 print texels: scales the quarter-res rows; mirrored as
 * `CELL` in `reduce.wesl`. */
export const ANTIQUE_CELL = 4;

/** One print-point texel (one star glyph at most) per 4×4 PRINT UNITS, not device px,
 * so a retina plate carries the same stars as a 1× one. */
export const ANTIQUE_PRINT_CELL_UNITS = 4;

/** Under the look the print rolls its highlights off from this share of the tone curve's
 * saturation (`printShoulder`): clipped, a galaxy's bar printed as a round white blob. */
export const ANTIQUE_PRINT_SHOULDER = 0.625;

/** Camera distance from the Sun (Mpc) over which ornaments go from star chart to cosmos. */
export const ANTIQUE_REGIME_MPC = [0.003, 0.03] as const;

/** Camera distance from the Sun (Mpc, 10 to 50 pc) over which a constellation figure fades:
 * past it the figure's stars have moved apart and no longer outline it. */
export const ANTIQUE_FIGURE_VANTAGE_MPC = [1e-5, 5e-5] as const;

/** Sizes of io.wesl `AntiqueUniforms`, ornaments.wesl `AntiqueOrnaments` and fragment.wesl
 * `AntiqueLettering` (each list: a 16-byte header, then fixed rows). */
export const ANTIQUE_UNIFORM_BYTES = 304;
export const ANTIQUE_MAX_ORNAMENTS = 16;
/** A sky figure is drawn as this many cells a side, each corner placed on the sphere and
 * projected, so the view's own stretch bends it (`placeAntiqueOrnaments`, decor.wesl). */
export const ANTIQUE_ORNAMENT_GRID = 8;
/** Triangle-strip vertices per ornament: a strip per cell row, joined by two degenerate ones. */
export const ANTIQUE_ORNAMENT_STRIP_VERTS =
  ANTIQUE_ORNAMENT_GRID * (2 * (ANTIQUE_ORNAMENT_GRID + 1) + 2);
/** One ornament's lattice in vec4s (two px points each): (GRID + 1)² points, rounded up. */
export const ANTIQUE_ORNAMENT_GRID_VEC4 = Math.ceil((ANTIQUE_ORNAMENT_GRID + 1) ** 2 / 2);
export const ANTIQUE_ORNAMENT_BYTES =
  16 + ANTIQUE_MAX_ORNAMENTS * (64 + ANTIQUE_ORNAMENT_GRID_VEC4 * 16);
export const ANTIQUE_MAX_GLYPHS = 96;
export const ANTIQUE_GLYPH_BYTES = 16 + ANTIQUE_MAX_GLYPHS * 32;

/** mask.wesl `MaskDepth`: the forward, then a near plane per plate body. */
export const ANTIQUE_MASK_DEPTH_BYTES = 32;

/** `skyFloor.wesl`'s output, two f32 padded to WebGPU's 16-byte minimum binding size. */
export const ANTIQUE_SKY_FLOOR_BYTES = 16;

/** The border in print units from the canvas edge: the ladder's centre line
 * (`MARGIN` + `BAND` / 2 in `fragment.wesl`) is what the numbering reads. */
/** bodySigns.wesl `AntiqueSigns`: a count, then a centre per named body below a globe. */
export const ANTIQUE_MAX_SIGNS = 32;
export const ANTIQUE_SIGN_BYTES = 16 + ANTIQUE_MAX_SIGNS * 16;
export const ANTIQUE_LADDER_UNITS = 33.5;
export const ANTIQUE_NUMERAL_INSET_UNITS = 50;
export const ANTIQUE_NUMERAL_UNITS = 22;

/** Passes no period plate shows: cloud shells (no 1600s globe drew weather), leader
 * stems (an engraved name sits beside its glyph), selection rings, the density's
 * upsample (the plate reads that row itself as isobaths, never as print to engrave),
 * and the resolved stars' sprites: a star prints only as its catalogue glyph
 * (`glyphs.wesl`), since bloom and the plate's glow filters ringed each sprite in
 * dotted halos. The unresolved aggregate (`star-upsample`) still feeds the print.
 * Likewise a galaxy point prints only as its catalogue dot (a field of sprites grew
 * contour islands in the low band); resolved galaxies' disks still feed the print.
 * The cosmic structures' discs went too: their outlines drew rings round empty paper,
 * so a structure is named on the plate, not ringed. The density and the filaments
 * give way to their `-print` twins. */
export const ANTIQUE_HIDDEN_PASSES: readonly string[] = [
  'star-points',
  'star-catalog',
  'cloud-shell',
  'marker-lines',
  'selection-ring',
  'near0-selection-ring',
  'cosmic-web-density',
  'cosmic-web-density-upsample',
  'cosmic-web-filaments',
  'point-sprites',
  'structure-markers-cosmo',
];

/** Passes that exist only for the look: they draw nothing with it off. */
export const ANTIQUE_ONLY_PASSES: readonly string[] = [
  'earth-ocean-mask',
  'earth-antique-map',
  'body-albedo-mask',
  'moon-print',
  'moon-relief',
  'star-points-print',
  'star-catalog-print',
  'galaxy-points-print',
  'cosmic-web-density-print',
  'cosmic-web-filaments-print',
];

/** Passes the look moves off their line onto a row of its own, which the plate inks
 * as line work: the quarter-res reduce would average a 1-px line away. */
export const ANTIQUE_MOVED_PASSES: Readonly<Record<string, string>> = {
  constellations: 'antique-lines',
  'orbit-trails': 'antique-lines',
  'mission-trails': 'antique-lines',
  'cosmic-web-filaments-print': 'antique-lines',
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

/** The Moon's own row (`antiqueLook/bodies/moonRow.wesl`), copied into the plate's
 * `moon` layer, so it takes that array's format. */
export const ANTIQUE_MOON_FORMAT: GPUTextureFormat = 'rgba8unorm';

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
  moon: 'antique-moon',
} as const;

/** The layers of the plate's array rows, one row per size and format (full res rgba8,
 * ¼ res and 1/16 res rgba16float), mirrored by the `*_LAYER` constants in fragment.wesl.
 * A new row the look writes and the plate reads is a layer here, never a plate binding:
 * WebGPU allows a stage 16 sampled textures and a phone may offer no more. */
export const ANTIQUE_FULL_LAYERS = {
  paper: 0,
  starInk: 1,
  decor: 2,
  decorHue: 3,
  moon: 4,
  mask: 5,
} as const;
export const ANTIQUE_QUARTER_LAYERS = { wash: 0, nebula: 1, landBlur: 2 } as const;
export const ANTIQUE_LOW_LAYERS = { glow: 0, structureGlow: 1, webLevel: 2 } as const;
