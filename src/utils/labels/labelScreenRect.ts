/**
 * labelScreenRect — the screen rect a label's ink occupies, in device px.
 *
 * Reproduces the label vertex shader's sizing on the CPU: `pxPerEm = worldEmMpc
 * / clipW · viewportH/2`, clamped to [minPx, maxPx], then atlas px → screen px
 * via `displayEmPx / ATLAS_FONT_SIZE` (+Y-down bbox already matches screen
 * space — the shader's atlas-Y and NDC→screen flips cancel). ONE derivation for
 * the two consumers that must agree — the COSMO declutter's overlap test and
 * the pick quads — so a label can't be clickable somewhere it isn't drawn.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { LabelBBox } from '../../@types/rendering/LabelBBox';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';
import { ATLAS_FONT_SIZE } from '../../data/fonts';
import {
  LABEL_MAX_PX_DEFAULT,
  LABEL_MIN_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../data/labels/labelSizingDefaults';

export function labelScreenRect(args: {
  readonly label: Label2D;
  readonly bbox: LabelBBox;
  /** The label anchor's projected position, device px, +Y down. */
  readonly screenPx: Readonly<Vec2>;
  /** The anchor's clip w — the depth the em clamp divides by. */
  readonly clipW: number;
  readonly viewportHeightPx: number;
  /** Uniform outward inflation, device px. Defaults to 0 (the drawn ink). */
  readonly padPx?: number;
  /**
   * Also inflate by the painted outline's screen footprint
   * (`label.outlineEmFrac * displayEmPx` — see `labels/vertex.wesl`'s quad
   * expansion). The pick path sets this; the declutter arms never do, so
   * their overlap test keeps reading the ink box alone.
   */
  readonly includeOutline?: boolean;
}): ScreenRectPx {
  const { label, bbox, screenPx, clipW, viewportHeightPx } = args;
  const pad = args.padPx ?? 0;
  const pxPerEm =
    ((label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT) / clipW) * (viewportHeightPx * 0.5);
  const displayEmPx = Math.min(
    Math.max(pxPerEm, label.minPixelSize ?? LABEL_MIN_PX_DEFAULT),
    label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT,
  );
  const s = displayEmPx / ATLAS_FONT_SIZE;
  const outlinePx = args.includeOutline ? (label.outlineEmFrac ?? 0) * displayEmPx : 0;
  const inflate = pad + outlinePx;
  return {
    x0: screenPx[0] + bbox.minX * s - inflate,
    y0: screenPx[1] + bbox.minY * s - inflate,
    x1: screenPx[0] + bbox.maxX * s + inflate,
    y1: screenPx[1] + bbox.maxY * s + inflate,
  };
}
