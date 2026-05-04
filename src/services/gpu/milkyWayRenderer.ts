/**
 * milkyWayRenderer — single-quad procedural Milky Way impostor at the
 * world origin.
 *
 * Sibling to `proceduralDiskRenderer.ts` (per-galaxy 3D-oriented
 * impostors) and `quadRenderer.ts` (textured screen-aligned thumbnails)
 * but with a degenerate cardinality: this pass renders exactly ONE
 * instance per frame.  No per-galaxy vertex buffer, no instancing —
 * just a six-vertex `draw(6, 1)` call.
 *
 * The GPU side is a hand port of a CC0 ShaderToy "Spiral galaxy"
 * fragment shader.  See `shaders/milkyWayImpostor.wgsl` for the WGSL
 * source and the per-line port notes.
 *
 * ### Uniform buffer ABI
 *
 * 96 bytes total — padded to the same shape as the procedural-disk
 * uniform layout so future refactors that share a uniform-pack helper
 * across passes don't have to special-case this one:
 *
 *   offset 0  | mat4x4<f32> viewProj    — UNUSED (kept for ABI symmetry)
 *   offset 64 | vec2<f32>   viewport    — UNUSED (kept for ABI symmetry)
 *   offset 72 | f32         fadeAlpha   — distance-based alpha, [0..1]
 *   offset 76 | f32         iTime       — animation time (sec * 0.25)
 *   offset 80 | (16 bytes padding for std140-ish 96-byte total)
 *
 * The two UNUSED slots are intentional:
 *   - viewProj: the impostor is emitted directly in clip-space, so the
 *     vertex stage doesn't need a view matrix.  But every other pass in
 *     this engine uploads viewProj in slot 0; mirroring it here lets a
 *     future "renderFrame uniform-pack helper" stay pass-agnostic.
 *   - viewport: same rationale — every other pass uses it for
 *     pxPerRad-style derivations.  This pass doesn't need pixel
 *     coordinates because the fragment shader works in [-1.05, 1.05]
 *     uv space directly, but uploading it costs effectively nothing
 *     and preserves ABI symmetry.
 *
 * ### Why no instance vertex buffer?
 *
 * `proceduralDiskRenderer.ts` packs per-galaxy data (xyz, size,
 * orientation, colour-index, crossfade) into a per-instance vertex
 * buffer.  This pass has no such per-galaxy data — there is exactly
 * one impostor at one fixed position (the world origin, baked into the
 * shader).  We do not even need a vertex buffer; the vertex stage
 * looks up its corner from a const `array<vec2<f32>, 6>` indexed by
 * `@builtin(vertex_index)`.
 */

import wgsl from './shaders/milkyWayImpostor.wgsl?raw';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
};

export class MilkyWayRenderer {
  /**
   * Public constant pinning the on-the-wire uniform buffer size.  Must
   * match the WGSL `Uniforms` struct's std140-ish layout (mat4 + vec2 +
   * 2 f32 + 16 bytes padding = 96 bytes) byte-for-byte.  Changing one
   * without the other yields silent uniform-read corruption.
   */
  static readonly UNIFORM_BUFFER_SIZE = 96;

  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.uniformBuffer = device.createBuffer({
      size: MilkyWayRenderer.UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied additive — same blend mode as the procedural
            // disk pass and the points pass, so the impostor composites
            // correctly with downstream additive contributions when
            // both are drawing the same pixels.
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue the single-instance draw.  Encodes a 6-vertex / 1-instance
   * call after writing the uniform buffer.  Caller is responsible for
   * gating on the user's "Show Milky Way" toggle and the distance-fade
   * threshold (`fadeAlpha === 0` is the natural skip condition; the
   * caller should `return` instead of submitting a no-op draw to keep
   * the per-frame cost honest at zero when the impostor is invisible).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    fadeAlpha: number,
    iTimeSec: number,
  ): void {
    // Pack uniforms into a 96-byte ArrayBuffer matching the WGSL
    // `Uniforms` struct layout.  See the class doc-comment for the
    // offset table.
    const uniforms = new ArrayBuffer(MilkyWayRenderer.UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniforms);
    // mat4 viewProj (offsets 0..63 / floats 0..15)
    f32.set(viewProj, 0);
    // viewport (offsets 64..71 / floats 16..17)
    f32[16] = viewport[0];
    f32[17] = viewport[1];
    // fadeAlpha (offset 72 / float 18)
    f32[18] = fadeAlpha;
    // iTime (offset 76 / float 19)
    f32[19] = iTimeSec;
    // floats 20..23 are padding — already zero from ArrayBuffer init.
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, 1);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
  }
}
