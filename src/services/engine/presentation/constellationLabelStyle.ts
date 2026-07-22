/**
 * constellationLabelStyle — visual style for the constellation stick-figure
 * name labels (`produceConstellationLabels`).
 *
 * Label-only, like the Milky Way "You are here" caption: a single text label
 * anchored at the figure's `labelAnchorPc`, with no ring, halo, or marker-line
 * stem. This module owns only the static appearance; the producer supplies the
 * anchor and the distance × layer fade.
 *
 * ### Annotation tier — dimmer and smaller than the structure labels
 *
 * Constellations are a near-field orientation aid, not a headline structure, so
 * their labels sit a rung below the cluster/supercluster names: a dim steel-blue
 * matching the stick-figure stroke (spec Q5), and pixel clamps roughly half the
 * structure labels' (16–48 px vs 35–150 px) so a figure's name reads as a quiet
 * caption rather than competing with the cosmic-scale annotations. The values
 * are an eye-tuning starting point — re-tune by editing this module.
 */

import type { Vec4 } from '../../../@types/math/Vec4';

/** Style fields the constellation label producer reads. */
export type ConstellationLabelStyle = {
  /** Label glyph fill (straight RGBA — renderer premultiplies). */
  readonly labelColor: Vec4;
  /** Label world-space em height (Mpc) — the near-field, parsec-scale anchor. */
  readonly worldEmMpc: number;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as an em-fraction. */
  readonly outlineEmFrac: number;
};

/** The single constellation label style. */
export const CONSTELLATION_LABEL_STYLE: ConstellationLabelStyle = {
  // Dim steel-blue, tracking the stick-figure stroke; alpha < 1 so the caption
  // reads softly against the starfield rather than as bright chrome.
  labelColor: [0.62, 0.74, 0.88, 0.72],
  // Tiny em: the anchors are parsecs from the origin, so a near-field em height
  // keeps the caption legible without the perspective clamps pinning it flat.
  worldEmMpc: 0.00003,
  minPixelSize: 16,
  maxPixelSize: 48,
  outlineColor: [0, 0, 0, 0.1],
  outlineEmFrac: 0.16,
};

/**
 * Declutter sort key for constellation labels (px). A low constant so the
 * annotation-tier captions yield to the structure / famous / "You are here"
 * labels — which carry real apparent-size prominence — whenever their text
 * rects collide in the director's cross-producer declutter. All figures share
 * one value, so a constellation-vs-constellation overlap falls to the stable
 * emission order.
 */
export const CONSTELLATION_LABEL_PROMINENCE_PX = 12;
