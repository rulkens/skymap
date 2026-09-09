/**
 * InstancedQuadConfig — construction-time config for
 * `createInstancedQuadRenderer`.
 */

import type { AtlasConfig } from './AtlasConfig';
import type { BlendMode } from './BlendMode';
import type { CapacityStrategy } from './CapacityStrategy';
import type { FocusUniformsBgl } from './FocusUniformsBgl';

export type InstancedQuadConfig = {
  /** Human-readable label prefix for GPU resource labels and shader
   *  compile errors. The factory builds `${label}-bgl`,
   *  `${label}-pipeline`, `${label}-uniforms`, `${label}-instances`
   *  so each consumer's labels stay distinguishable in devtools. */
  label: string;
  /** Vertex shader source (WESL or WGSL) — typically imported via
   *  `?static` at the consumer module to satisfy the `wesl-plugin`
   *  build step. */
  vertexSource: string;
  /** Fragment shader source — same import convention as `vertexSource`. */
  fragmentSource: string;
  /** Atlas binding shape. Present → 3-binding BGL with `bindAtlas`;
   *  absent → 1-binding BGL with the bind group prebuilt at
   *  construction. */
  atlas?: AtlasConfig;
  /** Instance buffer capacity strategy. */
  capacity: CapacityStrategy;
  /** Color target blend mode. All three current consumers use
   *  `'additive'`. */
  blend: BlendMode;
  /** Colour-target format the pipeline writes into. All three current
   *  consumers target the HDR offscreen `'rgba16float'`. Named `targetFormat`
   *  (not `format`) so it never reads as a `GpuContext.format`, which is
   *  always the swap-chain format. */
  targetFormat: GPUTextureFormat;
  /** Canonical cluster-focus bind-group layout, bound at `@group(1)`.
   *  The focus dim (non-members of a focused structure fade to 8%) is computed
   *  per instance in each consumer's vertex stage via
   *  `focusAlphaMultiplier`; the same shared layout serves every impostor
   *  pipeline so the points pass and the disks fade in lockstep. */
  focusBgl: FocusUniformsBgl;
  /** Visibility for the uniform binding. Defaults to `VERTEX` —
   *  matches TexturedQuadRenderer + TexturedDiskRenderer. ProceduralDiskRenderer
   *  passes `VERTEX | FRAGMENT` to mirror its existing BGL even
   *  though the fragment doesn't actually read the uniform. The
   *  flag is preserved as-is to avoid silently changing the
   *  pipeline-layout introspection signature. */
  uniformVisibility?: GPUShaderStageFlags;
  /**
   * Number of physical `@group(0)` buffer+bindGroup copies to allocate,
   * indexed by `draw()`'s `viewSlot` arg. Defaults to 1 (single shared
   * buffer, `viewSlot` ignored) — every consumer except TexturedDiskRenderer.
   *
   * TexturedDiskRenderer passes `VIEW_SLOT_COUNT` (Task 13b, Ruling 6): its
   * consumer, `texturedDisksLayer`, is on the black-hole lens's sky-cubemap
   * capture roster, whose several `draw()` calls (one per captured face, one
   * for the real view, all before one `submit()`) each carry a DIFFERENT
   * `viewProj`/`viewport`/`camPos`. A single shared `@group(0)` buffer would
   * keep only the last call's bytes at `submit()` time — the same
   * writeBuffer/submit race `createViewSlotUniformRing` closes for the other
   * roster renderers. This factory's `@group(0)` also carries the atlas/
   * hi-res-array bindings (unlike the pure-uniform BGLs those renderers
   * ring), so it rolls its own per-slot buffer+bindGroup array rather than
   * reusing that ring directly — see `instancedQuadRenderer.ts`'s doc.
   *
   * The instance buffer (the disk list itself) is NOT ringed: `disks` is
   * computed once per frame from the real camera, upstream of the capture
   * sweep (`diskPlannerWalk.runFrame`, before `executeFrame`), so every
   * `draw()` call this frame re-uploads byte-identical instance bytes —
   * repeated identical writes commute, so one shared instance buffer is
   * correct (same reasoning `starCatalogRenderer` uses for its per-frame-
   * constant camera-scalar writes).
   */
  viewSlotCount?: number;
};
