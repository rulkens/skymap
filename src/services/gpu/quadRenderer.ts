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

/**
 * Per-instance vertex attributes packed as 12 floats / 48 bytes:
 *
 *   posSize: vec4<f32>  (xyz, sizeWorld)
 *   uvRect:  vec4<f32>  (u0, v0, u1, v1)
 *   extras:  vec4<f32>  (fadeAlpha, _, _, _)
 *
 * The third vec4 carries the per-frame fade multiplier produced by the
 * engine — a combination of distance fade (smoothstep across the
 * apparent-size threshold band) and load fade (a ~400 ms ramp once a
 * fresh bitmap lands in the atlas).  Three-of-four channels in `extras`
 * are reserved padding for future per-instance flags (e.g. selected,
 * highlighted) without growing the stride further.
 */
const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * 96-byte uniform layout (matches the WGSL `Uniforms` struct in quads.wgsl):
 *
 *   bytes  0..63 : viewProj    mat4x4<f32>  (16 floats = 64 B)
 *   bytes 64..71 : viewport    vec2<f32>    (2 floats = 8 B)
 *   bytes 72..79 : _pad0/_pad1 f32 × 2      (8 B; padding so the next vec3 lands on a 16-B boundary)
 *   bytes 80..91 : camPosWorld vec3<f32>    (3 floats = 12 B; vec3 needs 16-B alignment)
 *   bytes 92..95 : pxPerRad    f32          (1 float = 4 B; fits the trailing slot of camPosWorld's 16-B vec4 quantum)
 *
 * Total: 96 bytes — multiple of 16 ✓.
 *
 * `camPosWorld` and `pxPerRad` are used by the vertex stage to compute
 * each quad's apparent angular radius from its world-space distance to
 * the camera, then convert to screen pixels via the pinhole relation
 * `pxRadius = (radius_Mpc / distance_Mpc) * pxPerRad`.  This replaces an
 * earlier "project a unit-X offset and measure the projected length"
 * scheme that varied with camera orientation: as the camera orbited a
 * galaxy, the world-X axis rotated relative to the view direction and the
 * projected length expanded/contracted accordingly, making the quad
 * apparently shrink/grow during orbit.
 */
const UNIFORM_BYTES = 96;

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
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // extras (fadeAlpha + padding)
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
            // Pure additive — galaxy thumbnails are EMISSIVE content
            // (a photograph of the galaxy's actual light output), not
            // opaque material occluding a background.  Additive blend
            // means a thumbnail simply ADDS its emission to whatever's
            // already in the HDR target; overlapping galaxies + the
            // Milky Way impostor accumulate naturally without one
            // covering up the other.
            //
            // An earlier revision used premultiplied OVER (`dstFactor:
            // 'one-minus-src-alpha'`) which treats the thumbnail as
            // opaque material with an alpha cutout: at fade-region
            // pixels (alpha < 1) it preserved (1 - alpha) of the
            // existing pixel.  Combined with depth-write that occluded
            // the later Milky Way pass, fade regions ended up as
            // `col*alpha` against a black HDR target — i.e. they faded
            // to BLACK instead of revealing the Milky Way underneath.
            // Pure additive sidesteps that entire reasoning.
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
    camPosWorld: Readonly<[number, number, number]>,
    pxPerRad: number,
  ): void {
    if (!this.bindGroup) return; // atlas not yet bound — skip silently
    if (instances.length === 0) return;

    // Pack uniforms — see UNIFORM_BYTES doc-comment for the layout.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    // uni[18], uni[19] are the _pad0/_pad1 zero slots (left zero by Float32Array init).
    uni[20] = camPosWorld[0]; // camPosWorld.x at byte offset 80
    uni[21] = camPosWorld[1];
    uni[22] = camPosWorld[2];
    uni[23] = pxPerRad;       // pxPerRad at byte offset 92
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
      data[base + 8] = ins.fadeAlpha;
      // data[base + 9..11] reserved (left zero by Float32Array init)
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }
}
