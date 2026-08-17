/**
 * zoneOfAvoidanceRenderer — translucent galactic-plane dust-band guide,
 * drawn as an analytic ray-marched shell (same family as
 * `horizonShellRenderer`): the fragment stage intersects a per-pixel view
 * ray with geometry analytically, so the band reads correctly from every
 * camera position/distance without a proxy mesh. A second pipeline
 * (`drawLabels`) draws the curved "Zone of Avoidance" lettering, built
 * once at construction. Byte layouts: `shaders/zoneOfAvoidance/io.wesl`
 * (band) and `label/io.wesl` (lettering) are authoritative.
 */

import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from '../../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../utils/camera/frameUp';
import vsCode from '../../shaders/zoneOfAvoidance/vertex.wesl?static';
import fsCode from '../../shaders/zoneOfAvoidance/fragment.wesl?static';
import fsPickCode from '../../shaders/zoneOfAvoidance/fragmentPick.wesl?static';
import labelVsCode from '../../shaders/zoneOfAvoidance/label/vertex.wesl?static';
import labelFsCode from '../../shaders/zoneOfAvoidance/label/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { layoutLabel } from '../../labelLayout/labelLayout';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { ATLAS_FONT_SIZE, FONT_IDS } from '../../../../data/fonts';
import { Source } from '../../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import {
  ZONE_OF_AVOIDANCE_LABEL_TEXT,
  ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT,
} from '../../../../data/zoneOfAvoidance/zoneOfAvoidanceLabelText';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { ZoneOfAvoidanceRenderer } from '../../../../@types/rendering/ZoneOfAvoidanceRenderer';
import type { ZoneOfAvoidanceTuning } from '../../../../@types/settings/ZoneOfAvoidanceTuning';
import type { OrbitCamera } from '../../../../@types/camera/OrbitCamera';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { LoadedFontAtlases } from '../../../../@types/rendering/LoadedFontAtlases';

/** On-the-wire uniform-buffer size; must match the WESL `Uniforms` struct. */
export const ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE = 112;

/** On-the-wire label uniform-buffer size; must match `label/io.wesl`'s `Uniforms`. */
export const ZONE_OF_AVOIDANCE_LABEL_UNIFORM_BUFFER_SIZE = 112;

/**
 * Physical em-height of the curved lettering, in Mpc — a fixed real-world
 * size (like a giant sign at `labelRadiusMpc`), so its ANGULAR size (and
 * hence on-screen legibility) scales inversely with `labelRadiusMpc` the
 * same way any physical object would. Visual-checkpoint placeholder, tuned
 * alongside `LABEL_RADIUS_MPC` in `zoneOfAvoidanceLayer.ts` — at that
 * layer's placeholder radius this gives ~2.9° letter height and ~27° label
 * width, comfortably inside the 120° gap between the 3 repeats.
 */
const LABEL_EM_MPC = 2;

/** Per-glyph instance stride: localOffset(8) + localSize(8) + uvRect(16) + galacticLonRad(4). */
const LABEL_GLYPH_INSTANCE_BYTES = 36;

export function createZoneOfAvoidanceRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  atlases: LoadedFontAtlases,
): ZoneOfAvoidanceRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'zoneOfAvoidance.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'zoneOfAvoidance.fragment');

  const uniformBuffer = device.createBuffer({
    label: 'zoneOfAvoidance-uniform-buffer',
    size: ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'zoneOfAvoidance-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: 'zoneOfAvoidance-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipeline = device.createRenderPipeline({
    label: 'zoneOfAvoidance-pipeline',
    layout: device.createPipelineLayout({
      label: 'zoneOfAvoidance-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Pure additive — the band is emissive dust glow, contributing
          // light only where the latitude/radial masks are non-zero.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    // No depth test: the band draws into the depthless HDR target, same
    // profile as horizonShell / filaments / every other additive overlay.
  });

  // ── Pick pipeline ───────────────────────────────────────────────────
  //
  // group(0) is never bound by this renderer, and no stage of the pick
  // pipeline reads it — it's the COSMO pick pass's shared point-pick camera
  // prefix, already bound by the time `drawPick` runs (see
  // `ContentLayer.drawPick`'s postcondition). This BGL only exists so the
  // pipeline layout is structurally compatible with it.
  const pickCameraBgl = device.createBindGroupLayout({
    label: 'zoneOfAvoidance-pick-camera-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const pickFsModule = createShaderModuleWithDevLog(
    device,
    fsPickCode,
    'zoneOfAvoidance.fragmentPick',
  );
  const pickPipeline = device.createRenderPipeline({
    label: 'zoneOfAvoidance-pick-pipeline',
    layout: device.createPipelineLayout({
      label: 'zoneOfAvoidance-pick-pipeline-layout',
      // `bindGroupLayout` is the SAME BGL `draw` binds at group(0), landing
      // at group(1) here.
      bindGroupLayouts: [pickCameraBgl, bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: pickFsModule,
      entryPoint: 'fsPick',
      // Integer target: no blend key (r32uint doesn't support blending).
      targets: [{ format: 'r32uint' }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      // COSMO's convention (slabs.ts) is non-reversed depth.
      depthCompare: resolveDepthCompare('nearer', false),
    },
  });

  // The band's pick identity never changes across its lifetime — write it
  // once directly into the shared uniform scratch below (see `packedId`'s
  // offset in io.wesl's byte table), rather than every `writeUniforms` call.
  const packedId = packSelection(Source.ZoneOfAvoidance, 0) + PICK_SENTINEL_OFFSET;

  // ── Curved-lettering pipeline ("Zone of Avoidance" glyphs) ────────────
  //
  // A single font (`FONT_IDS[0]`) — unlike `labelRenderer`, this pass has
  // no per-label font choice, so the atlas binds as a plain `texture_2d`
  // rather than a `texture_2d_array`. Reuses `atlases` (loaded once by
  // `initGpu.ts`'s `loadFontAtlases()` call) rather than fetching a second
  // copy.
  const labelFontId = FONT_IDS[0]!;
  const labelMetrics = atlases.metricsByFont[labelFontId];
  const labelBitmap = atlases.bitmaps[0];

  const labelUniformBuffer = device.createBuffer({
    label: 'zoneOfAvoidance-label-uniform-buffer',
    size: ZONE_OF_AVOIDANCE_LABEL_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const labelBindGroupLayout = device.createBindGroupLayout({
    label: 'zoneOfAvoidance-label-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const labelVsModule = createShaderModuleWithDevLog(
    device,
    labelVsCode,
    'zoneOfAvoidance.label.vertex',
  );
  const labelFsModule = createShaderModuleWithDevLog(
    device,
    labelFsCode,
    'zoneOfAvoidance.label.fragment',
  );

  const labelPipeline = device.createRenderPipeline({
    label: 'zoneOfAvoidance-label-pipeline',
    layout: device.createPipelineLayout({
      label: 'zoneOfAvoidance-label-pipeline-layout',
      bindGroupLayouts: [labelBindGroupLayout],
    }),
    vertex: {
      module: labelVsModule,
      entryPoint: 'vs',
      buffers: [
        // Slot 0: static unit-corner quad, shared with labelRenderer/markerLine/debugLine.
        UNIT_QUAD_VERTEX_LAYOUT,
        // Slot 1: per-glyph instance data, built once at construction (see below).
        {
          arrayStride: LABEL_GLYPH_INSTANCE_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x2' }, // localOffset
            { shaderLocation: 2, offset: 8, format: 'float32x2' }, // localSize
            { shaderLocation: 3, offset: 16, format: 'float32x4' }, // uvRect
            { shaderLocation: 4, offset: 32, format: 'float32' }, // galacticLonRad
          ],
        },
      ],
    },
    fragment: {
      module: labelFsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Additive, not premultiplied OVER — see label/fragment.wesl's
          // header for why (the documented OVER/HDR coherency landmine).
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-strip' },
    // No depth test, same depthless HDR target as the band pipeline above.
  });

  const labelCornerBuffer = device.createBuffer({
    label: 'zoneOfAvoidance-label-corners',
    size: UNIT_QUAD_STRIP_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(labelCornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

  // Glyph-instance buffer: built ONCE here from layoutLabel, never rebuilt —
  // the text and repeat count are compile-time constants, so there is no
  // per-frame CPU work beyond the small uniform write in `drawLabels`.
  // localOffset/localSize are baked from atlas px to world-Mpc via
  // LABEL_EM_MPC (the same worldEmMpc idea labels/io.wesl documents,
  // resolved once here instead of per-frame). 'center'/'center' alignment
  // centres each repeat's pen origin at (0, 0), so `galacticLonRad` alone
  // (no extra per-glyph shift) is each repeat's base longitude — see
  // label/vertex.wesl for how the pen offset folds in.
  const mpcPerAtlasPx = LABEL_EM_MPC / ATLAS_FONT_SIZE;
  const glyphQuads = layoutLabel(ZONE_OF_AVOIDANCE_LABEL_TEXT, labelMetrics, 'center', 'center');
  const labelGlyphCount = glyphQuads.length * ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT;
  const labelGlyphBuf = new ArrayBuffer(Math.max(labelGlyphCount, 1) * LABEL_GLYPH_INSTANCE_BYTES);
  const labelGlyphF32 = new Float32Array(labelGlyphBuf);
  {
    let i = 0;
    for (let rep = 0; rep < ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT; rep++) {
      const galacticLonRad = (rep * 2 * Math.PI) / ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT;
      for (const q of glyphQuads) {
        const base = i * (LABEL_GLYPH_INSTANCE_BYTES / 4);
        labelGlyphF32[base + 0] = q.localOffsetX * mpcPerAtlasPx;
        labelGlyphF32[base + 1] = q.localOffsetY * mpcPerAtlasPx;
        labelGlyphF32[base + 2] = q.localSizeW * mpcPerAtlasPx;
        labelGlyphF32[base + 3] = q.localSizeH * mpcPerAtlasPx;
        labelGlyphF32[base + 4] = q.uvU0;
        labelGlyphF32[base + 5] = q.uvV0;
        labelGlyphF32[base + 6] = q.uvU1;
        labelGlyphF32[base + 7] = q.uvV1;
        labelGlyphF32[base + 8] = galacticLonRad;
        i++;
      }
    }
  }
  const labelInstanceBuffer = device.createBuffer({
    label: 'zoneOfAvoidance-label-instances',
    size: labelGlyphBuf.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(labelInstanceBuffer, 0, labelGlyphBuf);

  // Atlas texture: one font, one layer — `rgba8unorm`, no mipmaps (MSDF
  // handles multi-scale rendering itself; see labelRenderer.ts's header).
  const labelAtlasTexture = device.createTexture({
    label: 'zoneOfAvoidance-label-atlas',
    size: [labelMetrics.atlas.width, labelMetrics.atlas.height, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  if (labelBitmap != null) {
    device.queue.copyExternalImageToTexture(
      { source: labelBitmap },
      { texture: labelAtlasTexture },
      [labelMetrics.atlas.width, labelMetrics.atlas.height],
    );
  }
  const labelSampler = device.createSampler({
    label: 'zoneOfAvoidance-label-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const labelBindGroup = device.createBindGroup({
    label: 'zoneOfAvoidance-label-bg',
    layout: labelBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: labelUniformBuffer } },
      { binding: 1, resource: labelAtlasTexture.createView() },
      { binding: 2, resource: labelSampler },
    ],
  });

  // Per-frame label uniform scratch (112 bytes), allocated once.
  const labelUniforms = new Float32Array(ZONE_OF_AVOIDANCE_LABEL_UNIFORM_BUFFER_SIZE / 4);

  // Per-frame scratch, allocated once to avoid GC churn.
  const uniforms = new ArrayBuffer(ZONE_OF_AVOIDANCE_UNIFORM_BUFFER_SIZE);
  const f32 = new Float32Array(uniforms);
  // packedId (float-index 25, u32) is written ONCE below and never touched
  // by writeUniforms — the packed identity never changes across frames.
  new Uint32Array(uniforms)[25] = packedId;
  // Plain Vec3 tuples (not vec3.create's Float32Array) so the per-component
  // reads below index cleanly under noUncheckedIndexedAccess.  wgpu-matrix
  // writes into them in place via the `dst` arg just the same.
  const fwd: Vec3 = [0, 0, 0];
  // Frame-pole reference up, allocated once and rewritten in place each frame.
  const upRefScratch: Vec3 = [0, 0, 0];
  // Roll-adjusted screen basis, allocated once and rewritten in place each
  // frame by `imagePlaneBasis` via its `out` argument.
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

  // Shared by `draw` and `drawPick`: both need the identical camera-basis +
  // shape uniforms (the pick fragment reruns the same alpha computation to
  // decide whether a fragment is even hit-testable), so the byte-packing
  // has one home. Uploads the whole buffer, including the packedId slot
  // written once above.
  function writeUniforms(
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void {
    // ── Camera basis (matches gl-matrix lookAt in computeViewProj) ────
    // Same derivation as horizonShellRenderer.draw — see that file's
    // header for the full rationale (rolled frame-pole basis so this
    // shell's rays agree with computeViewProj's).
    vec3.subtract(cam.target, cam.position, fwd);
    vec3.normalize(fwd, fwd);
    imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, upRefScratch), basis);
    const right = basis.right;
    const up = basis.up;

    const aspect = viewport[1] > 0 ? viewport[0] / viewport[1] : cam.aspect;
    const tanHalfFovY = Math.tan(cam.fovYRad / 2);
    // The tuning knob is a normalised [0, 1] fraction of the shell's radial
    // span (see the type + io.wesl's byte table); the shader's
    // exponential distance-decay term wants an absolute Mpc e-folding
    // length, so convert here — the ONE place this currency change happens,
    // rather than splitting the multiply across the shader (which would
    // leave the uniform holding a value with no name of its own).
    const radialFalloffMpc = tuning.radialFalloff * (outerRadiusMpc - innerRadiusMpc);

    // camForward (floats 0..2) + tanHalfFovY (float 3).
    f32[0] = fwd[0];
    f32[1] = fwd[1];
    f32[2] = fwd[2];
    f32[3] = tanHalfFovY;
    // camRight (floats 4..6) + aspect (float 7).
    f32[4] = right[0];
    f32[5] = right[1];
    f32[6] = right[2];
    f32[7] = aspect;
    // camUp (floats 8..10) + innerRadiusMpc (float 11).
    f32[8] = up[0];
    f32[9] = up[1];
    f32[10] = up[2];
    f32[11] = innerRadiusMpc;
    // cameraPosMpc (floats 12..14) + outerRadiusMpc (float 15).
    f32[12] = cam.position[0]!;
    f32[13] = cam.position[1]!;
    f32[14] = cam.position[2]!;
    f32[15] = outerRadiusMpc;
    // color (floats 16..18) + bulgeDeg (float 19).
    f32[16] = tuning.color[0];
    f32[17] = tuning.color[1];
    f32[18] = tuning.color[2];
    f32[19] = bulgeDeg;
    // anticenterDeg, intensity, radialFalloffMpc, edgeSharpness (floats 20..23).
    f32[20] = anticenterDeg;
    f32[21] = tuning.intensity;
    f32[22] = radialFalloffMpc;
    f32[23] = tuning.edgeSharpness;
    // fadeAlpha (float 24); float 25 is packedId (written once above);
    // floats 26..27 are pad, left at zero.
    f32[24] = fadeAlpha;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  }

  function draw(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void {
    writeUniforms(
      cam,
      viewport,
      tuning,
      innerRadiusMpc,
      outerRadiusMpc,
      bulgeDeg,
      anticenterDeg,
      fadeAlpha,
    );
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  // Pick twin of `draw`: same fullscreen-quad draw, same uniforms, against
  // the r32uint pick pipeline. Never binds group(0) itself — see the pick
  // pipeline's construction above for why. `bindGroup` is the SAME object
  // `draw` binds at group(0), just landing at group(1) here.
  function drawPick(
    pass: GPURenderPassEncoder,
    cam: OrbitCamera,
    viewport: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    innerRadiusMpc: number,
    outerRadiusMpc: number,
    bulgeDeg: number,
    anticenterDeg: number,
    fadeAlpha: number,
  ): void {
    writeUniforms(
      cam,
      viewport,
      tuning,
      innerRadiusMpc,
      outerRadiusMpc,
      bulgeDeg,
      anticenterDeg,
      fadeAlpha,
    );
    pass.setPipeline(pickPipeline);
    pass.setBindGroup(1, bindGroup);
    pass.draw(6, 1);
  }

  function drawLabels(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    tuning: ZoneOfAvoidanceTuning,
    labelRadiusMpc: number,
    fadeAlpha: number,
  ): void {
    if (labelGlyphCount === 0) return;

    writeCameraPrefix(labelUniforms, viewProj, viewportPx);
    // color (floats 20..22) + labelRadiusMpc (float 23).
    labelUniforms[20] = tuning.labelColor[0];
    labelUniforms[21] = tuning.labelColor[1];
    labelUniforms[22] = tuning.labelColor[2];
    labelUniforms[23] = labelRadiusMpc;
    // fadeAlpha (float 24); floats 25..27 are pad, left at zero.
    labelUniforms[24] = fadeAlpha;
    device.queue.writeBuffer(labelUniformBuffer, 0, labelUniforms);

    pass.setPipeline(labelPipeline);
    pass.setBindGroup(0, labelBindGroup);
    pass.setVertexBuffer(0, labelCornerBuffer);
    pass.setVertexBuffer(1, labelInstanceBuffer);
    pass.draw(4, labelGlyphCount);
  }

  function destroy(): void {
    uniformBuffer.destroy();
    labelUniformBuffer.destroy();
    labelCornerBuffer.destroy();
    labelInstanceBuffer.destroy();
    labelAtlasTexture.destroy();
  }

  const renderer: ZoneOfAvoidanceRenderer = {
    label: 'zoneOfAvoidanceRenderer',
    draw,
    drawPick,
    drawLabels,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
