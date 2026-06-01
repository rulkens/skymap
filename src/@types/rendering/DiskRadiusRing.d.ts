/**
 * DiskRadiusRing — developer overlay that draws a world-space ring at a
 * famous galaxy's procedural-disk radius, lying IN THE DISK PLANE so it
 * visually traces the textured quad's projected outline.
 *
 * The ring's in-plane basis is built with the SAME `paDeg` + `axisRatio`
 * math `texturedDisks` uses (`lib/orientation::diskAxes`), so it answers
 * the calibration question "does the textured disk fill the ring?"
 * apples-to-apples: if the disk's edge falls short of (or overruns) the
 * ring, the per-galaxy `diameterKpc` → world-radius mapping is off.
 *
 * ### `viewProj` reconciliation
 *
 * Plan 5's contract sketch omitted `viewProj`, but a projection matrix is
 * mandatory: the vertex stage must land world coords in clip space, and
 * (mirroring `SelectionRingRenderer.render`) the cleanest place for it is
 * an explicit per-frame argument rather than a stashed field. It is the
 * second parameter, ahead of the per-draw `args`. The column-major matrix
 * is uploaded into the shared 80-byte `CameraUniforms` prefix; the ring
 * does no pixel-space math, so `viewportPx` is left zero.
 *
 * One draw per call — Task 3 invokes `draw` once per selected famous
 * galaxy inside the UI overlay pass (premultiplied-OVER, post-tone-map).
 */

import type { Vec3 } from '../math/Vec3';

export type DiskRadiusRing = {
  /**
   * Record a single line-strip ring draw into an in-flight render pass.
   * The ring of `radiusWorld` (Mpc) is centred at `center` (world Mpc)
   * and lies in the disk plane defined by `paDeg` + `axisRatioForTilt`,
   * so it traces the textured quad's outline. `viewProj` is the
   * column-major camera matrix for the current frame. Must be called
   * inside a `beginRenderPass` block on the swap-chain texture (the
   * premultiplied-OVER blend expects an LDR target).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    args: { center: Vec3; radiusWorld: number; axisRatioForTilt: number; paDeg: number },
  ): void;
  /** Release the camera + ring uniform buffers. */
  destroy(): void;
};

/**
 * Build a `DiskRadiusRing`. `swapChainFormat` is the LDR target format the
 * UI overlay pass renders into (the premultiplied-OVER blend is set on it).
 */
export function createDiskRadiusRing(
  device: GPUDevice,
  swapChainFormat: GPUTextureFormat,
): DiskRadiusRing;
