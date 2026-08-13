/**
 * zoneOfAvoidanceRenderer — translucent galactic-plane dust-band guide,
 * drawn as an analytic ray-marched shell (same family as
 * `horizonShellRenderer`: one fullscreen quad, the fragment stage
 * intersects a per-pixel view ray with geometry analytically) — PLUS a
 * second pipeline (`drawLabels`) for the curved "ZONE OF AVOIDANCE"
 * lettering: discrete, world-oriented MSDF glyph quads fixed to the
 * galactic-plane circle, built once at construction (`layoutLabel` is a
 * CPU call, not a per-frame one) and issued as one instanced draw per
 * frame thereafter. See `shaders/zoneOfAvoidance/label/vertex.wesl` for
 * the arc-placement derivation.
 *
 * A single-instance world-anchored impostor. The band explains why the
 * catalogs thin out near the galactic plane — see the spec's Grill Q1/Q8 —
 * so it must read correctly from every camera position and distance,
 * which rules out a small proxy mesh in favour of the same camera-basis
 * ray-reconstruction technique the observable-universe shell uses.
 *
 * ### Uniform buffer ABI (112 bytes)
 *
 * See `shaders/zoneOfAvoidance/io.wesl` for the authoritative layout and
 * the byte-offset table; the summary:
 *
 *   offset 0  | vec3<f32> camForward   + f32 tanHalfFovY
 *   offset 16 | vec3<f32> camRight     + f32 aspect
 *   offset 32 | vec3<f32> camUp        + f32 innerRadiusMpc
 *   offset 48 | vec3<f32> cameraPosMpc + f32 outerRadiusMpc
 *   offset 64 | vec3<f32> color        + f32 bulgeDeg
 *   offset 80 | f32 anticenterDeg, f32 intensity, f32 radialFalloffMpc, f32 edgeSharpness
 *   offset 96 | f32 fadeAlpha, f32×3 pad
 *
 * Unlike `horizonShellRenderer`, everything stays in Mpc — the band's radii
 * (a few to a few hundred Mpc) never approach fp32's exact-integer ceiling,
 * so there's no Gpc-unit workaround to carry here.
 *
 * `radialFalloffMpc` is the one field that ISN'T a straight tuning-struct
 * copy: `ZoneOfAvoidanceTuning.radialFalloff` is documented (and dialled by
 * the DebugPanel) as a normalised [0, 1] fraction of the shell's radial
 * span, so `draw` converts it to an absolute Mpc width — the one currency
 * the shader's two smoothstep rims actually need — before writing the
 * uniform. See `draw`'s body for the conversion.
 *
 * ### Label uniform buffer ABI (112 bytes) — see `label/io.wesl`
 *
 *   offset  0 | CameraUniforms (viewProj + viewportPx + 8B pad)
 *   offset 80 | vec3<f32> color + f32 labelRadiusMpc
 *   offset 96 | f32 fadeAlpha, f32×3 pad
 *
 * ### Label glyph-instance buffer
 *
 * Built ONCE in this factory from `layoutLabel(ZONE_OF_AVOIDANCE_LABEL_TEXT,
 * ...)`, repeated at `ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT` evenly-spaced
 * galactic longitudes. Each glyph's `localOffset`/`localSize` are baked from
 * atlas px to a fixed WORLD-Mpc em size (`LABEL_EM_MPC` below) — the same
 * `worldEmMpc` idea `labels/io.wesl` documents, just resolved once here
 * instead of per-frame — so the vertex shader's arc-angle division by the
 * live `labelRadiusMpc` uniform is the only per-frame work.
 */

import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../../@types/camera/ImagePlaneBasis';
import { imagePlaneBasis } from '../../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../utils/camera/frameUp';
import vsCode from '../../shaders/zoneOfAvoidance/vertex.wesl?static';
import fsCode from '../../shaders/zoneOfAvoidance/fragment.wesl?static';
import labelVsCode from '../../shaders/zoneOfAvoidance/label/vertex.wesl?static';
import labelFsCode from '../../shaders/zoneOfAvoidance/label/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { layoutLabel } from '../../labelLayout/labelLayout';
import { ATLAS_FONT_SIZE, FONT_IDS } from '../../../../data/fonts';
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

/**
 * Lettering tint, linear RGB — visual-checkpoint placeholder like the
 * band's own `tuning.color`. Not tied to `ZoneOfAvoidanceTuning` because
 * the label has no other per-frame knob to bundle it with (Task 13's
 * DebugPanel section is where this would become a dial, if it needs one).
 */
const LABEL_COLOR: Vec3 = [1, 1, 1];

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

  // ── Curved-lettering pipeline ("ZONE OF AVOIDANCE" glyphs) ────────────
  //
  // A single font (`FONT_IDS[0]`) — unlike `labelRenderer`, this pass has
  // no per-label font choice, so the atlas binds as a plain `texture_2d`
  // rather than a `texture_2d_array`. Reuses `atlases` (loaded once by
  // `initGpu.ts`'s `loadFontAtlases()` call) rather than fetching a second
  // copy — see this file's header.
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
  // 'center'/'center' alignment centres each repeat's pen origin at (0, 0),
  // so `galacticLonRad` alone (no extra per-glyph shift) is each repeat's
  // base longitude — see label/vertex.wesl for how the pen offset folds in.
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
  // Plain Vec3 tuples (not vec3.create's Float32Array) so the per-component
  // reads below index cleanly under noUncheckedIndexedAccess.  wgpu-matrix
  // writes into them in place via the `dst` arg just the same.
  const fwd: Vec3 = [0, 0, 0];
  // Frame-pole reference up, allocated once and rewritten in place each frame.
  const upRefScratch: Vec3 = [0, 0, 0];
  // Roll-adjusted screen basis, allocated once and rewritten in place each
  // frame by `imagePlaneBasis` via its `out` argument.
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

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
    // span (see the type + this file's ABI docblock); the shader's two
    // rim smoothsteps want an absolute Mpc width, so convert here — the
    // ONE place this currency change happens, rather than splitting the
    // multiply across the shader (which would leave the uniform holding a
    // value with no name of its own).
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
    // fadeAlpha (float 24); floats 25..27 are pad, left at zero.
    f32[24] = fadeAlpha;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  function drawLabels(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    labelRadiusMpc: number,
    fadeAlpha: number,
  ): void {
    if (labelGlyphCount === 0) return;

    writeCameraPrefix(labelUniforms, viewProj, viewportPx);
    // color (floats 20..22) + labelRadiusMpc (float 23).
    labelUniforms[20] = LABEL_COLOR[0];
    labelUniforms[21] = LABEL_COLOR[1];
    labelUniforms[22] = LABEL_COLOR[2];
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
    drawLabels,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
