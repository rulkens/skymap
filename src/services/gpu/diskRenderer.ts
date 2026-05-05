/**
 * DiskRenderer — oriented 3D galaxy disks.
 *
 * Differs from QuadRenderer in two ways:
 *   1. Each instance is tilted in 3D world space: the disk's normal points
 *      toward the camera by default (face-on), and is rotated around the
 *      line-of-sight axis by PA, then tilted by inclination angle
 *      cos(i) = axisRatio. So an axisRatio = 1 disk is face-on; axisRatio
 *      ≈ 0 is edge-on.
 *   2. The fragment shader applies only a soft round-the-corners mask
 *      (the disk silhouette IS the geometry, so the on-screen ellipse
 *      falls out of the projection naturally).
 *
 * Why a separate renderer instead of extending QuadRenderer?  QuadRenderer
 * bakes screen-aligned billboarding into the vertex shader — corner offsets
 * are applied in CLIP space after viewProj.  Tilting in 3D requires the
 * corners to be transformed in WORLD space and then projected, which is a
 * fundamentally different pipeline.  Keeping QuadRenderer alive lets the
 * engine pick the screen-aligned thumbnail path for fallback orientations
 * (where tilting would be cosmetically misleading) and for galaxies still
 * loading their textures.
 *
 * Per-instance attributes (48 bytes / 12 floats):
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, _, _
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext } from '../../@types';
import diskWgsl from './shaders/disks.wgsl?raw';

export type DiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  axisRatio: number;
  positionAngleDeg: number;
  /**
   * Per-frame fade multiplier in [0, 1].  Distance fade × load fade,
   * computed CPU-side by the engine and folded into the shader's final
   * alpha output.  See QuadInstance.d.ts for the underlying logic.
   */
  fadeAlpha: number;
};

const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * 96-byte uniform layout (matches the WGSL `Uniforms` struct in disks.wgsl):
 *
 *   bytes  0..63 : viewProj  mat4x4<f32>  (16 floats = 64 B)
 *   bytes 64..71 : viewport  vec2<f32>    (2 floats = 8 B)
 *   bytes 72..79 : _pad0/_pad1 f32 × 2    (8 B; pads next vec3 to 16-B boundary)
 *   bytes 80..91 : camPos    vec3<f32>    (3 floats = 12 B; vec3 needs 16-B alignment)
 *   bytes 92..95 : _pad2     f32          (4 B; trailing pad in camPos's vec4 quantum)
 *
 * Total: 96 bytes — multiple of 16 ✓.  This mirrors the QuadRenderer's
 * revised layout (after the orbit-warp fix) so the two passes can share
 * the same conceptual binding even though their consumers differ:
 * QuadRenderer uses the trailing slot for `pxPerRad`, while DiskRenderer
 * doesn't need pixel-radius math (the disk geometry sizes itself in
 * world space) and leaves it as padding.
 */
const UNIFORM_BYTES = 96;

export class DiskRenderer {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly uniformBuffer: GPUBuffer;
  private readonly instanceBuffer: GPUBuffer;
  private readonly sampler: GPUSampler;
  private bindGroup: GPUBindGroup | undefined;
  private readonly maxInstances: number;

  constructor(ctx: GpuContext, maxInstances = 256) {
    this.device = ctx.device;
    this.format = ctx.format;
    this.maxInstances = maxInstances;

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'disk-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const module = this.device.createShaderModule({ label: 'disks-wgsl', code: diskWgsl });

    this.pipeline = this.device.createRenderPipeline({
      label: 'disk-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: BYTES_PER_INSTANCE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // uvRect
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // orientation
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: this.format,
            // Pure additive — galaxy disks are EMISSIVE.  See
            // quadRenderer.ts for the full rationale; in short, OVER
            // blend + depth-write produced a fade-to-black bug at
            // disk edges where the Milky Way underneath should have
            // been visible.  Additive blending lets the impostor and
            // the disk's emission accumulate naturally.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer = this.device.createBuffer({
      label: 'disk-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = this.device.createBuffer({
      label: 'disk-instances',
      size: maxInstances * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      label: 'disk-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  /**
   * Bind the atlas texture view.  Must be called once after
   * `atlas.initTexture()`; the bind group can be reused across frames
   * because the atlas's underlying texture doesn't change identity.
   */
  bindAtlas(atlasView: GPUTextureView): void {
    this.bindGroup = this.device.createBindGroup({
      label: 'disk-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  /**
   * Issue the draw call.  `instances.length` must be ≤ `maxInstances`.
   * The engine is responsible for filtering down to the disk-eligible
   * subset (real orientation data + apparent size large enough to warrant
   * a 3D plane vs the screen-aligned quad fallback).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    camPos: Readonly<[number, number, number]>,
    instances: ReadonlyArray<DiskInstance>,
  ): void {
    if (!this.bindGroup) return; // atlas not yet bound — skip silently
    if (instances.length === 0) return;

    // Pack uniforms — see UNIFORM_BYTES doc-comment for the layout.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    // uni[18], uni[19] are _pad0/_pad1 (left zero by Float32Array init).
    uni[20] = camPos[0]; // camPos.x at byte offset 80
    uni[21] = camPos[1];
    uni[22] = camPos[2];
    // uni[23] = _pad2 (left zero).
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uni);

    // Pack instances.  Fresh allocation per frame — same approach as
    // QuadRenderer; for the v1 cap of 256 instances this is 12 KB per
    // frame, negligible.  Swap to a reusable scratch buffer if profiling
    // later flags it.
    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
      data[base + 8] = ins.axisRatio;
      data[base + 9] = ins.positionAngleDeg;
      data[base + 10] = ins.fadeAlpha;
      data[base + 11] = 0;
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }
}
