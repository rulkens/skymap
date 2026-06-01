/**
 * diskRadiusRing — developer overlay pass that draws a world-space ring
 * at a famous galaxy's procedural-disk radius, lying IN the disk plane
 * so it traces the textured quad's projected outline.
 *
 * ### What it's for
 *
 * A calibration aid: if the textured disk's edge falls short of (or
 * overruns) this ring, the per-galaxy `diameterKpc` → world-radius
 * mapping is off. Because the ring reuses `texturedDisks`'s exact
 * disk-plane basis (`lib/orientation::diskAxes` with `paDeg` +
 * `axisRatio`), "does the disk fill the ring?" is an apples-to-apples
 * comparison.
 *
 * ### Why a `(device, swapChainFormat)` factory (not GpuContext)
 *
 * Matches the sibling `pickDebugOverlay` pass shape — a self-contained
 * overlay that takes only what it needs and returns `{ draw, destroy }`.
 * (The older `selectionRingRenderer` takes a full `GpuContext` + a
 * `device: null` testability cast; this pass's contract pins a non-null
 * `device`, so it skips that and stays simpler.)
 *
 * ### Two uniform bindings
 *
 * Camera prefix (80 B) at @binding 0, per-draw ring data (32 B) at
 * @binding 1 — same split as `selectionRing`. Each uploads at its own
 * cadence (camera per frame, ring per selection).
 *
 * ### Blend mode
 *
 * Premultiplied-alpha OVER (`src: one, dst: one-minus-src-alpha`). The
 * ring is a UI overlay drawn post-tone-map; the fragment emits
 * `rgb * alpha, alpha` so the composite reads as "src over dst".
 *
 * ### Topology
 *
 * `line-strip`: the vertex stage generates a closed ring of
 * `SEGMENTS + 1` vertices (the last wraps onto the first). The draw
 * count `SEGMENTS_PLUS_ONE` MUST equal the shader's `SEGMENTS` (96) + 1.
 * Both numbers carry a comment pinning them together.
 */

import vsCode from '../shaders/diskRadiusRing/vertex.wesl?static';
import fsCode from '../shaders/diskRadiusRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { DiskRadiusRing } from '../../../@types/rendering/DiskRadiusRing';
import type { Vec3 } from '../../../@types/math/Vec3';

/** Shared CameraUniforms prefix — viewProj(64) + viewportPx(8) + pads(8). */
const CAMERA_UNIFORM_BYTES = 80;

/**
 * DiskRadiusRingUniforms: center(12) + radiusWorld(4) + paDeg(4) +
 * axisRatio(4) + 2 pads(8) = 32 bytes, 16-byte aligned.
 */
const RING_UNIFORM_BYTES = 32;

/**
 * Vertex count for the closed line-strip ring. MUST equal the WESL
 * shader's `SEGMENTS` (96) + 1 — vertex 96 wraps theta to 2*pi, landing
 * back on vertex 0 to close the strip. Changing one without the other
 * leaves the ring open (too few) or overruns the loop (too many).
 */
const SEGMENTS_PLUS_ONE = 97;

export function createDiskRadiusRing(
  device: GPUDevice,
  swapChainFormat: GPUTextureFormat,
): DiskRadiusRing {
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'disk-radius-ring-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'diskRadiusRing.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'diskRadiusRing.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'disk-radius-ring-pipeline',
    layout: device.createPipelineLayout({
      label: 'disk-radius-ring-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: swapChainFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'line-strip' },
  });

  const cameraBuffer = device.createBuffer({
    label: 'disk-radius-ring-camera',
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const ringBuffer = device.createBuffer({
    label: 'disk-radius-ring-ring',
    size: RING_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'disk-radius-ring-bg',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: ringBuffer } },
    ],
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    args: { center: Vec3; radiusWorld: number; axisRatioForTilt: number; paDeg: number },
  ): void {
    // Camera UBO: viewProj at floats [0..15]. viewportPx ([16..17]) is
    // left zero — the ring does no pixel-space math, so it never reads
    // the viewport. Trailing pads stay zero via Float32Array zero-init.
    const camUni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    camUni.set(viewProj, 0);
    device.queue.writeBuffer(cameraBuffer, 0, camUni);

    // Ring UBO (matches DiskRadiusRingUniforms byte layout):
    //   floats [0..2] center.xyz   (bytes  0..11)
    //   float  [3]    radiusWorld  (bytes 12..15)
    //   float  [4]    paDeg        (bytes 16..19)
    //   float  [5]    axisRatio    (bytes 20..23)
    //   floats [6..7] pads, zero   (bytes 24..31)
    const ringUni = new Float32Array(RING_UNIFORM_BYTES / 4);
    ringUni[0] = args.center[0];
    ringUni[1] = args.center[1];
    ringUni[2] = args.center[2];
    ringUni[3] = args.radiusWorld;
    ringUni[4] = args.paDeg;
    ringUni[5] = args.axisRatioForTilt;
    device.queue.writeBuffer(ringBuffer, 0, ringUni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // SEGMENTS_PLUS_ONE (97) MUST equal the shader's SEGMENTS (96) + 1 —
    // see the const docblock above.
    pass.draw(SEGMENTS_PLUS_ONE, 1, 0, 0);
  }

  function destroy(): void {
    cameraBuffer.destroy();
    ringBuffer.destroy();
  }

  return { draw, destroy };
}
