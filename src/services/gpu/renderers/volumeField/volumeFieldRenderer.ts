/**
 * VolumeFieldRenderer — multi-field, palette-driven, additive 3D
 * scalar-field volume renderer.  See the spec at
 * 'docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md'.
 *
 * Public surface (factory shape, matching D.2 conventions):
 *
 *   - createVolumeFieldRenderer(device, targetFormat, fadeBgl)
 *   - upload(id, cube)            → upload cube to a 3D r16float
 *                                       texture, read the per-cube static
 *                                       config from the registry, register
 *                                       in the field map
 *   - unload(id)                → drop the texture, unregister
 *   - hasActiveFields(settingsOf)    → true iff any field whose live
 *                                       settings are enabled+intensity>0
 *                                       (or still fading out); used by the
 *                                       renderer's pass to early-out
 *   - draw(pass, camera, settingsOf, fadeOpacityOf)
 *                                    → dispatch one raymarch per active
 *                                       field, additively blended; reads
 *                                       the per-field user tunables each
 *                                       frame from `settingsOf` and
 *                                       re-uploads a field's palette LUT
 *                                       in place when it diverges from
 *                                       what's resident
 *   - destroy()                      → release all GPU resources
 *
 * Per-field state lives in a 'Map<id, FieldEntry>'; each entry owns
 * its own 3D texture, palette LUT texture, bind group, uniform buffer,
 * the cube's matrices, and the per-cube STATIC presentation config
 * (contrastCenter, envelope) + a `residentPaletteId` GPU-residency fact.
 * The user-tunable knobs (enabled, intensity, contrast, densityScale,
 * palette, trim, exposure) are NOT mirrored on the entry — they live in
 * 'state.settings.volumes.items' and are read per frame in 'draw' via
 * the 'settingsOf' projection, so there is exactly one source of truth.
 * Sharing the pipeline across all fields keeps the layout-'auto' trap
 * from biting: one pipeline → one auto-derived bind-group layout → all
 * bind groups are interchangeable across fields with the same shape.
 *
 * Per-field palettes (rather than one renderer-wide LUT) let two
 * overlapping fields use different colour ramps so the user can
 * visually tell them apart.  When a field's settings palette diverges
 * from 'residentPaletteId', 'draw' rewrites that field's existing 1D
 * texture in place via writeTexture; bind-group texture views stay
 * valid, so a palette change costs one queue write and zero rebinds.
 */

import { mat4 } from 'wgpu-matrix';
import type { ScalarCube } from '../../../../@types/data/volume/ScalarCube';
import type { ScalarFieldPaletteId } from '../../../../@types/data/volume/ScalarFieldPaletteId';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { VolumeFieldRenderer } from '../../../../@types/rendering/VolumeFieldRenderer';
import type { FieldEntry } from '../../../../@types/rendering/FieldEntry';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { VolumeFieldId } from '../../../../@types/data/volume/VolumeFieldId';
import { getVolumeFieldDefaults } from '../../../../data/volume/volumeFieldDefaults';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../../data/volume/scalarFieldPalettes';
import vsCode from '../../shaders/scalarVolume/vertex.wesl?static';
import fsCode from '../../shaders/scalarVolume/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { buildCubeModelMatrix } from '../../../../utils/math/buildCubeModelMatrix';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

// 80 (cam) + 64 (model) + 64 (invModel) + 12 (camPos) + 4 (intensity)
// + 4 (densityScale) + 4 (contrast) + 4 (contrastCenter) + 4 (envelopeInner)
// + 4 (envelopeOuter) + 4 (exposure) + 4 (trim) + 4 (frame) = 256
// exactly.  The WGSL struct contains mat4x4 (alignment 16), so total
// must be a multiple of 16 — 256 lands cleanly.  Frame occupies the
// last scratch slot (scratch[63]); the next per-field uniform will
// have to bump UNIFORM_BYTES to the next 16-byte boundary (272).
const UNIFORM_BYTES = 256;

// Temporal-seed wrap-around for the per-draw frame counter.  f32 has
// 24 bits of mantissa (~16M integers exact), so wrapping at 1e6
// leaves headroom for the multiply-by-irrational constants in the
// shader without losing precision in the hash input.  The eye can't
// detect a 1M-frame repeat at 60fps (~4.6 hours of continuous render).
const FRAME_WRAP = 1_000_000;

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

