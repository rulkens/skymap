/**
 * proceduralDiskRenderer — 3D-oriented procedural galaxy impostors.
 *
 * Sibling to texturedDiskRenderer (texture-based) and thumbnailRenderer (screen-
 * aligned + texture-based). Activates for galaxies in the apparent-
 * size band 8..∞ px, with a crossfade against the points pass across
 * 8..14 px. See `docs/superpowers/plans/2026-05-04-procedural-disk-
 * impostor.md` for the full design rationale.
 *
 * The shader (`shaders/proceduralDisks/`) is documented in detail; this
 * file is the JS-side glue.
 *
 * ## Per-instance attributes (48 bytes / 12 floats)
 *
 *   posSize       vec4   xyz, sizeWorldMpc
 *   orientation   vec4   axisRatio, positionAngleDeg, _, _
 *   extras        vec4   colourIndex, crossfadeAlpha, _, _
 *
 * Same memory layout as texturedDiskRenderer (3 vec4<f32>), minus the UV rect
 * — those four floats become (colourIndex, crossfadeAlpha, _, _) instead.
 *
 * ## Why grow-on-demand instance buffer
 *
 * ThumbnailRenderer + TexturedDiskRenderer cap their per-frame count at the atlas
 * slot count (256), so a fixed-size preallocated buffer fits. The
 * procedural renderer activates for every galaxy in the 8 px+
 * apparent-size band, with no atlas dependency — that count grows
 * unboundedly as the camera approaches a dense field. A fixed cap
 * would visually clip impostors mid-flythrough. The shared factory's
 * `capacity: { kind: 'grow' }` strategy lazily allocates on first
 * non-empty draw and reallocates (destroy + recreate) when the
 * requested count exceeds the current capacity.
 *
 * ## Why uniform binding visibility is VERTEX | FRAGMENT
 *
 * Historical: pre-WESL the BGL declared the uniform binding as visible
 * to both stages even though only the vertex stage reads it. The WESL
 * conversion preserved the flag so the pipeline-layout introspection
 * signature didn't silently change. We pass `uniformVisibility`
 * through the shared factory to keep that exact byte-for-byte BGL.
 *
 * ## Why this is a thin wrapper post-Spec G
 *
 * Pipeline / BGL / uniform buffer / instance buffer plumbing now lives
 * in `instancedQuadRenderer.ts`, shared with thumbnailRenderer +
 * texturedDiskRenderer. This file owns: the consumer-facing
 * `createProceduralDiskRenderer` factory signature (preserved
 * unchanged from Spec F), the `ProceduralDiskInstance → packed
 * Float32Array` serialization, and the wrapper `draw(...)` translating
 * the engine's call convention into the shared factory's `draw(args)`
 * shape.
 */

import vsCode from '../shaders/proceduralDisks/vertex.wesl?static';
import fsCode from '../shaders/proceduralDisks/fragment.wesl?static';
import type { ProceduralDiskInstance } from '../../../@types/rendering/ProceduralDiskInstance';
import type { ProceduralDiskRenderer } from '../../../@types/rendering/ProceduralDiskRenderer';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export function createProceduralDiskRenderer(init: Init): ProceduralDiskRenderer {
  const inner = createInstancedQuadRenderer(init, {
    label: 'proceduralDisks',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    // No atlas — the procedural fragment shader generates the
    // brightness profile from scratch.
    capacity: { kind: 'grow' },
    // Procedural disks are EMISSIVE; same rationale as quad/disk.
    blend: 'additive',
    format: init.format,
    // Match the pre-Spec-G BGL exactly: the uniform binding is
    // tagged VERTEX | FRAGMENT even though the fragment doesn't
    // currently read 'u'. Preserving the flag keeps the
    // pipeline-layout introspection signature stable.
    uniformVisibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Pre-Spec-G this allocated fresh per frame — preserve that
    // behavior exactly so the refactor is mechanical. A reusable
    // scratch buffer can be added later if profiling flags it; the
    // typical-frame size for the procedural pass is small enough
    // (a few KB) that the GC churn isn't load-bearing today.
    const packed = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const o = i * FLOATS_PER_INSTANCE;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packed[o + 6] = 0;
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = 0;
      packed[o + 11] = 0;
    }

    inner.draw({
      pass,
      viewProj,
      viewport,
      instanceBytes: packed,
      instanceCount: instances.length,
      camPosWorld,
      pxPerRad,
    });
  }

  const renderer: ProceduralDiskRenderer = {
    label: 'proceduralDiskRenderer',
    draw,
    destroy: inner.destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
