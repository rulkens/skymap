/**
 * ScalarVolumeRenderer — multi-field, palette-driven, additive 3D
 * scalar-field volume renderer.  See the spec at
 * 'docs/superpowers/specs/2026-05-09-scalar-volume-renderer-design.md'.
 *
 * Public surface (factory shape, matching D.2 conventions):
 *
 *   - createScalarVolumeRenderer(device, format, fadeBgl, callbacks)
 *   - addField(handle, cube)        → upload cube to a 3D r16float
 *                                       texture, register in the field map
 *   - removeField(handle)            → drop the texture, unregister
 *   - setEnabled(handle, enabled)    → per-field draw gate
 *   - setIntensity(handle, intensity) → [0, 1]
 *   - hasActiveFields()              → true iff any registered+enabled
 *                                       field has intensity > 0; used by
 *                                       the renderer's pass to early-out
 *   - draw(pass, camera)             → dispatch one raymarch per active
 *                                       field, additively blended
 *   - destroy()                      → release all GPU resources
 *
 * Per-field state lives in a 'Map<handle, FieldEntry>'; each entry owns
 * its own 3D texture, palette LUT texture, bind group, uniform buffer,
 * and runtime tunables (enabled, intensity, model matrix, paletteId).
 * Sharing the pipeline across all fields keeps the layout-'auto' trap
 * from biting: one pipeline → one auto-derived bind-group layout → all
 * bind groups are interchangeable across fields with the same shape.
 *
 * Per-field palettes (rather than one renderer-wide LUT) let two
 * overlapping fields use different colour ramps so the user can
 * visually tell them apart.  'setFieldPalette(handle, id)' rewrites
 * that field's existing 1D texture in place via writeTexture; bind-group
 * texture views stay valid, so a palette change costs one queue write
 * and zero rebinds.
 */

import { mat4 } from 'gl-matrix';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { ScalarFieldFrameKind } from '../../../@types/data/ScalarFieldFrameKind';
import type { ScalarFieldPaletteId } from '../../../@types/data/ScalarFieldPaletteId';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ScalarFieldHandle } from '../../../@types/rendering/ScalarFieldHandle';
import type { ScalarVolumeRenderer } from '../../../@types/rendering/ScalarVolumeRenderer';
import type { FieldEntry } from '../../../@types/rendering/FieldEntry';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../data/scalarFieldPalettes';
import { SG_TO_EQ_MAT4_COL_MAJOR } from '../../../data/superGalacticTransform';
import vsCode from '../shaders/scalarVolume/vertex.wesl?static';
import fsCode from '../shaders/scalarVolume/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// 80 (cam) + 64 (model) + 64 (invModel) + 12 (camPos) + 4 (intensity)
// + 4 (densityScale) + 4 (contrast) + 4 (contrastCenter) + 4 (envelopeInner)
// + 4 (envelopeOuter) + 4 (exposure) + 4 (trim) + 4 (frame) = 256
// exactly.  The WGSL struct contains mat4x4 (alignment 16), so total
// must be a multiple of 16 — 256 lands cleanly.  Frame took the last
// reserved scratch slot (scratch[63]); the next per-field uniform will
// have to bump UNIFORM_BYTES to the next 16-byte boundary (272).
const UNIFORM_BYTES = 256;

// Temporal-seed wrap-around for the per-draw frame counter.  f32 has
// 24 bits of mantissa (~16M integers exact), so wrapping at 1e6
// leaves headroom for the multiply-by-irrational constants in the
// shader without losing precision in the hash input.  The eye can't
// detect a 1M-frame repeat at 60fps (~4.6 hours of continuous render).
const FRAME_WRAP = 1_000_000;

const CUBE_CORNERS = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  1, 1, 0,
  0, 0, 1,
  1, 0, 1,
  0, 1, 1,
  1, 1, 1,
]);

const CUBE_INDICES = new Uint16Array([
  // -z face (winding so normal points -z)
  0, 2, 1,  1, 2, 3,
  // +z face
  4, 5, 6,  5, 7, 6,
  // -y face
  0, 1, 4,  1, 5, 4,
  // +y face
  2, 6, 3,  3, 6, 7,
  // -x face
  0, 4, 2,  2, 4, 6,
  // +x face
  1, 3, 5,  3, 7, 5,
]);

