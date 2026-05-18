/**
 * clusterMarkerRenderer — instanced halo + ring overlay for cluster /
 * supercluster / void POIs.
 *
 * ### Why one renderer for two pipelines?
 *
 * Halos and rings share the same per-POI instance data (position,
 * radius, tints, alphas) and the same camera uniform; only the
 * fragment math differs (additive radial gradient vs. screen-AA ring).
 * One renderer that owns both pipelines + one shared instance vertex
 * buffer lets `setMarkers` upload once per frame and dispatch two
 * draws — versus two factory call sites maintaining two parallel
 * instance buffers.
 *
 * ### Why one draw per category (cluster / supercluster / void)?
 *
 * The marker renderer pre-architects for plan 3's pick fragment.
 * Plan 3 will add a `ringPick.wesl` whose fragment composes
 * `(source.sourceCode << 27) | poiIndex + PICK_SENTINEL_OFFSET` from
 * a per-source uniform — identical to `pointRenderer`'s per-survey
 * uniform pattern.  Issuing one draw per category here (with the
 * per-category SourceUniforms bound at `@group(2)`) means plan 3
 * adds the pick pipeline without re-shaping how descriptors are
 * batched.
 *
 * Voids skip the halo draw entirely (per the spec — a halo would
 * imply matter where the structure is defined by absence).  The
 * descriptor's `haloAlpha === 0` is the gate; descriptors flow into
 * the partition but the halo draw for the void bucket is skipped.
 *
 * ### CPU-only mode
 *
 * Constructed with a null device for unit tests.  GPU resource
 * allocation is guarded by `if (device)` so `setMarkers` packs the
 * CPU scratch buffer + bumps the counter without touching the GPU.
 * Mirrors `markerLineRenderer.ts`'s null-device pattern.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';

/**
 * 9 floats per instance × 4 bytes = 36 bytes/instance.
 *
 * Layout (matches VsIn in clusterMarker/io.wesl):
 *   [0..2]  position.xyz       — world-space centre
 *   [3]     physicalRadiusMpc  — world-space half-extent
 *   [4..6]  haloColor.rgb      — additive halo tint
 *   [7]     haloAlpha          — premultiplied later
 *   [8]     ringAlpha          — premultiplied later
 *
 * Ring color piggybacks on halo color via a per-pipeline uniform
 * override at draw time (the spec lets ring + halo share the warm
 * tint per category; only the void diverges and voids skip halo).
 * If a future category needs distinct halo/ring tints we'd grow the
 * stride to 12 floats (48 bytes) and add `ringColor.rgb`.
 */
const MARKER_INSTANCE_FLOATS = 9;
// Referenced in task 7 when the GPU instance buffer is allocated; declared
// here so the byte-layout comment block above stays adjacent to the constant.
const MARKER_INSTANCE_BYTES = MARKER_INSTANCE_FLOATS * 4;

export function createClusterMarkerRenderer(
  ctx: GpuContext,
  maxMarkers = 64,
): ClusterMarkerRenderer {
  // CPU scratch buffer — always allocated, safe with null device.
  const instanceBuf = new Float32Array(maxMarkers * MARKER_INSTANCE_FLOATS);
  let currentMarkerCount = 0;

  // Phase A — CPU state only.  GPU resources land in Task 7.
  // const device = ctx.device as GPUDevice | null;

  function setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void {
    currentMarkerCount = 0;
    const count = Math.min(descriptors.length, maxMarkers);
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      const base = i * MARKER_INSTANCE_FLOATS;
      instanceBuf[base + 0] = d.worldPos[0];
      instanceBuf[base + 1] = d.worldPos[1];
      instanceBuf[base + 2] = d.worldPos[2];
      instanceBuf[base + 3] = d.physicalRadiusMpc;
      instanceBuf[base + 4] = d.haloColor[0];
      instanceBuf[base + 5] = d.haloColor[1];
      instanceBuf[base + 6] = d.haloColor[2];
      instanceBuf[base + 7] = d.haloAlpha;
      instanceBuf[base + 8] = d.ringAlpha;
      currentMarkerCount++;
    }
    // GPU upload lands in Task 7.
  }

  function render(
    _pass: GPURenderPassEncoder,
    _viewProj: Float32Array,
    _viewportSize: [number, number],
  ): void {
    // GPU draw lands in Task 7.
  }

  function markerCount(): number {
    return currentMarkerCount;
  }

  function destroy(): void {
    // GPU teardown lands in Task 7.
  }

  const renderer: ClusterMarkerRenderer = {
    label: 'clusterMarkerRenderer',
    setMarkers,
    render,
    markerCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
