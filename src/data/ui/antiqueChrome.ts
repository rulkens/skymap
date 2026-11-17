/**
 * The antique chrome's one fixed parameter set (picked in the prototype, see
 * docs/superpowers/plans/2026-11-07-antique-chrome-kit.md). Colours are baked
 * into the generated SVGs, so they must match `styles/antique.css`'s
 * `--antique-ink` and `--antique-slip`; a test holds them together.
 */
import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';
import type { FoxingParams } from '../../@types/ui/antiqueChrome/FoxingParams';
import type { InkWearParams } from '../../@types/ui/antiqueChrome/InkWearParams';
import type { PaperParams } from '../../@types/ui/antiqueChrome/PaperParams';

/** The canvas pass's `INK` (shaders/antiqueLook/passes/plateFragment.wesl). */
export const ANTIQUE_CHROME_INK = '#2b2118';
/** The paper the panels are cut from. */
export const ANTIQUE_CHROME_GROUND = '#f7efda';

export const PANEL_FRAME: EngravedFrameParams = {
  outer: 1.6,
  hair: 0.6,
  gap: 1.6,
  band: 5,
  cell: 7,
  ornament: 28,
};

/** An inset's own neatline inside a compartment (a key, a facts table): finer, plain corners. */
export const INSET_FRAME: EngravedFrameParams = {
  outer: 1.1,
  hair: 0.5,
  gap: 1.2,
  band: 3,
  cell: 5,
  ornament: 0,
};

/** The slips' laid paper, toned rag brown. Mottle and fibre swing both ways round the slip, so its mean (and the ink's contrast) holds. */
export const PANEL_PAPER: PaperParams = {
  size: 256,
  tone: '#7a5a34',
  grain: 0.75,
  grainStrength: 0.16,
  mottle: 0.011,
  mottleStrength: 0.12,
  wirePitch: 2.2,
  wireAlpha: 0.03,
  chainPitch: 64,
  chainAlpha: 0.035,
};

/** Larger than any panel, so the percentage offset that varies the spots by panel size never repeats one. */
export const PANEL_FOXING: FoxingParams = {
  width: 720,
  height: 560,
  spots: 14,
  core: 2.6,
  halo: 16,
  coreAlpha: 0.38,
  haloAlpha: 0.13,
  tideAlpha: 0.07,
  tone: '#94582a',
};

/** The frames' and tablets' uneven printing: a hair off true, a break now and then. */
export const INK_WEAR: InkWearParams = {
  wobble: 0.9,
  wobbleFrequency: 0.35,
  grain: 0.28,
  thinAt: 0.66,
  breakSpan: 0.18,
};

/** The colourist's box (shaders/antiqueLook/shared/pigments.wesl): gamboge marks hover and press, verdigris what is on. */
export const ANTIQUE_GAMBOGE = '#e6bd4d';
export const ANTIQUE_VERDIGRIS = '#6b9e80';
/** How deep a full wash lies; hover lays a lighter one. */
export const WASH_STRENGTH = 0.48;
export const HOVER_WASH_STRENGTH = 0.22;

/** The thumbnail engraving's filter (components/EngravingFilter), named by styles/antique.css. */
export const ANTIQUE_ENGRAVE_FILTER_ID = 'antique-engrave';
/** Hatch line spacing, CSS px: near the plate's body engraving at the card's thumbnail size. */
export const ENGRAVE_HATCH_PITCH = 4;

/** Tall enough for one line of 15 px small capitals between the scroll's double rules. */
export const TITLE_CARTOUCHE_HEIGHT = 32;
