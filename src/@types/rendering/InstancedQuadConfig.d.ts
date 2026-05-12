/**
 * InstancedQuadConfig — construction-time config for
 * `createInstancedQuadRenderer`.
 */

import type { AtlasConfig } from './AtlasConfig';
import type { BlendMode } from './BlendMode';
import type { CapacityStrategy } from './CapacityStrategy';

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
  /** Color target format. All three current consumers target the
   *  HDR offscreen `'rgba16float'`. */
  format: GPUTextureFormat;
  /** Visibility for the uniform binding. Defaults to `VERTEX` —
   *  matches ThumbnailRenderer + DiskRenderer. ProceduralDiskRenderer
   *  passes `VERTEX | FRAGMENT` to mirror its existing BGL even
   *  though the fragment doesn't actually read the uniform. The
   *  flag is preserved as-is to avoid silently changing the
   *  pipeline-layout introspection signature. */
  uniformVisibility?: GPUShaderStageFlags;
};
