/**
 * instancedQuadRenderer — shared factory for the three "instanced billboard"
 * renderers in the thumbnail / impostor pass: textured quads, textured
 * 3D-oriented disks, and procedural 3D-oriented disks.
 *
 * ## Why this exists
 *
 * Pre-Spec G the three renderers (`thumbnailRenderer.ts`, `texturedDiskRenderer.ts`,
 * `proceduralDiskRenderer.ts`) each carried a near-identical block of
 * WebGPU plumbing:
 *
 *   - One `GPUBindGroupLayout` with a uniform binding at slot 0
 *     (and, for the textured renderers, a texture + sampler at 1 + 2)
 *   - One `GPURenderPipeline` whose vertex layout is a single 48-byte
 *     instance stride containing three `float32x4` attributes
 *   - A 96-byte uniform buffer (mat4 viewProj + vec2 viewport +
 *     2 pad floats + vec3 camPos + 1 trailing float)
 *   - A per-instance vertex buffer (fixed capacity for the textured
 *     renderers, grow-on-demand for the procedural one)
 *   - The same `setPipeline → setBindGroup → setVertexBuffer →
 *     draw(6, n, 0, 0)` per-frame draw shape
 *
 * Roughly 80% of each renderer's body was structural boilerplate. Only the
 * shader pair, the bind-group shape (with vs without atlas), the capacity
 * strategy, and the *interpretation* of the third per-instance vec4
 * differed. Spec G consolidates the plumbing here; each consumer becomes
 * a thin wrapper that serializes its typed instance array into a packed
 * `Float32Array` and forwards to this factory's `draw`.
 *
 * ## What this owns
 *
 *   - The bind-group layout (built explicitly, NOT via `layout: 'auto'`
 *     — auto-derived layouts are pipeline-specific identities and bite
 *     hard once you try to share resources or build bind groups against
 *     the same shape from a different pipeline; see the
 *     `feedback_webgpu_auto_layout_trap` memory note)
 *   - The pipeline + pipeline layout
 *   - The 96-byte uniform buffer (its layout matches the shared
 *     `CameraUniforms` prefix — see the consumer-side files for the
 *     full byte map)
 *   - The instance vertex buffer's lifecycle (fixed-preallocated OR
 *     grow-on-demand depending on `config.capacity`)
 *   - Optional atlas texture + sampler bindings, late-bound via
 *     `bindAtlas` when present
 *
 * ## What consumers still own
 *
 *   - Their typed per-instance record (`ThumbnailInstance`, `DiskInstance`,
 *     `ProceduralDiskInstance`) and the serialization that packs it
 *     into a 12-float-per-instance `Float32Array`. The third vec4's
 *     four floats mean different things for each consumer — `extras`
 *     (fadeAlpha + pad) for quads, `orientation` (axisRatio + PA + pad
 *     + fadeAlpha) for disks, `extras` (colourIndex + crossfadeAlpha +
 *     pad) for procedural disks — so a single shared serializer would
 *     just be a typed dispatch, defeating the point.
 *   - Their public API surface, so call sites in the engine don't
 *     change. Each consumer factory returns its own type
 *     (`ThumbnailRenderer` etc.) whose `draw` takes its typed instance
 *     array and forwards a packed `Float32Array` here.
 *
 * ## Capacity strategies
 *
 *   - `fixed`: preallocate one `max * 48`-byte vertex buffer at
 *     construction. Each draw `writeBuffer`s into offset 0. Matches
 *     ThumbnailRenderer + TexturedDiskRenderer, whose engine-side filters cap the
 *     per-frame count at the atlas slot count (256). Over-capacity is
 *     a programming error in the engine; we don't truncate or guard.
 *   - `grow`: lazy first-allocation, regrow on overflow. Matches
 *     ProceduralDiskRenderer, whose per-frame count tracks the number
 *     of galaxies in the 8-px+ apparent-size band — that count grows
 *     unboundedly as the camera approaches a dense field, so a fixed
 *     cap would visually clip impostors mid-flythrough. Growth uses
 *     `max(requested, 64)` as the new capacity; the buffer is never
 *     shrunk because the same dense field tends to recur.
 *
 * Both strategies produce the same on-screen result for any given
 * frame — they differ only in allocation pattern. We don't try to
 * unify them because each is correct for its consumer's traffic
 * pattern, and a single "always grow" strategy would lose the
 * upfront-allocation determinism the textured renderers rely on
 * (their atlas-slot cap means the buffer size is known at construction).
 *
 * ## Blend modes
 *
 * All three current consumers use ADDITIVE blend
 * (`{srcFactor:'one', dstFactor:'one', operation:'add'}`) for both
 * color and alpha. Galaxy thumbnails, textured disks, and procedural
 * disks all carry EMISSIVE content (a photograph or a procedural
 * approximation of the galaxy's actual light output), not opaque
 * material occluding a background. Additive blending lets overlapping
 * impostors plus the Milky Way layer accumulate naturally in the HDR
 * target without any pass "covering up" the others. An earlier Quad
 * revision used premultiplied OVER and produced a fade-to-black bug
 * at thumbnail edges; see `thumbnailRenderer.ts` history for the full
 * post-mortem.
 *
 * The factory accepts an `'alpha'` blend variant for forward
 * compatibility (e.g. a future opaque-material impostor) but no
 * current consumer uses it.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { InstancedQuadConfig } from '../../../@types/rendering/InstancedQuadConfig';
import type { InstancedQuadRenderer } from '../../../@types/rendering/InstancedQuadRenderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * Per-instance vertex layout shared by all three consumers: three
 * `float32x4` attributes at locations 0/1/2, totalling 48 bytes.
 * Exported so consumers can size their packed `Float32Array` against
 * the same constant rather than rederiving it.
 */
