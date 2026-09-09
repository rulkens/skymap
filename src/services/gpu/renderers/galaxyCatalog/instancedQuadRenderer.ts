/**
 * instancedQuadRenderer — shared factory for the three instanced-billboard
 * renderers in the thumbnail / impostor pass: textured quads, textured
 * 3D-oriented disks, and procedural 3D-oriented disks.
 *
 * ## What this owns
 *
 *   - The bind-group layout (built explicitly, NOT via 'layout: auto' —
 *     auto-derived layouts are pipeline-specific identities and bite
 *     hard once you try to share resources or build bind groups against
 *     the same shape from a different pipeline; see the
 *     'feedback_webgpu_auto_layout_trap' memory note)
 *   - The pipeline + pipeline layout
 *   - The 96-byte uniform buffer (its layout matches the shared
 *     'CameraUniforms' prefix — see the consumer-side files for the
 *     full byte map)
 *   - The instance vertex buffer's lifecycle (fixed-preallocated OR
 *     grow-on-demand depending on 'config.capacity')
 *   - Optional atlas texture + sampler bindings, late-bound via
 *     'bindAtlas' when present
 *
 * ## What consumers still own
 *
 *   - Their typed per-instance record ('ThumbnailInstance', 'DiskInstance',
 *     'ProceduralDiskInstance') and the serialization that packs it into
 *     a 16-float-per-instance 'Float32Array'. The third vec4's four floats
 *     mean different things for each consumer, so a single shared
 *     serializer would just be a typed dispatch.
 *   - Their public API surface. Each consumer factory returns its own
 *     type ('TexturedQuadRenderer' etc.) whose 'draw' takes its typed
 *     instance array and forwards a packed 'Float32Array' here.
 *
 * ## Capacity strategies
 *
 *   - 'fixed': preallocate one 'max * BYTES_PER_INSTANCE' vertex buffer at
 *     construction. Matches the textured renderers, whose engine-side
 *     filters cap the per-frame count at the atlas slot count (256).
 *     Over-capacity is a programming error in the engine; we don't
 *     truncate or guard.
 *   - 'grow': lazy first-allocation, regrow on overflow. Matches
 *     ProceduralDiskRenderer, whose per-frame count tracks the number
 *     of galaxies in the 8 px+ apparent-size band — that count grows
 *     unboundedly as the camera approaches a dense field, so a fixed
 *     cap would visually clip impostors mid-flythrough. Growth uses
 *     'max(requested, 64)' as the new capacity; the buffer is never
 *     shrunk because the same dense field tends to recur.
 *
 * ## Blend modes
 *
 * All three current consumers use ADDITIVE blend. Galaxy thumbnails,
 * textured disks, and procedural disks all carry EMISSIVE content
 * (a photograph or a procedural approximation of the galaxy's actual
 * light output), not opaque material occluding a background. Additive
 * blending lets overlapping impostors plus the Milky Way layer accumulate
 * naturally in the HDR target. Premultiplied OVER produces a fade-to-black
 * bug at thumbnail edges (the dark sky is sampled as black, not as alpha 0).
 *
 * The factory accepts an 'alpha' blend variant for forward compatibility
 * (e.g. a future opaque-material impostor) but no current consumer uses it.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { InstancedQuadConfig } from '../../../../@types/rendering/InstancedQuadConfig';
import type { InstancedQuadRenderer } from '../../../../@types/rendering/InstancedQuadRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/**
 * Per-instance vertex layout shared by all three consumers: four
 * 'float32x4' attributes at locations 0/1/2/3, totalling 64 bytes.
 * Exported so consumers can size their packed 'Float32Array' against
 * the same constant rather than rederiving it.
 *
 * Slot 3 ('vec4<f32>' at offset 48) carries the textured-disk consumer's
 * (hiResLayerIdx, hiResCrossfadeAlpha, _, _) tuple. Quad + procedural
 * consumers zero-fill it. A 'float32x2' attribute would have forced
 * those consumers into an awkward two-float-of-vec4 shape anyway;
 * keeping every consumer on a uniform 'vec4<f32>' stride is cleaner.
 * Slots 14, 15 are a free shelf for the next per-instance attribute.
 */
export const FLOATS_PER_INSTANCE = 16;
export const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * Uniform buffer size matching the 'CameraUniforms'-extended struct
 * shared across quads / disks / proceduralDisks. Byte layout:
 *
 *   bytes  0..63 : viewProj      mat4x4<f32>  (CameraUniforms.viewProj)
 *   bytes 64..71 : viewportPx    vec2<f32>    (CameraUniforms.viewportPx)
 *   bytes 72..79 : reserved pad  f32 × 2      (CameraUniforms reserved)
 *   bytes 80..91 : camPosWorld   vec3<f32>
 *   bytes 92..95 : pxPerRad      f32          (or padding for disks)
 *
 * The 'pxPerRad' slot is consumer-specific — TexturedQuadRenderer +
 * ProceduralDiskRenderer use it for pixel-radius computation; the
 * TexturedDiskRenderer leaves it as zero padding.
 */
