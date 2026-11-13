/**
 * cssToTexPx — CSS pixel → texture-space pixel conversion.
 *
 * Mouse / pointer events surface coordinates in CSS pixels (the layout
 * coordinate space the user sees), but the WebGPU pick texture is sized
 * in *backing-store* pixels — `clientWidth * devicePixelRatio` on retina
 * displays.  Picking has to happen against the texture, so every CSS-pixel
 * coordinate that flows into a pick read goes through this conversion
 * first.
 *
 * The ratio is `displayPixelRatio` — the same capped value the canvas
 * is sized by (`resizeCanvasToDisplay`); with raw DPR, picks on a 3×
 * display would overshoot the texture and silently miss.
 *
 * Pure function rather than a closure-returning factory: nothing is
 * captured per-engine.  The DPR is read at call time (not cached at
 * engine construction) so the rare DPR change between picks resolves
 * itself on the next event without an explicit invalidation hook.
 *
 * Pre-extraction this lived inline in `engine.ts` as a closure local;
 * the lift is purely about keeping `engine.ts` focused on
 * orchestration.
 */
import { displayPixelRatio } from '../../../utils/gpu/displayPixelRatio';

export function cssToTexPx(cssPx: number): number {
  return cssPx * displayPixelRatio();
}
