/**
 * LABEL_STYLES — every label style, one row each; a record carries its row's index in
 * `LABEL_STYLE_IDS` and the shader reads the same table. Structure `appear` thresholds are the
 * marker ring radii doubled (rows read diameters). Every px is a CSS px (times `pxScale`).
 * Priorities are bands: rank = priority × CAPTION_PRIORITY_SCALE + apparent diameter.
 */

import type { LabelStyleId } from '../../@types/rendering/LabelStyleId';
import type { LabelStyleRow } from '../../@types/rendering/LabelStyleRow';
import type { Vec4 } from '../../@types/math/Vec4';
import { hexToGl } from '../../utils/color/hexToGl';

const OUTLINE = { color: [0, 0, 0, 0.1] as Vec4, emFrac: 0.16 };
const TEXT = { font: 'cormorant', outline: OUTLINE } as const;
const CLUSTER_APPEAR = { fromPx: 5, bandPx: 4 };
const VOLUME_APPEAR = { fromPx: 28, bandPx: 20 };
// A Milky Way structure's label sits on its ring's drawn top (ring radius × MARKER_RADIUS_RETUNE),
// at least 4 px up.
const ABOVE_RING = { placement: 'above', lift: { radii: 0.57735, minPx: 4 } } as const;
const CAPTION_LIFT = { radii: 3, minPx: 14 };

export const LABEL_STYLES = {
  galaxyCluster: {
    ...TEXT,
    color: hexToGl('#FFD966'),
    textHeight: { mpc: 1.25 },
    appear: CLUSTER_APPEAR,
    placement: 'centre',
    priority: 0,
  },
  supercluster: {
    ...TEXT,
    color: hexToGl('#FFB86B'),
    textHeight: { mpc: 5 },
    appear: VOLUME_APPEAR,
    placement: 'centre',
    priority: 0,
  },
  void: {
    ...TEXT,
    color: hexToGl('#99D9F2'),
    textHeight: { mpc: 2.5 },
    appear: VOLUME_APPEAR,
    placement: 'centre',
    priority: 0,
  },
  galaxyGroup: {
    ...TEXT,
    color: hexToGl('#C2B488C8'),
    textHeight: { mpc: 0.3 },
    appear: { fromPx: 44, bandPx: 24 },
    placement: 'centre',
    priority: 0,
  },
  openCluster: {
    ...TEXT,
    ...ABOVE_RING,
    color: hexToGl('#A3B3D1'),
    textHeight: { mpc: 2e-6 },
    appear: CLUSTER_APPEAR,
    priority: 0,
  },
  globularCluster: {
    ...TEXT,
    ...ABOVE_RING,
    color: hexToGl('#C9A8FF'),
    textHeight: { mpc: 8e-6 },
    appear: CLUSTER_APPEAR,
    priority: 0,
  },
  nebula: {
    ...TEXT,
    ...ABOVE_RING,
    color: hexToGl('#FF8FA3'),
    textHeight: { mpc: 2e-6 },
    appear: CLUSTER_APPEAR,
    priority: 0,
  },
  gcCluster: {
    ...TEXT,
    ...ABOVE_RING,
    color: hexToGl('#E8E8F0'),
    textHeight: { mpc: 2e-6 },
    appear: CLUSTER_APPEAR,
    priority: 0,
  },
  famousGalaxy: {
    ...TEXT,
    color: hexToGl('#FFF2CC'),
    // M31's em (0.0125 Mpc) over its 20 kpc radius; the producer's log-diameter rule goes.
    textHeight: { timesRadius: 0.625 },
    appear: { fromPx: 3, bandPx: 2 },
    placement: 'above',
    lift: CAPTION_LIFT,
    leader: { from: 'centre', gapPx: 0, widthPx: 1.25, color: hexToGl('#E6D9B3') },
    priority: 0,
  },
  milkyWay: {
    ...TEXT,
    color: [1, 1, 1, 1],
    textHeight: { mpc: 0.0125 },
    placement: 'above',
    lift: CAPTION_LIFT,
    leader: { from: 'centre', gapPx: 0, widthPx: 1.5, color: [1, 1, 1, 1] },
    // Above every other band: the orientation anchor always wins.
    priority: 1000,
  },
  stellarStream: {
    ...TEXT,
    // Each stream passes its own tint at alpha 0.85.
    color: [1, 1, 1, 0.85],
    textHeight: { mpc: 5e-4 },
    // Diameter here is the stream's length; the old hard cut gains a band.
    appear: { fromPx: 75, bandPx: 25 },
    placement: 'centre',
    priority: 0,
  },
  caption: {
    ...TEXT,
    color: [1, 1, 1, 1],
    textHeight: { timesRadius: 1 },
    placement: 'above',
    lift: CAPTION_LIFT,
    leader: { from: 'rim', gapPx: 2, widthPx: 1.25 },
    priority: 10,
  },
  constellation: {
    ...TEXT,
    color: [0.7, 0.8, 0.92, 0.84],
    // A sky figure has no depth of its own: always the minimum size, so every name matches.
    textHeight: { mpc: 0 },
    placement: 'centre',
    priority: 5,
  },
  lightTime: {
    ...TEXT,
    color: [0.75, 0.86, 1, 1],
    // No em of its own: always the minimum size.
    textHeight: { mpc: 0 },
    // Today's recede window (camera distance 12 → 40 sphere radii) as apparent diameter at the
    // default 60° lens on a 900 CSS px tall canvas: 2 × 779 px / 40 = 39, / 12 = 130.
    appear: { fromPx: 39, bandPx: 91 },
    placement: 'above',
    lift: { radii: 1, minPx: 0 },
    priority: 12,
  },
} as const satisfies Readonly<Record<string, LabelStyleRow>>;

/** The order a record's `style` word indexes. */
export const LABEL_STYLE_IDS = Object.keys(LABEL_STYLES) as readonly LabelStyleId[];
