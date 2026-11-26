/**
 * VolumeFieldRenderer — multi-field, palette-driven, additive 3D scalar-field raymarch (spec:
 * 'docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md'). `upload` takes a finished
 * `GpuVolume` and owns it from then on (AssetSlot's rule: a committed payload belongs to the
 * consumer); each field adds its palette LUT, bind groups, uniforms, matrices and statics. User
 * knobs are read per frame through `settingsOf`, never mirrored. The jitter index, step count and
 * blend weight `w` arrive per draw as `inputs`: this renderer holds no frame counter. Below w = 1
 * one decay triangle scales the target by (1 − w), then every field adds at w, so the target holds
 * a running mean. One shared march pipeline means one bind-group layout, so field bind groups are
 * interchangeable. A palette change rewrites the field's LUT in place (views stay valid).
 */

import { mat4 } from 'wgpu-matrix';
import type { ScalarFieldPaletteId } from '../../../../@types/data/volume/ScalarFieldPaletteId';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { VolumeFieldRenderer } from '../../../../@types/rendering/VolumeFieldRenderer';
import type { FieldEntry } from '../../../../@types/rendering/FieldEntry';
import type { VolumeFieldRendererDeps } from '../../../../@types/rendering/VolumeFieldRendererDeps';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../../data/volume/scalarFieldPalettes';
import { BLUE_NOISE_MASK_SLICES } from '../../../../data/volume/blueNoiseMask';
import vsCode from '../../shaders/scalarVolume/vertex.wesl?static';
import fsCode from '../../shaders/scalarVolume/fragment.wesl?static';
import decayVsCode from '../../shaders/scalarVolume/vertexDecay.wesl?static';
import decayFsCode from '../../shaders/scalarVolume/decayFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { buildCubeModelMatrix } from '../../../../utils/math/buildCubeModelMatrix';
import { writeCameraPrefix } from '../../lib/cameraUniforms';

// Fields through nativeBoxScale (300 B), rounded up to 16 for a uniform struct. Pinned against
// fragment.wesl by volumeUniformsLayout.parity.test.ts.
const UNIFORM_BYTES = 304;

// Caps `inputs.jitterIndex` (never wrapped upstream) so the integer survives the f32 uniform.
// A multiple of the mask's slice count, so the wrap never breaks the shader's slice cycle.
const JITTER_INDEX_WRAP = BLUE_NOISE_MASK_SLICES * 62_500;

// Each field's march adds in scaled by the pass's blend constant (`inputs.weight`); at 1 this
// sums exactly as ADDITIVE_BLEND. Single site, so it stays here (blendStates.ts's rule).
const WEIGHTED_ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' },
};

// Once per draw, never per field (that would fade the fields drawn before it). Single site too.
const DECAY_COMPONENT: GPUBlendComponent = {
  srcFactor: 'zero',
  dstFactor: 'one-minus-constant',
  operation: 'add',
};

const CUBE_CORNERS = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
]);

const CUBE_INDICES = new Uint16Array([
  // -z face (winding so normal points -z)
  0, 2, 1, 1, 2, 3,
  // +z face
  4, 5, 6, 5, 7, 6,
  // -y face
  0, 1, 4, 1, 5, 4,
  // +y face
  2, 6, 3, 3, 6, 7,
  // -x face
  0, 4, 2, 2, 4, 6,
  // +x face
  1, 3, 5, 3, 7, 5,
]);

// ── Factory ─────────────────────────────────────────────────────────

