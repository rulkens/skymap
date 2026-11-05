/**
 * BodyPickRenderer — the r32uint pick provider for the NEAR0 foreground bodies
 * (Earth, the planets, and the ~25 seeded scene stars incl. the Sun).
 *
 * It is the body-family analogue of `StarCatalogPickRenderer`: it records
 * pickable geometry into an ALREADY-BEGUN r32uint pick pass (owned by the pick
 * program), stamping each body's caller-packed identity into the texel it
 * covers. It owns no pass, no texture and no readback.
 *
 * ### Two geometries, one renderer
 *
 * Foreground bodies split into two pick shapes, mirroring how their visual
 * siblings split (`starRenderer`/`planetRenderer`/`earthRenderer` draw spheres,
 * `starPointRenderer` draws billboards):
 *
 *   - `drawSphere` rasterises ONE body sphere per call (Earth, a planet, or a
 *     resolved scene-star sphere). Each call carries its OWN CPU-baked MVP + a
 *     fully-packed pick id, so the sphere draws recorded across one SUBMIT
 *     each resolve to their OWN body — see `beginSubmit` below.
 *   - `drawPoints` rasterises a sub-pixel body POINT partition as one instanced
 *     draw of ≤25 pick billboards, each expanded to a generous 18 px clickable
 *     footprint (labelled scene stars and sub-pixel solar-system body glints —
 *     click-invited targets) so a sub-pixel body stays easily clickable at its
 *     true screen position. Safe to call multiple times per submit — same
 *     `beginSubmit` contract.
 *
 * ### Why own-uniform, not the COSMO shared pick camera
 *
 * The COSMO point-pick camera is a shared `@group(0)` BGL contract; the bodies
 * do not use it. Body renderers bake their MVP CPU-side (f64 `composeBodyMvp` →
 * `narrowMat4`), so the pick pipelines follow that same OWN-uniform pattern —
 * the sphere path binds a per-draw uniform block; the points path binds a
 * per-frame camera uniform + a per-frame instance buffer.
 *
 * ### Why the caller passes fully-packed ids
 *
 * `packedId` is already `packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)`
 * — composed CPU-side by the body layers (Task 11) from each body's stable seed
 * index, NOT from `@builtin(instance_index)` (which shifts as bodies enter and
 * leave the resolved/point partitions). The shaders write `packedId` RAW into
 * the r32uint target; no packing math lives on the GPU.
 *
 * ### Depth-tested (the visual sibling passes vary)
 *
 * Every body pick pipeline declares the NEAR0 `depth32float` depth profile
 * (`depthCompare: 'greater'`, `depthWriteEnabled: true`) so overlapping bodies —
 * a Moon in front of Earth — resolve nearest-wins, matching visual occlusion.
 * Under the NEAR0 slab's reversed-Z convention (clear `0.0`, greater-z-wins) a
 * nearer body writes a LARGER stored depth, so `greater` is what makes it win.
 */

import type { Renderer } from '../Renderer';
import type { BodySpherePickArgs } from './BodySpherePickArgs';
import type { BodyPointPickArgs } from './BodyPointPickArgs';

export type BodyPickRenderer = Renderer & {
  /**
   * Reset the sphere + point slot cursors for a fresh submit. The submit owner
   * (`pickProgram.pick()` / `renderForDebug()`) calls this ONCE, before recording
   * any of that submit's passes — NOT once per pass, which is the bug this
   * contract replaced (see `bodyPickRenderer`'s module header).
   */
  beginSubmit(): void;
  /**
   * Record ONE body sphere into an already-begun r32uint pick pass; safe to
   * call repeatedly across a submit (`beginSubmit` to the next `beginSubmit`)
   * — each call gets its own slot, even across different passes.
   */
  drawSphere(pass: GPURenderPassEncoder, args: BodySpherePickArgs): void;
  /**
   * Record a sub-pixel body POINT partition as one instanced pick-billboard
   * draw; safe to call multiple times per submit (once per caller: the scene
   * stars + the body glints). No-op on an empty batch (costs no slot).
   */
  drawPoints(pass: GPURenderPassEncoder, args: BodyPointPickArgs): void;
};