// Supergalactic→equatorial rotation, J2000.  Imported directly from
// the canonical column-major export in `superGalacticTransform.ts`
// (composed from R_GAL_TO_EQ · R_SG_TO_GAL once at module init).
//
// Why import the canonical mat4 layout rather than reconstruct from
// the 3x3 here: every other path that maps SG → EQ in the codebase
// (cluster labels via `raDecDistToEqCart`, the SCFD header rotation
// quaternion, future renderers) flows through the same 3x3 → derived
// form.  Reconstruction in two places means two opportunities for
// the column-major-vs-row-major transcription to drift; centralising
// the layout decision in `superGalacticTransform.ts` makes drift
// impossible (the renderer never sees the 3x3 form, so it can't
// re-encode it incorrectly).  See that file's docstring on
// `SG_TO_EQ_MAT4_COL_MAJOR` for the rationale and the historical
// drift that prompted the consolidation.
//
// Cast: gl-matrix's `mat4` is `Float32Array(16)`, and `mat4.fromValues`
// expects 16 positional args.  `Float32Array.of(...readonly number[])`
// would work too, but `mat4.fromValues` makes the gl-matrix contract
// explicit at the call site.
const SG_TO_EQ_ROT = mat4.fromValues(
  SG_TO_EQ_MAT4_COL_MAJOR[0]!,  SG_TO_EQ_MAT4_COL_MAJOR[1]!,  SG_TO_EQ_MAT4_COL_MAJOR[2]!,  SG_TO_EQ_MAT4_COL_MAJOR[3]!,
  SG_TO_EQ_MAT4_COL_MAJOR[4]!,  SG_TO_EQ_MAT4_COL_MAJOR[5]!,  SG_TO_EQ_MAT4_COL_MAJOR[6]!,  SG_TO_EQ_MAT4_COL_MAJOR[7]!,
  SG_TO_EQ_MAT4_COL_MAJOR[8]!,  SG_TO_EQ_MAT4_COL_MAJOR[9]!,  SG_TO_EQ_MAT4_COL_MAJOR[10]!, SG_TO_EQ_MAT4_COL_MAJOR[11]!,
  SG_TO_EQ_MAT4_COL_MAJOR[12]!, SG_TO_EQ_MAT4_COL_MAJOR[13]!, SG_TO_EQ_MAT4_COL_MAJOR[14]!, SG_TO_EQ_MAT4_COL_MAJOR[15]!,
);

const FRAME_TO_WORLD: Record<ScalarFieldFrameKind, mat4> = {
  'supergalactic-cartesian': SG_TO_EQ_ROT,
  'equatorial-cartesian': mat4.create(),
  galactic: mat4.create(),
};

// ── Pure helper: model matrix builder ───────────────────────────────
//
// Maps the unit cube '[0,1]^3' (vertex shader's input space) to the
// cube's footprint in skymap world space.  Composition order, applied
// right-to-left to a unit-cube corner v:
//
//   1. scale  by (Nx*voxelSize, Ny*voxelSize, Nz*voxelSize) — unit cube
//      becomes its physical extent (e.g. [0, 1000]^3 for CF-4)
//   2. translate by the cube's origin in its native frame — shifts the
//      cube so its corner sits at `origin`, which for an observer-centered
//      cube means the cube's geometric centre lands at the native frame's
//      origin
//   3. rotate by the cube's per-cube quaternion — pivots around the
//      native frame's origin, which (after step 2) coincides with the
//      cube's centre.  Order matters: rotating BEFORE the translate
//      would pivot around the cube's corner instead and offset the
//      whole volume by `R*origin - origin` in the native frame.  The
//      synthetic cubes ship identity rotations, so the bug is invisible
//      there; CF-4 (with the SG→EQ quaternion) exposes it.
//   4. transform from the native frame into world space
//
// The function is exported (rather than locked inside the factory)
// because steps 1-3 are pure math worth unit-testing without standing
// up a GPU device.
export function buildCubeModelMatrix(cube: ScalarCube): mat4 {
  const out = mat4.create();
  mat4.copy(out, FRAME_TO_WORLD[cube.frameKind]);
  const rotMat = mat4.create();
  mat4.fromQuat(rotMat, [cube.rotation[0], cube.rotation[1], cube.rotation[2], cube.rotation[3]]);
  mat4.multiply(out, out, rotMat);
  mat4.translate(out, out, [cube.origin[0], cube.origin[1], cube.origin[2]]);
  const sx = cube.dims[0] * cube.voxelSize;
  const sy = cube.dims[1] * cube.voxelSize;
  const sz = cube.dims[2] * cube.voxelSize;
  mat4.scale(out, out, [sx, sy, sz]);
  return out;
}

