/**
 * instancedQuadRenderer — shared factory for the three "instanced billboard"
 * renderers in the thumbnail / impostor pass: textured quads, textured
 * 3D-oriented disks, and procedural 3D-oriented disks.
 *
 * ## Why this exists
 *
 * Pre-Spec G the three renderers (`texturedQuadRenderer.ts`, `texturedDiskRenderer.ts`,
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
 *     (`TexturedQuadRenderer` etc.) whose `draw` takes its typed instance
 *     array and forwards a packed `Float32Array` here.
 *
 * ## Capacity strategies
 *
 *   - `fixed`: preallocate one `max * 48`-byte vertex buffer at
 *     construction. Each draw `writeBuffer`s into offset 0. Matches
 *     TexturedQuadRenderer + TexturedDiskRenderer, whose engine-side filters cap the
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
 * at thumbnail edges; see `texturedQuadRenderer.ts` history for the full
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
 * Per-instance vertex layout shared by all three consumers: four
 * `float32x4` attributes at locations 0/1/2/3, totalling 64 bytes.
 * Exported so consumers can size their packed `Float32Array` against
 * the same constant rather than rederiving it.
 *
 * ## Why 64 (and not 48 still)
 *
 * The hi-res LOD work (Task R1, 2026-05-28) needed two extra per-
 * instance floats — `hiResLayerIdx` and `hiResCrossfadeAlpha` — to
 * tell the textured-disk fragment shader which slot of the hi-res
 * texture-array layer to sample from, and how strongly to mix it
 * against the low-res atlas thumbnail.
 *
 * Two floats won't pack into a `float32x2` slot here: WebGPU's vertex
 * attribute formats span the whole stride starting at `offset`, and
 * adding a non-`float32x4` attribute would force consumers that don't
 * use those slots (procedural, future quad) into an awkward
 * "vec4 of (hiResLayerIdx, hiResCrossfadeAlpha, _, _)" shape anyway.
 * Promoting the stride from three vec4s to FOUR vec4s keeps the
 * layout uniform across all consumers, gives the textured-disk shader
 * the natural `vec4<f32>` it wants, and leaves two zero-padded floats
 * (slots 14, 15) as a free shelf for the next per-instance attribute
 * we need. The texturedDisk consumer fills slots 12+13; quad +
 * procedural consumers zero-pad all four trailing slots.
 *
 * The fixed-capacity instance buffer grows from `256 × 48 = 12 KiB` to
 * `256 × 64 = 16 KiB` — irrelevant. The grow-on-demand procedural
 * buffer grows proportionally; same conclusion.
 */
export const FLOATS_PER_INSTANCE = 16;
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
 * TexturedQuadRenderer + ProceduralDiskRenderer use it for pixel-radius
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
  // When `atlas.hiResArray` is set, the layout appends a
  // `texture_2d_array` + linear sampler at bindings 3 + 4 so the
  // texturedDisk consumer can sample full-resolution famous-galaxy
  // tiles. The append-only ordering matters: the bindings must line
  // up with the WGSL @group/@binding decorations in the shader, and
  // growing slots 1/2's meaning would break the texturedQuad consumer
  // that shares this factory.
  const atlasEntries: GPUBindGroupLayoutEntry[] = atlas
    ? [
        { binding: 0, visibility: uniformVisibility, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ]
    : [{ binding: 0, visibility: uniformVisibility, buffer: { type: 'uniform' } }];
  if (atlas?.hiResArray) {
    atlasEntries.push(
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array' },
      },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    );
  }
  const bindGroupLayout = device.createBindGroupLayout({
    label: `${label}-bgl`,
    entries: atlasEntries,
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
            // Slot 3 added in Task R1 (hi-res LOD): carries the
            // textured-disk consumer's (hiResLayerIdx,
            // hiResCrossfadeAlpha, 0, 0) tuple. Quad + procedural
            // consumers zero-fill it; the vertex layout still matches
            // because all three pack to the same 16-float stride.
            { shaderLocation: 3, offset: 48, format: 'float32x4' },
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

  // Default sampler for the hi-res `texture_2d_array` slot when the
  // consumer doesn't pass one to `bindHiResArray`. Identical filter
  // characteristics to the atlas sampler — bilinear, clamp — because
  // a hi-res tile is rendered at the same magnification regime as
  // the low-res atlas one and we want a clean crossfade between the
  // two without one side artifacting harder.
  const defaultHiResSampler = atlas?.hiResArray
    ? device.createSampler({
        label: `${label}-hires-sampler`,
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      })
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

  // ── Late-bound resource handles ────────────────────────────────────
  //
  // The bind group is composed once we have all the resources the BGL
  // declares. With `atlas` alone that's just the atlas view; with
  // `atlas.hiResArray` it's atlas view AND hi-res array view. The
  // engine wires these up at different points in startup (the atlas
  // is created on first frame, the hi-res array on first famous-galaxy
  // approach), so we cache each in a closure variable and recompose
  // whenever a new one arrives.
  let lastAtlasView: GPUTextureView | undefined;
  let lastHiResView: GPUTextureView | undefined;
  let lastHiResSampler: GPUSampler | undefined;

  function composeAtlasBindGroup(): void {
    if (!lastAtlasView) return; // atlas not bound yet — keep no-op
    if (atlas?.hiResArray && !lastHiResView) return; // hi-res not bound yet

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: lastAtlasView },
      { binding: 2, resource: sampler! },
    ];
    if (atlas?.hiResArray) {
      entries.push(
        { binding: 3, resource: lastHiResView! },
        { binding: 4, resource: lastHiResSampler ?? defaultHiResSampler! },
      );
    }
    bindGroup = device.createBindGroup({
      label: `${label}-bg`,
      layout: bindGroupLayout,
      entries,
    });
  }

  function bindAtlas(atlasView: GPUTextureView): void {
    lastAtlasView = atlasView;
    composeAtlasBindGroup();
  }

  function bindHiResArray(arrayView: GPUTextureView, samplerOverride?: GPUSampler): void {
    lastHiResView = arrayView;
    // Unconditional assign: passing `undefined` resets to the default sampler at compose time.
    lastHiResSampler = samplerOverride;
    composeAtlasBindGroup();
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
    // The consumer has already packed `args.instanceCount *
    // FLOATS_PER_INSTANCE` floats into `args.instanceBytes`. We forward
    // the byte count exactly, not `instanceBytes.byteLength`, so an
    // oversized scratch buffer doesn't write past the end of the GPU
    // buffer.
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

  // Only expose `bindAtlas` when atlas was configured, and only
  // expose `bindHiResArray` when the hi-res-array opt-in is set.
  // Consumers that don't need a method never see it, which is both
  // clearer at the wrapper site and prevents accidental late-binding
  // of a binding the BGL doesn't declare.
  const renderer: InstancedQuadRenderer = atlas
    ? atlas.hiResArray
      ? { label: 'instancedQuadRenderer', bindAtlas, bindHiResArray, draw, destroy }
      : { label: 'instancedQuadRenderer', bindAtlas, draw, destroy }
    : { label: 'instancedQuadRenderer', draw, destroy };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