export function createVolumeFieldRenderer<Id extends string>({
  device,
  targetFormat,
  fadeBgl,
  jitterMask,
}: VolumeFieldRendererDeps): VolumeFieldRenderer<Id> {
  const jitterMaskView = jitterMask.createView();
  const cornerBuffer = device.createBuffer({
    size: CUBE_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, CUBE_CORNERS);

  const indexBuffer = device.createBuffer({
    size: CUBE_INDICES.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, CUBE_INDICES);

  const volumeSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const paletteSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scalarVolume.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scalarVolume.fragment');

  // @group(0) layout — pipeline-specific (uniform + 3D texture + sampler
  // + palette LUT 2D texture + sampler + jitter mask). Built from a manual BindGroupLayout
  // descriptor so the pipeline layout below can list it alongside the
  // canonical fadeBgl. The palette is an N x 1 2D texture rather than a
  // texture_1d — see createPaletteTexture and the shader binding for why.
  const group0Bgl = device.createBindGroupLayout({
    label: 'scalarVolume-bgl-group0',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'scalarVolume-pipeline-layout',
    bindGroupLayouts: [group0Bgl, fadeBgl],
  });

  const pipeline = device.createRenderPipeline({
    label: 'scalarVolume-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vsModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs_main',
      targets: [
        {
          format: targetFormat,
          blend: WEIGHTED_ADDITIVE_BLEND,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front', // ← back faces only; see fragment.wesl module header
    },
  });
  const decayPipeline = device.createRenderPipeline({
    label: 'scalarVolume-decay-pipeline',
    layout: device.createPipelineLayout({
      label: 'scalarVolume-decay-pipeline-layout',
      bindGroupLayouts: [],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, decayVsCode, 'scalarVolume.vertexDecay'),
      entryPoint: 'vs',
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, decayFsCode, 'scalarVolume.decayFragment'),
      entryPoint: 'fs',
      targets: [
        { format: targetFormat, blend: { color: DECAY_COMPONENT, alpha: DECAY_COMPONENT } },
      ],
    },
  });
  // The bind-group layout for @group(0). Derived from `group0Bgl` (the
  // manually-created layout) rather than `pipeline.getBindGroupLayout(0)` so
  // the layout identity is consistent: the same object used to build the
  // pipeline is the one passed to `createBindGroup` in `upload`.
  const bindGroupLayout = group0Bgl;

  // Fade scratch buffer hoisted to factory scope to avoid per-frame
  // ArrayBuffer allocation. One 16-byte buffer shared across all fields
  // per draw call (values are written and consumed synchronously within
  // one field's iteration step). Matches the closure-captured pattern
  // in galaxyPointRenderer and filamentRenderer.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  const fields = new Map<Id, FieldEntry>();

  // Per-field palette texture — created in `upload`, re-uploaded in
  // `draw` via the shared `writePaletteLut` helper when the live palette
  // setting diverges from `residentPaletteId`.  A single
  // PALETTE_LUT_SIZE x 1 2D texture per field is the natural cost since
  // each field uses its own colour ramp; bind groups reference the
  // texture's view, which stays valid across `writeTexture` calls.
  //
  // Stored as an N x 1 2D texture rather than a texture_1d: WGSL has no
  // textureSampleLevel overload for 1D textures, so the shader's
  // explicit-LOD palette lookup only compiles portably (iOS WebKit
  // included) against a 2D sampler. See the fragment shader's palette
  // binding for the full rationale.
  function createPaletteTexture(): GPUTexture {
    return device.createTexture({
      size: { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      // dimension defaults to '2d'; named to document the LUT-as-2D choice.
      dimension: '2d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }
  function writePaletteLut(tex: GPUTexture, id: ScalarFieldPaletteId): void {
    device.queue.writeTexture(
      { texture: tex },
      buildPaletteLut(id),
      { bytesPerRow: PALETTE_LUT_SIZE * 4 },
      { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
    );
  }

  const renderer: VolumeFieldRenderer<Id> = {
    label: 'volumeFieldRenderer',
    upload(id, volume, statics) {
      const existing = fields.get(id);
      if (existing) {
        existing.volume.texture.destroy();
        existing.paletteTexture.destroy();
        existing.uniformBuffer.destroy();
        existing.fadeBuffer.destroy();
        fields.delete(id);
      }
      // Per-cube STATIC presentation config is the caller's to supply —
      // this renderer names no registry, so it can't look defaults up
      // itself.  The user-tunable knobs (enabled, intensity, contrast,
      // densityScale, palette, trim, exposure) are NOT seeded here —
      // they live in the caller's settings and are read per frame in `draw`.
      const modelMatrix = buildCubeModelMatrix(volume.placement);
      const invModelMatrix = mat4.inverse(modelMatrix);
      const paletteTexture = createPaletteTexture();
      // Seed the resident LUT from the caller's static default so it
      // matches `residentPaletteId`; `draw` re-uploads in place if the
      // live setting later diverges.
      writePaletteLut(paletteTexture, statics.paletteId);
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: volume.texture.createView() },
          { binding: 2, resource: volumeSampler },
          { binding: 3, resource: paletteTexture.createView() },
          { binding: 4, resource: paletteSampler },
          { binding: 5, resource: jitterMaskView },
        ],
      });
      const fadeBuffer = device.createBuffer({
        label: `scalarVolume-fade-uniform-${id}`,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const fadeBindGroup = device.createBindGroup({
        label: `scalarVolume-fade-bg-${id}`,
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
      fields.set(id, {
        // Per-cube static config, taken from the caller's `statics` above.
        contrastCenter: statics.contrastCenter,
        envelopeInner: statics.envelope.inner,
        envelopeOuter: statics.envelope.outer,
        // GPU-residency fact: the palette id just written into
        // `paletteTexture`.  `draw` re-uploads the LUT when the live
        // setting diverges from this.
        residentPaletteId: statics.paletteId,
        modelMatrix,
        invModelMatrix,
        volume,
        paletteTexture,
        uniformBuffer,
        bindGroup,
        fadeBuffer,
        fadeBindGroup,
      });
    },
    unload(id) {
      const entry = fields.get(id);
      if (!entry) return;
      // The renderer is FadeRegistry-agnostic: it neither registers nor
      // unregisters fade identities. Core seeds every visibility identity at
      // boot, so a field's identity stays registered across upload/unload —
      // `unload` just releases this field's GPU resources.
      entry.volume.texture.destroy();
      entry.paletteTexture.destroy();
      entry.uniformBuffer.destroy();
      entry.fadeBuffer.destroy();
      fields.delete(id);
    },
    hasActiveFields(settingsOf, fadeOpacityOf) {
      for (const id of fields.keys()) {
        const s = settingsOf(id);
        if (s.intensity <= 0) continue;
        // Opacity is the SOLE visibility truth: a field is active iff its
        // resolved opacity is non-zero. The enabled toggle doesn't override
        // a zero — it only SEEDS the fade target through the visibility sync,
        // so an enabled field spatially faded to 0 (deep zoom) must not
        // burn a full raymarch. This one test also covers the fade-out
        // tail (toggle off, opacity still ramping down) for free: the tail
        // IS a non-zero opacity.
        if (fadeOpacityOf(id) > 0) return true;
      }
      return false;
    },
    draw(pass, viewProj, viewportPx, pxPerRad, cameraPosWorld, settingsOf, fadeOpacityOf, inputs) {
      // WebGPU's default blend constant is 0, which would erase every field.
      const w = inputs.weight;
      pass.setBlendConstant({ r: w, g: w, b: w, a: w });
      // At w = 1 (a restart) the executor has just cleared the target, so the decay is skipped.
      if (w < 1) {
        pass.setPipeline(decayPipeline);
        pass.draw(3);
      }
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      // Per-field uniform buffer layout (304 bytes; mat4 alignment):
      //   0..63   viewProj         (mat4x4 column-major, 16 floats)
      //  64..71   viewportPx       (vec2)
      //  72..75   pxPerRad
      //  76..79   _pad0
      //  80..143  modelMatrix      (mat4x4)
      // 144..207  invModelMatrix   (mat4x4)
      // 208..219  cameraPosWorld   (vec3)
      // 220..223  intensity        (f32; from settingsOf)
      // 224..227  densityScale     (f32; from settingsOf)
      // 228..231  contrast         (f32; from settingsOf)
      // 232..235  contrastCenter   (f32; per-cube static, from the entry)
      // 236..239  envelopeInner    (f32; per-cube static, from the entry)
      // 240..243  envelopeOuter    (f32; per-cube static, from the entry)
      // 244..247  exposure         (f32; from settingsOf)
      // 248..251  trim             (f32; from settingsOf)
      // 252..255  jitterIndex      (f32; inputs.jitterIndex, wrapped)
      // 256..259  steps            (f32; inputs.steps)
      // 260..263  gain             (f32; from the volume)
      // 264..267  maxLod           (f32; the volume's mipLevelCount − 1)
      // 268..271  baseVoxelMpc     (f32; the volume's placement.voxelSize)
      // 272..283  nativeBoxOffset  (vec3; 4 B pad after)
      // 288..299  nativeBoxScale   (vec3; 4 B pad to 304)
      const scratch = new Float32Array(UNIFORM_BYTES / 4);
      const jitterIndex = inputs.jitterIndex % JITTER_INDEX_WRAP;
      for (const [id, e] of fields.entries()) {
        const s = settingsOf(id);
        // Reactive palette: re-upload the LUT in place when the live
        // setting diverges from what's resident (the bind group
        // references the texture view, which stays valid across
        // writeTexture).  Palette is the one knob with a GPU side
        // effect, so it's handled here rather than packed into the
        // uniform.  This check runs BEFORE the skip gate below so that
        // residency stays in sync even for a disabled or zero-intensity
        // field whose palette changed while it was off — ensuring the
        // correct LUT is showing the moment the field is re-enabled.
        // Moving this block into the skip branch would introduce a
        // stale-LUT-on-re-enable bug.
        if (s.paletteId !== e.residentPaletteId) {
          writePaletteLut(e.paletteTexture, s.paletteId);
          e.residentPaletteId = s.paletteId;
        }
        // Skip iff the field resolves invisible: opacity is the sole
        // visibility truth (the enabled toggle only seeds the fade target via
        // the visibility sync — it never overrides a zero, so an enabled
        // field spatially faded to 0 at deep zoom skips its raymarch).
        // While opacity > 0 we keep drawing so the ~100 ms fade-out tail is
        // visible. A just-enabled field is skipped only for its first tick
        // (opacity still 0) — the in-flight fade wakes the loop, so the
        // fade-in proceeds without a stall. s.intensity is the user's
        // intensity slider; 0 there means "fully transparent regardless of
        // fade", so we skip the GPU work entirely.
        const opacity = fadeOpacityOf(id);
        if (opacity <= 0 || s.intensity <= 0) continue;
        writeCameraPrefix(scratch, viewProj, viewportPx, pxPerRad);
        // Explicit pad zeroing — the scratch is reused across the field
        // loop, so the pad can't rely on Float32Array zero-init.
        scratch[19] = 0;
        for (let i = 0; i < 16; i++) scratch[20 + i] = e.modelMatrix[i] ?? 0;
        for (let i = 0; i < 16; i++) scratch[36 + i] = e.invModelMatrix[i] ?? 0;
        scratch[52] = cameraPosWorld[0];
        scratch[53] = cameraPosWorld[1];
        scratch[54] = cameraPosWorld[2];
        scratch[55] = s.intensity;
        scratch[56] = s.densityScale;
        scratch[57] = s.contrast;
        scratch[58] = e.contrastCenter;
        scratch[59] = e.envelopeInner;
        scratch[60] = e.envelopeOuter;
        scratch[61] = s.exposure;
        scratch[62] = s.trim;
        scratch[63] = jitterIndex;
        scratch[64] = inputs.steps;
        scratch[65] = e.volume.gain;
        scratch[66] = e.volume.texture.mipLevelCount - 1;
        scratch[67] = e.volume.placement.voxelSize;
        scratch.set(e.volume.nativeBox.offset, 68);
        scratch.set(e.volume.nativeBox.scale, 72);
        device.queue.writeBuffer(e.uniformBuffer, 0, scratch);
        // Per-field fade.opacity write: the resolved opacity from the skip
        // gate above, written into the 16-byte fadeBuffer.
        fadeScratchF32[0] = opacity;
        device.queue.writeBuffer(e.fadeBuffer, 0, fadeScratchBuffer);
        pass.setBindGroup(0, e.bindGroup);
        pass.setBindGroup(1, e.fadeBindGroup);
        pass.drawIndexed(CUBE_INDICES.length);
      }
    },
    destroy() {
      for (const e of fields.values()) {
        e.volume.texture.destroy();
        e.paletteTexture.destroy();
        e.uniformBuffer.destroy();
        e.fadeBuffer.destroy();
      }
      fields.clear();
      cornerBuffer.destroy();
      indexBuffer.destroy();
    },
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