// ── Factory ─────────────────────────────────────────────────────────

// FieldEntry type moved to @types/rendering/FieldEntry.d.ts.


export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  callbacks: {
    onFieldAdded: (handle: ScalarFieldHandle) => void;
    onFieldRemoved: (handle: ScalarFieldHandle) => void;
  },
): ScalarVolumeRenderer {
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
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
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
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
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
  // pipeline is the one passed to `createBindGroup` in `addField`.
  const bindGroupLayout = group0Bgl;

  // Fade scratch buffer hoisted to factory scope to avoid per-frame
  // ArrayBuffer allocation. One 16-byte buffer shared across all fields
  // per draw call (values are written and consumed synchronously within
  // one field's iteration step). Matches the closure-captured pattern
  // in pointRenderer and filamentRenderer.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  const fields = new Map<ScalarFieldHandle, FieldEntry>();
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

  // Per-field palette texture — created in `addField`, mutated in
  // `setFieldPalette` via the shared `writePaletteLut` helper.  A single
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

  const renderer: ScalarVolumeRenderer = {
    label: 'scalarVolumeRenderer',
    addField(handle, cube) {
      const existing = fields.get(handle);
      if (existing) {
        existing.volumeTexture.destroy();
        existing.paletteTexture.destroy();
        existing.uniformBuffer.destroy();
        existing.fadeBuffer.destroy();
        fields.delete(handle);
      }
      const modelMatrix = buildCubeModelMatrix(cube);
      const invModelMatrix = mat4.create();
      mat4.invert(invModelMatrix, modelMatrix);
      const volumeTexture = uploadCube(cube);
      const paletteTexture = createPaletteTexture();
      // Seed with the neutral fallback palette.  Callers immediately
      // overwrite via `setFieldPalette` using the per-handle entry
      // from the registry.  Hard-coding 'viridis' here keeps the
      // renderer self-contained — it doesn't know field ids, only
      // GPU resources.
      writePaletteLut(paletteTexture, 'viridis');
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
        label: `scalarVolume-fade-uniform-${handle}`,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const fadeBindGroup = device.createBindGroup({
        label: `scalarVolume-fade-bg-${handle}`,
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
      fields.set(handle, {
        handle,
        enabled: true,
        intensity: 0.5,
        // 1.0 is identity for the shader's contrast windowing (no
        // deadband, no stretching).  Real-world default is supplied
        // via setContrast() from the slot commit; this is the safe
        // placeholder before any UI / settings state has been
        // threaded in.
        contrast: 1.0,
        // Default to 0.5 (divergent / CF-4 behaviour); the slot
        // commit overwrites with the per-handle registry value via
        // `setContrastCenter` immediately after `addField` returns.
        contrastCenter: 0.5,
        // Match the palette seeded into `paletteTexture` above.  The
        // commit site (wireSlots) overwrites both via
        // `setFieldPalette` immediately after `addField` returns; the
        // pair just has to agree until that happens.
        paletteId: 'viridis',
        // SCFD v2 cubes are data-only — `densityScale` is no longer a
        // cube property.  Seed to identity (1.0); the slot commit
        // calls `setDensityScale` with the per-handle registry value
        // right after `addField` returns, so this default only matters
        // for the brief window before that — and for direct test calls
        // that don't go through slot wiring.
        densityScale: 1.0,
        // No envelope by default; the slot commit calls `setEnvelope`
        // immediately afterwards.  Sentinel `inner === outer >= √3`
        // pins the smoothstep at 1.0 — visually identical to "no
        // envelope" until the real values land.
        envelopeInner: 2.0,
        envelopeOuter: 2.0,
        // 1.0 = pre-HDR behaviour exactly preserved.  Slot commit
        // overwrites with the per-handle registry value via
        // `setExposure` immediately after `addField` returns.
        exposure: 1.0,
        // 0 = no trim (every voxel passes; contrast's implicit
        // deadband still applies if contrast > 1).  Slot commit
        // overwrites with persisted setting.
        trim: 0.0,
        modelMatrix,
        invModelMatrix,
        volumeTexture,
        paletteTexture,
        uniformBuffer,
        bindGroup,
        fadeBuffer,
        fadeBindGroup,
      });
      callbacks.onFieldAdded(handle);
    },
    removeField(handle) {
      const entry = fields.get(handle);
      if (!entry) return;
      // Fire the callback BEFORE destroying GPU resources so any
      // future callback body that needs to read the entry (debug log,
      // pre-destroy fade-out path, etc.) operates on a still-valid
      // entry. Today onFieldRemoved only calls fades.unregister, which
      // doesn't touch the renderer, but the order is the more
      // defensible default.
      callbacks.onFieldRemoved(handle);
      entry.volumeTexture.destroy();
      entry.paletteTexture.destroy();
      entry.uniformBuffer.destroy();
      entry.fadeBuffer.destroy();
      fields.delete(handle);
    },
    setEnabled(handle, enabled) {
      const entry = fields.get(handle);
      if (entry) entry.enabled = enabled;
    },
    setContrast(handle, contrast) {
      const entry = fields.get(handle);
      // Clamp away from zero so the shader's `1 / contrast` stays
      // well-defined.  Upper bound is generous (16x) because the
      // deadband saturates at 1 - 1/contrast = ~94% well before that
      // — the slider in VolumeFieldRow caps lower, but the API stays
      // permissive.
      if (entry) entry.contrast = Math.max(0.05, Math.min(16, contrast));
    },
    setContrastCenter(handle, center) {
      const entry = fields.get(handle);
      if (!entry) return;
      // Clamp to [0, 1].  The shader's `halfRange = max(center, 1-center)`
      // only makes sense inside that range; out-of-range values would
      // produce a non-monotonic dev metric and yield nonsense visuals
      // rather than a useful debug signal.  NaN clamps to the divergent
      // default (0.5) — never propagate non-finite values to the GPU.
      const c = Number.isFinite(center) ? center : 0.5;
      entry.contrastCenter = Math.max(0, Math.min(1, c));
    },
    setExposure(handle, value) {
      const entry = fields.get(handle);
      if (!entry) return;
      // Clamp negative / NaN to 0 (silent overlay).  Upper bound 32 is
      // generous; the tonemap downstream rolls off display brightness
      // before the user notices — values past ~10 mostly just push
      // more voxels into the saturation flat.
      const v = Number.isFinite(value) ? value : 1.0;
      entry.exposure = Math.max(0, Math.min(32, v));
    },
    setTrim(handle, value) {
      const entry = fields.get(handle);
      if (!entry) return;
      const v = Number.isFinite(value) ? value : 0.0;
      entry.trim = Math.max(0, Math.min(0.95, v));
    },
    setEnvelope(handle, inner, outer) {
      const entry = fields.get(handle);
      if (!entry) return;
      // Allow degenerate `inner >= outer` cases without crashing the
      // shader — `smoothstep` is defined for those (it degenerates to
      // a step function).  We do clamp non-finite inputs (NaN, ±Inf)
      // to a "no envelope" sentinel because passing those through to
      // the uniform would produce undefined sampling behaviour.
      entry.envelopeInner = Number.isFinite(inner) ? inner : 2.0;
      entry.envelopeOuter = Number.isFinite(outer) ? outer : 2.0;
    },
    setDensityScale(handle, value) {
      const entry = fields.get(handle);
      if (!entry) return;
      // Clamp negative / NaN to 0 (a silent overlay).  Why not throw or
      // clamp to a small positive epsilon: the alpha-integral inside
      // the fragment shader is `1 - exp(-densityScale * sample * step)`
      // — a negative densityScale would produce > 1 alpha and invert
      // the colour mapping, exactly the kind of subtle visual bug that
      // is hard to diagnose downstream.  Collapsing to 0 keeps the
      // overlay invisible until a sane value is set, matching the
      // forgiving pattern of `setIntensity` / `setContrast`.  Mutating
      // the entry only — the next `draw` call composes the uniform
      // buffer from the live entry, so no separate writeBuffer is
      // needed here (same shape as the sibling setters).
      entry.densityScale = Number.isFinite(value) && value > 0 ? value : 0;
    },
    setIntensity(handle, intensity) {
      const entry = fields.get(handle);
      if (entry) entry.intensity = Math.max(0, Math.min(1, intensity));
    },
    setFieldPalette(handle, id) {
      const entry = fields.get(handle);
      if (!entry) return;
      entry.paletteId = id;
      writePaletteLut(entry.paletteTexture, id);
    },
    getFieldPalette(handle) {
      return fields.get(handle)?.paletteId ?? null;
    },
    hasActiveFields(fadeOpacityOf) {
      for (const e of fields.values()) {
        if (e.intensity <= 0) continue;
        if (e.enabled) return true;
        // If a fade-out tail is in flight (enabled flipped false, but
        // opacity hasn't reached 0 yet) the field is still producing
        // visible pixels — keep upstream gates alive.
        if (fadeOpacityOf && fadeOpacityOf(e.handle) > 0) return true;
      }
      return false;
    },
    listHandles() {
      return Array.from(fields.keys());
    },
    __getFieldEntryForTest(handle) {
      // Test-only accessor; see the docblock on the type.  Returns the
      // live `FieldEntry` so unit tests can assert that setters mutated
      // CPU state without round-tripping through a mocked GPU queue.
      return fields.get(handle);
    },
    draw(pass, viewProj, viewportPx, cameraPosWorld, fadeOpacityOf) {
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
      // 220..223  intensity        (f32)
      // 224..227  densityScale     (f32)
      // 228..231  contrast         (f32)
      // 232..235  contrastCenter   (f32)
      // 236..239  envelopeInner    (f32)
      // 240..243  envelopeOuter    (f32)
      // 244..247  exposure         (f32)
      // 248..251  trim             (f32)
      // 252..255  frame            (f32; per-draw temporal seed for
      //                            the shader's jitter hash — wraps
      //                            at FRAME_WRAP, see top of file)
      const scratch = new Float32Array(UNIFORM_BYTES / 4);
      frame = (frame + 1) % FRAME_WRAP;
      for (const e of fields.values()) {
        // Skip iff the field is fully off — meaning user toggled it
        // disabled AND the fade-out tail has fully settled. While
        // opacity > 0 we keep drawing so the ~100 ms fade-out is
        // visible. e.intensity is the user's intensity slider; 0
        // there means "fully transparent regardless of fade", so we
        // skip the GPU work entirely.
        const opacity = fadeOpacityOf(e.handle);
        if ((!e.enabled && opacity <= 0) || e.intensity <= 0) continue;
        for (let i = 0; i < 16; i++) scratch[i] = viewProj[i] ?? 0;
        scratch[16] = viewportPx[0];
        scratch[17] = viewportPx[1];
        scratch[18] = 0;
        scratch[19] = 0;
        for (let i = 0; i < 16; i++) scratch[20 + i] = e.modelMatrix[i] ?? 0;
        for (let i = 0; i < 16; i++) scratch[36 + i] = e.invModelMatrix[i] ?? 0;
        scratch[52] = cameraPosWorld[0];
        scratch[53] = cameraPosWorld[1];
        scratch[54] = cameraPosWorld[2];
        scratch[55] = e.intensity;
        scratch[56] = e.densityScale;
        scratch[57] = e.contrast;
        scratch[58] = e.contrastCenter;
        scratch[59] = e.envelopeInner;
        scratch[60] = e.envelopeOuter;
        scratch[61] = e.exposure;
        scratch[62] = e.trim;
        scratch[63] = frame;
        device.queue.writeBuffer(e.uniformBuffer, 0, scratch);
        // Per-field fade.opacity write: read from the registry for this
        // field's handle, write into the 16-byte fadeBuffer.
        fadeScratchF32[0] = fadeOpacityOf(e.handle);
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