export const FLOATS_PER_INSTANCE = 12;
export const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * Uniform buffer size matching the `CameraUniforms`-extended struct
 * shared across quads / disks / proceduralDisks. The byte layout is:
 *
 *   bytes  0..63 : viewProj      mat4x4<f32>  (CameraUniforms.viewProj)
 *   bytes 64..71 : viewportPx    vec2<f32>    (CameraUniforms.viewportPx)
 *   bytes 72..79 : reserved pad  f32 × 2      (CameraUniforms reserved)
 *   bytes 80..91 : camPosWorld   vec3<f32>
 *   bytes 92..95 : pxPerRad      f32          (or padding for disks)
 *
 * Total: 96 bytes. The `pxPerRad` slot is consumer-specific —
 * ThumbnailRenderer + ProceduralDiskRenderer use it for pixel-radius
 * computation; TexturedDiskRenderer leaves it as zero padding. The factory
 * always writes whatever the caller passes in `draw`'s `pxPerRad`
 * (default 0), so consumers that don't care can simply omit it.
 */
export const UNIFORM_BYTES = 96;

export function createInstancedQuadRenderer(
  ctx: GpuContext,
  config: InstancedQuadConfig,
): InstancedQuadRenderer {
  const { device } = ctx;
  const {
    label,
    vertexSource,
    fragmentSource,
    atlas,
    capacity,
    blend,
    format,
    uniformVisibility = GPUShaderStage.VERTEX,
  } = config;

  // ── Bind group layout ──────────────────────────────────────────────
  //
  // Two distinct shapes depending on whether the consumer wants atlas
  // sampling. We build them here explicitly rather than via
  // `pipeline.getBindGroupLayout(0)` because auto-derived layouts are
  // pipeline-specific identities — incompatible with sharing buffers
  // or rebuilding bind groups across pipelines (see the WebGPU
  // layout-auto trap memory note).
  const bindGroupLayout = atlas
    ? device.createBindGroupLayout({
        label: `${label}-bgl`,
        entries: [
          { binding: 0, visibility: uniformVisibility, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      })
    : device.createBindGroupLayout({
        label: `${label}-bgl`,
        entries: [{ binding: 0, visibility: uniformVisibility, buffer: { type: 'uniform' } }],
      });

  const vsModule = createShaderModuleWithDevLog(device, vertexSource, `${label}.vertex`);
  const fsModule = createShaderModuleWithDevLog(device, fragmentSource, `${label}.fragment`);

  // ── Blend descriptor ───────────────────────────────────────────────
  //
  // Additive: emissive pass — overlapping impostors accumulate
  // naturally in the HDR buffer. Alpha: standard premultiplied OVER,
  // reserved for opaque-material consumers (none today).
  const blendDescriptor: GPUBlendState =
    blend === 'additive'
      ? {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        }
      : {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        };

  const pipeline = device.createRenderPipeline({
    label: `${label}-pipeline`,
    layout: device.createPipelineLayout({
      label: `${label}-pipeline-layout`,
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: BYTES_PER_INSTANCE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
            { shaderLocation: 2, offset: 32, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format, blend: blendDescriptor }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    label: `${label}-uniforms`,
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler (only when atlas is configured) ────────────────────────
  //
  // Default matches Quad + Disk: bilinear filter, clamp-to-edge.
  // Consumers can override via `atlas.samplerDescriptor`.
  const sampler =
    atlas !== undefined
      ? device.createSampler(
          atlas.samplerDescriptor ?? {
            label: `${label}-sampler`,
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
          },
        )
      : undefined;

  // ── Bind group ─────────────────────────────────────────────────────
  //
  // Without atlas: build the 1-binding bind group right now (no
  // late-binding dependencies). With atlas: leave it undefined until
  // `bindAtlas` is called — this matches the existing Quad + Disk
  // semantics where the engine calls bindAtlas once after the atlas
  // texture is created, and `draw` no-ops until then.
  let bindGroup: GPUBindGroup | undefined;
  if (atlas === undefined) {
    bindGroup = device.createBindGroup({
      label: `${label}-bg`,
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  }

  // ── Instance buffer state ──────────────────────────────────────────
  //
  // For 'fixed': preallocated up front. For 'grow': null until first
  // non-empty draw, then sized to `max(instanceCount, 64)` and
  // resized as needed.
  let instanceBuffer: GPUBuffer | null = null;
  let instanceBufferCapacity = 0; // measured in instances
  if (capacity.kind === 'fixed') {
    instanceBuffer = device.createBuffer({
      label: `${label}-instances`,
      size: capacity.max * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    instanceBufferCapacity = capacity.max;
  }

  // ── Reusable uniform scratch buffer ────────────────────────────────
  //
  // Allocated once and rewritten per draw. 96 bytes / 24 floats —
  // negligible vs allocating fresh every frame, but cleaner. The
  // CameraUniforms reserved pad slots at f32[18..19] MUST stay zero;
  // we explicitly zero them every draw rather than relying on
  // Float32Array's lazy-init guarantee surviving reuse.
  const uniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  function bindAtlas(atlasView: GPUTextureView): void {
    bindGroup = device.createBindGroup({
      label: `${label}-bg`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: sampler! },
      ],
    });
  }

  function draw(args: {
    pass: GPURenderPassEncoder;
    viewProj: Float32Array;
    viewport: [number, number];
    instanceBytes: Float32Array;
    instanceCount: number;
    camPosWorld?: Readonly<Vec3>;
    pxPerRad?: number;
  }): void {
    if (args.instanceCount === 0) return;
    if (!bindGroup) return; // atlas-capable renderer with no atlas bound yet

    // ── Grow instance buffer if needed (grow strategy only) ─────────
    if (capacity.kind === 'grow') {
      if (instanceBuffer === null || instanceBufferCapacity < args.instanceCount) {
        instanceBuffer?.destroy();
        const cap = Math.max(args.instanceCount, 64);
        instanceBuffer = device.createBuffer({
          label: `${label}-instances`,
          size: cap * BYTES_PER_INSTANCE,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        instanceBufferCapacity = cap;
      }
    }

    // ── Pack uniforms ───────────────────────────────────────────────
    //
    // f32[ 0..15] viewProj         (CameraUniforms.viewProj)
    // f32[16..17] viewport         (CameraUniforms.viewportPx)
    // f32[18..19] reserved pad     (must stay zero)
    // f32[20..22] camPosWorld
    // f32[23]     pxPerRad
    uniformScratch.set(args.viewProj, 0);
    uniformScratch[16] = args.viewport[0];
    uniformScratch[17] = args.viewport[1];
    uniformScratch[18] = 0;
    uniformScratch[19] = 0;
    uniformScratch[20] = args.camPosWorld?.[0] ?? 0;
    uniformScratch[21] = args.camPosWorld?.[1] ?? 0;
    uniformScratch[22] = args.camPosWorld?.[2] ?? 0;
    uniformScratch[23] = args.pxPerRad ?? 0;
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // ── Upload instance data ────────────────────────────────────────
    //
    // The consumer has already packed `args.instanceCount * 12` floats
    // into `args.instanceBytes`. We forward the byte count exactly,
    // not `instanceBytes.byteLength`, so an oversized scratch buffer
    // doesn't write past the end of the GPU buffer.
    device.queue.writeBuffer(
      instanceBuffer!,
      0,
      args.instanceBytes.buffer,
      args.instanceBytes.byteOffset,
      args.instanceCount * BYTES_PER_INSTANCE,
    );

    args.pass.setPipeline(pipeline);
    args.pass.setBindGroup(0, bindGroup);
    args.pass.setVertexBuffer(0, instanceBuffer!);
    args.pass.draw(6, args.instanceCount, 0, 0);
  }

  function destroy(): void {
    uniformBuffer.destroy();
    instanceBuffer?.destroy();
    instanceBuffer = null;
  }

  // Only expose `bindAtlas` when atlas was configured. Consumers that
  // don't need it never see the method, which is both clearer at the
  // wrapper site and prevents accidental late-binding of a sampler-
  // less BGL.
  const renderer: InstancedQuadRenderer = atlas
    ? { label: 'instancedQuadRenderer', bindAtlas, draw, destroy }
    : { label: 'instancedQuadRenderer', draw, destroy };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
