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
 * The DPR cap at 2 mirrors `resizeCanvasToDisplay` in
 * `services/gpu/device.ts`: above 2× the GPU memory cost (4× per
 * doubling) outweighs the perceptual gain.  Both sites must agree —
 * if the canvas is sized at min(DPR, 2) and the pick read used raw
 * DPR, picks on a 3× display would overshoot the texture and silently
 * miss.
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
export function cssToTexPx(cssPx: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return cssPx * dpr;
}