export function createVolumeFieldRenderer(
  device: GPUDevice,
  // The colour-target format the raymarch pipeline writes into — the HDR
  // offscreen (`'rgba16float'`), NOT the swap chain. Handed over explicitly
  // (never read off a `GpuContext.format`, which is always the swap format).
  targetFormat: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): VolumeFieldRenderer {
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
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const paletteSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'scalarVolume.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'scalarVolume.fragment');

  // @group(0) layout — pipeline-specific (uniform + 3D texture + sampler
  // + palette LUT 2D texture + sampler). Built from a manual BindGroupLayout
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
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front', // ← back faces only; see fragment.wesl module header
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

  const fields = new Map<VolumeFieldId, FieldEntry>();
  // Per-draw frame counter — incremented every draw() and forwarded to
  // the fragment shader as a temporal seed for the ray-march jitter
  // hash.  Wrapping at FRAME_WRAP keeps the f32 mantissa precise
  // through the shader's irrational-constant multiplies.
  let frame = 0;

  function uploadCube(cube: ScalarCube): GPUTexture {
    const tex = device.createTexture({
      size: { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
      format: 'r16float',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      cube.voxels,
      { bytesPerRow: cube.dims[0] * 2, rowsPerImage: cube.dims[1] },
      { width: cube.dims[0], height: cube.dims[1], depthOrArrayLayers: cube.dims[2] },
    );
    return tex;
  }

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
      // dimension defaults to '2d'; named explicitly for symmetry with the
      // '3d' volume texture above and to document the LUT-as-2D choice.
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

  const renderer: VolumeFieldRenderer = {
    label: 'volumeFieldRenderer',
    upload(id, cube) {
      const existing = fields.get(id);
      if (existing) {
        existing.volumeTexture.destroy();
        existing.paletteTexture.destroy();
        existing.uniformBuffer.destroy();
        existing.fadeBuffer.destroy();
        fields.delete(id);
      }
      // Per-cube STATIC presentation config read once from the registry.
      // The id is a `VolumeFieldId` (the registry-derived field union),
      // so the lookup needs no cast.  The user-tunable knobs (enabled,
      // intensity, contrast, densityScale, palette, trim, exposure) are NOT
      // seeded here — they live in settings and are read per frame in `draw`.
      const defaults = getVolumeFieldDefaults(id);
      const modelMatrix = buildCubeModelMatrix(cube);
      const invModelMatrix = mat4.inverse(modelMatrix);
      const volumeTexture = uploadCube(cube);
      const paletteTexture = createPaletteTexture();
      // Seed the resident LUT from the registry default so it matches
      // `residentPaletteId`; `draw` re-uploads in place if the live
      // setting later diverges.
      writePaletteLut(paletteTexture, defaults.paletteId);
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: volumeTexture.createView() },
          { binding: 2, resource: volumeSampler },
          { binding: 3, resource: paletteTexture.createView() },
          { binding: 4, resource: paletteSampler },
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
        id,
        // Per-cube static config, read once from the registry above.
        contrastCenter: defaults.contrastCenter,
        envelopeInner: defaults.envelope.inner,
        envelopeOuter: defaults.envelope.outer,
        // GPU-residency fact: the palette id just written into
        // `paletteTexture`.  `draw` re-uploads the LUT when the live
        // setting diverges from this.
        residentPaletteId: defaults.paletteId,
        modelMatrix,
        invModelMatrix,
        volumeTexture,
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
      // unregisters fade handles. The fade-ownership manifest (`seedFades`)
      // owns the whole volume-field handle set at construction, so a field's
      // handle stays registered across upload/unload — `unload` just releases
      // this field's GPU resources.
      entry.volumeTexture.destroy();
      entry.paletteTexture.destroy();
      entry.uniformBuffer.destroy();
      entry.fadeBuffer.destroy();
      fields.delete(id);
    },
    hasActiveFields(settingsOf, fadeOpacityOf) {
      for (const e of fields.values()) {
        const s = settingsOf(e.id);
        if (!s) continue;
        if (s.intensity <= 0) continue;
        // Opacity is the SOLE visibility truth: a field is active iff its
        // resolved opacity is non-zero. The enabled toggle doesn't override
        // a zero — it only SEEDS fade intent through the visibility bridge,
        // so an enabled field spatially faded to 0 (deep zoom) must not
        // burn a full raymarch. This one test also covers the fade-out
        // tail (toggle off, opacity still ramping down) for free: the tail
        // IS a non-zero opacity.
        if ((fadeOpacityOf ? fadeOpacityOf(e.id) : 1) > 0) return true;
      }
      return false;
    },
    listIds() {
      return Array.from(fields.keys());
    },
    draw(pass, viewProj, viewportPx, cameraPosWorld, settingsOf, fadeOpacityOf) {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      // Per-field uniform buffer layout (256 bytes; mat4 alignment):
      //   0..63   viewProj         (mat4x4 column-major, 16 floats)
      //  64..71   viewportPx       (vec2)
      //  72..79   _pad0, _pad1
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
      // 252..255  frame            (f32; per-draw temporal seed for
      //                            the shader's jitter hash — wraps
      //                            at FRAME_WRAP, see top of file)
      // The byte offsets are fixed; intensity/densityScale/contrast/
      // exposure/trim come from `settingsOf` per frame, while
      // contrastCenter and the envelope edges are per-cube static on
      // the entry.
      const scratch = new Float32Array(UNIFORM_BYTES / 4);
      frame = (frame + 1) % FRAME_WRAP;
      for (const e of fields.values()) {
        const s = settingsOf(e.id);
        // No live settings row (e.g. a removed field with a late-firing
        // callback) → nothing to draw for this field.
        if (!s) continue;
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
        // visibility truth (the enabled toggle only seeds fade intent via
        // the visibility bridge — it never overrides a zero, so an enabled
        // field spatially faded to 0 at deep zoom skips its raymarch).
        // While opacity > 0 we keep drawing so the ~100 ms fade-out tail is
        // visible. A just-enabled field is skipped only for its first tick
        // (opacity still 0) — the in-flight fade wakes the loop, so the
        // fade-in proceeds without a stall. s.intensity is the user's
        // intensity slider; 0 there means "fully transparent regardless of
        // fade", so we skip the GPU work entirely.
        const opacity = fadeOpacityOf(e.id);
        if (opacity <= 0 || s.intensity <= 0) continue;
        writeCameraPrefix(scratch, viewProj, viewportPx);
        // Explicit pad zeroing — the scratch is reused across the field
        // loop, so the pads can't rely on Float32Array zero-init.
        scratch[18] = 0;
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
        scratch[63] = frame;
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
        e.volumeTexture.destroy();
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