export const UNIFORM_BYTES = 96;

export function createInstancedQuadRenderer(
  // Only the device is needed from the GPU context — the colour-target format
  // arrives through `config.targetFormat`, never off a `GpuContext.format`
  // (which is always the swap-chain format). Taking a bare device keeps that
  // separation legible and lets the disk wrappers forward their own target.
  device: GPUDevice,
  config: InstancedQuadConfig,
): InstancedQuadRenderer {
  const {
    label,
    vertexSource,
    fragmentSource,
    atlas,
    capacity,
    blend,
    targetFormat,
    focusBgl,
    uniformVisibility = GPUShaderStage.VERTEX,
    viewSlotCount = 1,
  } = config;

  // ── Bind group layout ──────────────────────────────────────────────
  //
  // Built explicitly (not via 'pipeline.getBindGroupLayout(0)') because
  // auto-derived layouts are pipeline-specific identities and can't be
  // shared across pipelines — see the WebGPU layout-auto trap memory note.
  // When 'atlas.hiResArray' is set, the layout appends a 'texture_2d_array'
  // + linear sampler at bindings 3 + 4 so the texturedDisk consumer can
  // sample full-resolution famous-galaxy tiles. Bindings must line up
  // with the WGSL @group/@binding decorations in the shader.
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

  // Additive: emissive pass — overlapping impostors accumulate naturally
  // in the HDR buffer. Alpha: standard premultiplied OVER, reserved for
  // opaque-material consumers (none today).
  const blendDescriptor: GPUBlendState =
    blend === 'additive'
      ? ADDITIVE_BLEND
      : // Straight-alpha OVER — the 'src-alpha' colour factor (NOT premultiplied
        // 'one') is load-bearing for the forward-compat opaque-material variant,
        // so this branch stays inline rather than folding into a shared OVER.
        {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        };

  const pipeline = device.createRenderPipeline({
    label: `${label}-pipeline`,
    layout: device.createPipelineLayout({
      label: `${label}-pipeline-layout`,
      // @group(0) per-renderer uniforms (+ optional atlas/hi-res bindings);
      // @group(1) the shared cluster-focus uniform. Unlike the points
      // pipeline (which carries fade@1 + source@2 and so parks focus at
      // @group(3)), the impostor pipelines have no intervening groups, so
      // focus sits at the first free slot.
      bindGroupLayouts: [bindGroupLayout, focusBgl],
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
            // Slot 3 carries the textured-disk hi-res LOD tuple
            // (hiResLayerIdx, hiResCrossfadeAlpha, 0, 0). Quad +
            // procedural consumers zero-fill it.
            { shaderLocation: 3, offset: 48, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: blendDescriptor }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // One `@group(0)` buffer per view slot (default 1 — see `viewSlotCount`'s
  // doc on `InstancedQuadConfig`). Slot 0 keeps the original `${label}-uniforms`
  // label so devtools output is unchanged for every consumer that never
  // multiplexes; only extra slots (TexturedDiskRenderer) get a `-slotN` suffix.
  const uniformBuffers: GPUBuffer[] = Array.from({ length: viewSlotCount }, (_, slot) =>
    device.createBuffer({
      label: slot === 0 ? `${label}-uniforms` : `${label}-uniforms-slot${slot}`,
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );

  // Bilinear + clamp-to-edge by default; consumers can override via
  // 'atlas.samplerDescriptor'.
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

  // Default sampler for the hi-res 'texture_2d_array' slot when the
  // consumer doesn't pass one to 'bindHiResArray'. Matches the atlas
  // sampler's filter characteristics so the low-to-hi-res crossfade
  // doesn't have one side artifacting harder than the other.
  const defaultHiResSampler = atlas?.hiResArray
    ? device.createSampler({
        label: `${label}-hires-sampler`,
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      })
    : undefined;

  // Without atlas: build the 1-binding bind group eagerly, one per view
  // slot. With atlas: leave every slot undefined until 'bindAtlas' is
  // called — 'draw' no-ops until then, which is the expected interim state
  // during engine startup before the atlas texture exists.
  const bindGroups: (GPUBindGroup | undefined)[] = new Array(viewSlotCount).fill(undefined);
  if (atlas === undefined) {
    for (let slot = 0; slot < viewSlotCount; slot++) {
      bindGroups[slot] = device.createBindGroup({
        label: slot === 0 ? `${label}-bg` : `${label}-bg-slot${slot}`,
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffers[slot]! } }],
      });
    }
  }

  // 'fixed': preallocated up front. 'grow': null until first non-empty
  // draw, then sized to 'max(instanceCount, 64)' and resized as needed.
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

  // Reusable uniform scratch — 96 bytes / 24 floats, rewritten per draw.
  // The CameraUniforms reserved pad slots at f32[18..19] MUST stay zero;
  // we explicitly zero them every draw rather than relying on
  // Float32Array's lazy-init guarantee surviving reuse.
  const uniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  // Late-bound resource handles. The bind group is composed once we
  // have all the resources the BGL declares: atlas view alone, or
  // atlas view + hi-res array view when 'atlas.hiResArray' is set.
  // The engine wires these up at different points in startup, so we
  // cache each in a closure variable and recompose whenever a new
  // one arrives.
  let lastAtlasView: GPUTextureView | undefined;
  let lastHiResView: GPUTextureView | undefined;
  let lastHiResSampler: GPUSampler | undefined;

  // Atlas + hi-res-array views are shared across every view slot (one atlas
  // texture, uploaded once); only the @group(0) uniform buffer differs per
  // slot. So recomposing on bind rebuilds all `viewSlotCount` bind groups,
  // each pairing the shared atlas resources with ITS OWN uniform buffer.
  function composeAtlasBindGroup(): void {
    if (!lastAtlasView) return; // atlas not bound yet — keep no-op
    if (atlas?.hiResArray && !lastHiResView) return; // hi-res not bound yet

    for (let slot = 0; slot < viewSlotCount; slot++) {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: uniformBuffers[slot]! } },
        { binding: 1, resource: lastAtlasView },
        { binding: 2, resource: sampler! },
      ];
      if (atlas?.hiResArray) {
        entries.push(
          { binding: 3, resource: lastHiResView! },
          { binding: 4, resource: lastHiResSampler ?? defaultHiResSampler! },
        );
      }
      bindGroups[slot] = device.createBindGroup({
        label: slot === 0 ? `${label}-bg` : `${label}-bg-slot${slot}`,
        layout: bindGroupLayout,
        entries,
      });
    }
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
    viewport: Vec2;
    instanceBytes: Float32Array;
    instanceCount: number;
    camPosWorld?: Readonly<Vec3>;
    pxPerRad?: number;
    /** Shared cluster-focus bind group (bound at @group(1)). Built once by
     *  the engine against the canonical focusBgl; the same group serves
     *  every impostor pipeline. */
    focusBindGroup: GPUBindGroup;
    /** Which @group(0) copy this call targets. Defaults to 0 — see
     *  `InstancedQuadConfig.viewSlotCount`'s doc. */
    viewSlot?: number;
  }): void {
    if (args.instanceCount === 0) return;
    const viewSlot = args.viewSlot ?? 0;
    const bindGroup = bindGroups[viewSlot];
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

    // Pack uniforms:
    //   f32[ 0..15] viewProj         (CameraUniforms.viewProj)
    //   f32[16..17] viewport         (CameraUniforms.viewportPx)
    //   f32[18..19] reserved pad     (must stay zero)
    //   f32[20..22] camPosWorld
    //   f32[23]     pxPerRad
    writeCameraPrefix(uniformScratch, args.viewProj, args.viewport);
    // Explicit pad zeroing — this scratch is reused across frames, so the
    // pads can't rely on zero-init the way a fresh Float32Array can.
    uniformScratch[18] = 0;
    uniformScratch[19] = 0;
    uniformScratch[20] = args.camPosWorld?.[0] ?? 0;
    uniformScratch[21] = args.camPosWorld?.[1] ?? 0;
    uniformScratch[22] = args.camPosWorld?.[2] ?? 0;
    uniformScratch[23] = args.pxPerRad ?? 0;
    // THIS call's own slot's buffer — a sky-cubemap capture sweep's several
    // `draw()` calls (different faces, one submit) each carry a different
    // viewProj/viewport/camPos, so a shared buffer would keep only the last
    // call's bytes at submit time (see `InstancedQuadConfig.viewSlotCount`'s
    // doc / docs/RENDERER.md landmine #1).
    device.queue.writeBuffer(uniformBuffers[viewSlot]!, 0, uniformScratch);

    // Forward the exact byte count, not 'instanceBytes.byteLength' —
    // an oversized consumer scratch buffer must not write past the
    // end of the GPU buffer.
    device.queue.writeBuffer(
      instanceBuffer!,
      0,
      args.instanceBytes.buffer,
      args.instanceBytes.byteOffset,
      args.instanceCount * BYTES_PER_INSTANCE,
    );

    args.pass.setPipeline(pipeline);
    args.pass.setBindGroup(0, bindGroup);
    args.pass.setBindGroup(1, args.focusBindGroup);
    args.pass.setVertexBuffer(0, instanceBuffer!);
    args.pass.draw(6, args.instanceCount, 0, 0);
  }

  function destroy(): void {
    for (const buffer of uniformBuffers) buffer.destroy();
    instanceBuffer?.destroy();
    instanceBuffer = null;
  }

  // Only expose 'bindAtlas' when atlas was configured, and only expose
  // 'bindHiResArray' when the hi-res-array opt-in is set. Consumers that
  // don't need a method never see it, preventing accidental late-binding
  // of a binding the BGL doesn't declare.
  const renderer: InstancedQuadRenderer = atlas
    ? atlas.hiResArray
      ? { label: 'instancedQuadRenderer', bindAtlas, bindHiResArray, draw, destroy }
      : { label: 'instancedQuadRenderer', bindAtlas, draw, destroy }
    : { label: 'instancedQuadRenderer', draw, destroy };
  // 'satisfies Renderer' confirms the shared label+destroy contract
  // without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
