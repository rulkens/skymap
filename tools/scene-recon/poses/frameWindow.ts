/**
 * frameWindow — which part of a full-resolution skråfoto COG a group harvests,
 * and how far it is downsampled. One answer for both CLIs: `fetchSkraafoto`
 * turns it into `-srcwin`/`-outsize`, `bakeSplats` recomputes it (pure, from
 * the item + the group) to scale the pose intrinsics and to check the JPEG on
 * disk still matches. `null` = this frame does not usefully see the group.
 */
import { frameProjection, projectToFramePx } from './frameProjection';
import { lonLatBoundsToEnuM } from '../../utils/scene/lonLatBoundsToEnuM';
import { skraafotoDownsampleScale } from '../../utils/skraafoto/skraafotoDownsampleScale';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from '../@types/SkraafotoStacItem';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Group-frame z the bounds box is swept over: below the anchor for the
 *  park's dug-out ground, well above it for Frederiksberg Slot and the
 *  tallest trees. Obliques see the box's tall faces, not just its footprint. */
const BOX_MIN_Z_M = -10;
const BOX_MAX_Z_M = 50;
/** Slack around the projected box — pose residuals, and the anchor height the
 *  z sweep only approximates. */
const PAD_FRACTION = 0.02;
/** Below this Brush has nothing to match; a frame that clips the box's corner
 *  costs a download and contributes noise. */
const MIN_WINDOW_PX = 64;

export type FrameWindow = {
  /** Native-pixel origin of the crop, `gdal_translate -srcwin`'s first two args. */
  readonly x0: number;
  readonly y0: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Native → written pixels; 1 keeps the COG's own resolution. */
  readonly scale: number;
};

export function frameWindow(
  item: SkraafotoStacItem,
  group: SceneGroupDefinition,
  cameraPositionM: Vec3,
): FrameWindow | null {
  const shape = item.properties['proj:shape'];
  const [rowsPx, colsPx] = shape;
  const groundMmPerPx = group.skraafoto.groundMmPerPx;
  if (groundMmPerPx === undefined) {
    return {
      x0: 0,
      y0: 0,
      widthPx: colsPx,
      heightPx: rowsPx,
      scale: skraafotoDownsampleScale(shape),
    };
  }

  const projection = frameProjection(item, group.anchor);
  const box = lonLatBoundsToEnuM(group.bounds, group.anchor.latDeg, group.anchor.lonDeg);
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const xM of [box.minXM, box.maxXM]) {
    for (const yM of [box.minYM, box.maxYM]) {
      for (const zM of [BOX_MIN_Z_M, BOX_MAX_Z_M]) {
        const px = projectToFramePx(projection, cameraPositionM, [xM, yM, zM]);
        if (px === null) return null;
        minU = Math.min(minU, px[0]);
        maxU = Math.max(maxU, px[0]);
        minV = Math.min(minV, px[1]);
        maxV = Math.max(maxV, px[1]);
      }
    }
  }

  const padU = (maxU - minU) * PAD_FRACTION;
  const padV = (maxV - minV) * PAD_FRACTION;
  const x0 = Math.max(0, Math.floor(minU - padU));
  const y0 = Math.max(0, Math.floor(minV - padV));
  const widthPx = Math.min(colsPx, Math.ceil(maxU + padU)) - x0;
  const heightPx = Math.min(rowsPx, Math.ceil(maxV + padV)) - y0;

  // Ground diagonal over projected diagonal, rather than the frame's nominal
  // GSD: an oblique's pixels cover more ground than a nadir's, and this box is
  // what both are being asked to resolve.
  const groundDiagM = Math.hypot(box.maxXM - box.minXM, box.maxYM - box.minYM);
  const nativeMmPerPx = (groundDiagM * 1000) / Math.hypot(maxU - minU, maxV - minV);
  const window = { x0, y0, widthPx, heightPx, scale: Math.min(1, nativeMmPerPx / groundMmPerPx) };

  // Checked on the written JPEG, not the native crop: a wide native window
  // downsampled below MIN_WINDOW_PX still leaves Brush nothing to match.
  const [outputWidthPx, outputHeightPx] = frameWindowOutputPx(window);
  if (outputWidthPx < MIN_WINDOW_PX || outputHeightPx < MIN_WINDOW_PX) return null;
  return window;
}

/** `[width, height]` of the JPEG a window produces — the one rounding rule the
 *  fetcher's `-outsize`, the pose intrinsics and the on-disk check all read. */
export function frameWindowOutputPx(window: FrameWindow): readonly [number, number] {
  return [Math.round(window.widthPx * window.scale), Math.round(window.heightPx * window.scale)];
}
