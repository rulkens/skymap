import type { PortraitCrop } from '../@types/PortraitCrop';

/**
 * Where to cut a portrait still out of a landscape frame. `x` is the crop
 * centre as a share of the frame width; the region is clamped to stay inside
 * the frame. `zoom` below 1 widens the region past the output's shape (the
 * picture shrinks), and the missing rows above and below are padding the
 * caller paints black.
 */
export function portraitCrop(
  frame: { width: number; height: number },
  out: { width: number; height: number },
  x = 0.5,
  zoom = 1,
): PortraitCrop {
  const width = Math.min(frame.width, Math.round((frame.height * out.width) / out.height / zoom));
  const left = Math.max(0, Math.min(frame.width - width, Math.round(x * frame.width - width / 2)));
  const scaledHeight = Math.min(out.height, Math.round((frame.height * out.width) / width));
  const padTop = Math.floor((out.height - scaledHeight) / 2);
  return {
    left,
    width,
    height: frame.height,
    scaledHeight,
    padTop,
    padBottom: out.height - scaledHeight - padTop,
  };
}
