/**
 * QuadRenderer — billboard quad pass for galaxy thumbnails.
 *
 * Runs AFTER the existing point pass each frame.  Each instance is one
 * textured quad whose center matches a galaxy and whose size is
 * controlled by the engine.  We bind the atlas texture + sampler in
 * group(0) so the engine can re-bind cheaply as the atlas's underlying
 * GPUTexture stays put across frames.
 *
 * Why one atlas + one bind group?  WebGPU caps simultaneously-bound
 * textures at ~16, and a per-galaxy GPUTexture would thrash the
 * resource pool.  One atlas + one bind group = one draw call for
 * thousands of textured galaxies.
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext, QuadInstance } from '../../@types';
import quadsWgsl from './shaders/quads.wgsl?raw';

const FLOATS_PER_INSTANCE = 8;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * 80-byte uniform layout: mat4 viewProj (64) + vec2 viewport (8) +
 * 2x f32 padding (8) so the struct rounds up to a multiple of 16
 * (WGSL uniform-block alignment requirement).
 */
const UNIFORM_BYTES = 80;

export class QuadRenderer {
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
      label: 'quad-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const module = this.device.createShaderModule({ label: 'quads-wgsl', code: quadsWgsl });

    this.pipeline = this.device.createRenderPipeline({
      label: 'quad-pipeline',
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
            // Premultiplied-alpha "over" composite — same equation as the
            // points pass, lets quads sit cleanly atop the dot field.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer = this.device.createBuffer({
      label: 'quad-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = this.device.createBuffer({
      label: 'quad-instances',
      size: maxInstances * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      label: 'quad-sampler',
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
      label: 'quad-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  /**
   * Issue the draw call.  `instances.length` must be ≤ `maxInstances`
   * (the engine pre-filters; in v1 the limit is set to the atlas slot
   * count of 256, so the cap is naturally tight).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<QuadInstance>,
  ): void {
    if (!this.bindGroup) return; // atlas not yet bound — skip silently
    if (instances.length === 0) return;

    // Pack uniforms (viewProj 16 floats + viewport 2 floats + 2 pad).
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uni);

    // Pack instances.  We allocate a fresh Float32Array each frame; for
    // the v1 instance cap of 256 that's 8 KB per frame, negligible
    // allocation cost.  If profiling later flags this we can swap to a
    // reusable scratch buffer sized at `maxInstances * BYTES_PER_INSTANCE`.
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
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }
}
