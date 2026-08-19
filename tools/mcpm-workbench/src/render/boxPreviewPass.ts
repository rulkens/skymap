/**
 * createBoxPreviewPass — a transient wireframe of the PENDING grid box (mcpm/boxLines.wesl),
 * plus its gizmo handle glyphs (translate arrows, resize crosses, rotate rings). Vertex-pulled,
 * no vertex buffers — corners and glyph positions are rewritten into small buffers every draw
 * call, so unlike the agent-fed passes this needs neither the harness nor a box at construction;
 * RenderGraph builds it EAGERLY, so a shader compile error surfaces at graph construction, not
 * on the first drag.
 *
 * `builtBox` (the camera's own voxel frame) and `pendingBox` (what's previewed, in world Mpc,
 * converted host-side) are deliberately different GridBoxes — glyph geometry comes from
 * `pendingBox`'s own `gizmoHandleGeometry(box, boxAxesFor(box.rotation), arrowLengthMpc)` (F2.5's
 * axes swap: arrows/crosses/rings all rotate with the box). `arrowLengthMpc` is derived from
 * `view` each draw via gizmoArrowLengthMpc — the SAME formula Viewport.tsx's pick/hover path
 * uses, or grabbing an arrow would miss where it's drawn.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { cross3 } from '../../../../src/utils/math/cross3';
import { lerpVec3 } from '../../../../src/utils/math/lerpVec3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { GridBox } from '../../@types/GridBox';
import { boxAxesFor } from '../field/boxAxesFor';
import { boxBasisVectors } from '../field/boxBasisVectors';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';
import { worldToVoxel } from '../field/worldToVoxel';
import { encodeGizmoHandleId } from '../gizmo/encodeGizmoHandleId';
import { gizmoArrowLengthMpc } from '../gizmo/gizmoArrowLengthMpc';
import { gizmoHandleGeometry, PICK_TOLERANCE_FRACTION } from '../gizmo/gizmoHandleGeometry';
import { MCPM_CAMERA_BYTES, writeMcpmCamera, type McpmCameraView } from './writeMcpmCamera';
import boxLinesWgsl from '../../../../src/services/gpu/shaders/mcpm/boxLines.wesl?static';

export type BoxPreviewPass = {
  /**
   * Draw `pendingBox`'s wireframe and gizmo handle glyphs, converted into `builtBox`'s voxel
   * frame, into `target`. `hoverHandle`/`activeHandle` pick the glyph highlight color; `null`
   * for neither.
   */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    view: McpmCameraView,
    builtBox: GridBox,
    pendingBox: GridBox,
    hoverHandle: GizmoHandleId | null,
    activeHandle: GizmoHandleId | null,
  ): void;
  dispose(): void;
};

// BoxUniform: center, halfExtents, basisX, basisY, basisZ — each vec3+pad, 16-byte
// aligned — boxLines.wesl's struct (plan contract §5's byte table), byte-for-byte.
// Exported for boxUniform.parity.test.ts.
export const BOX_UNIFORM_BYTES = 80;
const LINE_VERTICES = 24; // boxLines.wesl's EDGE_CORNERS: 12 edges x 2 endpoints.

// GlyphSegment{posA:vec3+widthA, posB:vec3+widthB, handleId:i32+12 pad} — 48 bytes / 12 floats,
// boxLines.wesl's struct byte-for-byte. Each segment expands to a 2-triangle screen-space quad
// (VERTICES_PER_SEGMENT) in vsGlyph, so the draw call's vertex count is a multiple of it.
// Exported for glyphSegment.parity.test.ts.
export const GLYPH_SEGMENT_FLOATS = 12;
const VERTICES_PER_SEGMENT = 6;
const RING_SEGMENTS = 48; // per rotate ring, sampled evenly around the circle — closed polyline.
// 3 translate arrows x (1 shaft + 1 tapered cone) + 6 resize crosses x 2 arms +
// 3 rotate rings x RING_SEGMENTS (F2.5).
const GLYPH_SEGMENT_COUNT = 3 * 2 + 6 * 2 + 3 * RING_SEGMENTS;
const GLYPH_VERTEX_COUNT = GLYPH_SEGMENT_COUNT * VERTICES_PER_SEGMENT;
const GLYPH_STORAGE_BYTES = GLYPH_SEGMENT_COUNT * GLYPH_SEGMENT_FLOATS * 4;
// GizmoUniform: hoverHandle i32 + activeHandle i32 + 8 bytes pad.
const GIZMO_UNIFORM_BYTES = 16;

// Rendering-only sizing (screen-space pixel widths, world-space cone/cross proportions) — none
// of this feeds pickGizmoHandle, which hit-tests handle.positionMpc against PICK_TOLERANCE_
// FRACTION directly and never reads the glyph geometry built below.
const SHAFT_WIDTH_PX = 8;
const CROSS_WIDTH_PX = 8;
const ARROWHEAD_TIP_WIDTH_PX = 1;
const ARROWHEAD_BASE_WIDTH_PX = 24;
const ARROWHEAD_LENGTH_FRACTION = 0.15; // of the arrow's center-to-tip length
const CROSS_ARM_FRACTION = 1.5 * PICK_TOLERANCE_FRACTION; // visually bigger than the (unchanged) pick radius
const TWO_PI = Math.PI * 2;

type GlyphSegment = {
  readonly posA: Vec3;
  readonly widthA: number;
  readonly posB: Vec3;
  readonly widthB: number;
  readonly handleId: number;
};

function addScaled(p: Readonly<Vec3>, dir: Readonly<Vec3>, scale: number): Vec3 {
  return [p[0] + dir[0] * scale, p[1] + dir[1] * scale, p[2] + dir[2] * scale];
}

/** Two unit vectors spanning the plane perpendicular to `axisDir` — the resize cross's arms,
 *  and (F2.5) a rotate ring's own (u, v) circle basis for sampling its polyline. */
function crossArmVectors(axisDir: Readonly<Vec3>): readonly [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axisDir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = normalize3(cross3(axisDir, helper));
  return [u, cross3(axisDir, u)];
}

/** A point on the circle (center, u, v, radius) at `angle` — u/v an orthonormal pair
 *  spanning the circle's own plane (crossArmVectors' output). */
function ringPoint(
  center: Readonly<Vec3>,
  u: Readonly<Vec3>,
  v: Readonly<Vec3>,
  radius: number,
  angle: number,
): Vec3 {
  const c = radius * Math.cos(angle);
  const s = radius * Math.sin(angle);
  return [
    center[0] + u[0] * c + v[0] * s,
    center[1] + u[1] * c + v[1] * s,
    center[2] + u[2] * c + v[2] * s,
  ];
}

/**
 * Translate arrows: a constant-width shaft (center -> cone base) plus one tapered segment
 * (cone base -> the handle's own tip, base width -> tip width) that vsGlyph expands into a
 * single solid-filled screen-space triangle. Resize crosses: two constant-width segments
 * through the handle position, perpendicular to its axis. Rotate rings: a closed RING_SEGMENTS-
 * gon polyline of constant-width segments around the circle.
 */
function buildGlyphSegments(box: GridBox, arrowLengthMpc: number): GlyphSegment[] {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const crossArmMpc = CROSS_ARM_FRACTION * Math.min(half[0], half[1], half[2]);
  const geometry = gizmoHandleGeometry(box, boxAxesFor(box.rotation), arrowLengthMpc);
  const segs: GlyphSegment[] = [];

  for (const handle of geometry.translate) {
    const id = encodeGizmoHandleId(handle.id);
    const tip = handle.positionMpc;
    const coneBase = lerpVec3(box.centerMpc, tip, 1 - ARROWHEAD_LENGTH_FRACTION);

    segs.push({
      posA: box.centerMpc,
      widthA: SHAFT_WIDTH_PX,
      posB: coneBase,
      widthB: SHAFT_WIDTH_PX,
      handleId: id,
    });
    // Single tapered segment, base -> tip: vsGlyph expands this into ONE solid-filled
    // screen-space triangle (the fan of thin legs this replaced rendered as an outline).
    segs.push({
      posA: coneBase,
      widthA: ARROWHEAD_BASE_WIDTH_PX,
      posB: tip,
      widthB: ARROWHEAD_TIP_WIDTH_PX,
      handleId: id,
    });
  }

  for (const handle of geometry.resize) {
    const id = encodeGizmoHandleId(handle.id);
    const [u, v] = crossArmVectors(handle.axisDir);
    segs.push({
      posA: addScaled(handle.positionMpc, u, -crossArmMpc),
      widthA: CROSS_WIDTH_PX,
      posB: addScaled(handle.positionMpc, u, crossArmMpc),
      widthB: CROSS_WIDTH_PX,
      handleId: id,
    });
    segs.push({
      posA: addScaled(handle.positionMpc, v, -crossArmMpc),
      widthA: CROSS_WIDTH_PX,
      posB: addScaled(handle.positionMpc, v, crossArmMpc),
      widthB: CROSS_WIDTH_PX,
      handleId: id,
    });
  }

  for (const ring of geometry.rotate) {
    const id = encodeGizmoHandleId(ring.id);
    const [u, v] = crossArmVectors(ring.axisDir);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a0 = (i / RING_SEGMENTS) * TWO_PI;
      const a1 = ((i + 1) / RING_SEGMENTS) * TWO_PI;
      segs.push({
        posA: ringPoint(ring.centerMpc, u, v, ring.radiusMpc, a0),
        widthA: SHAFT_WIDTH_PX,
        posB: ringPoint(ring.centerMpc, u, v, ring.radiusMpc, a1),
        widthB: SHAFT_WIDTH_PX,
        handleId: id,
      });
    }
  }

  return segs;
}

export function createBoxPreviewPass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly blend: GPUBlendState;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
}): BoxPreviewPass {
  const { device } = opts;
  const module = opts.makeShader(boxLinesWgsl, 'mcpm-box-preview');

  const camLayout = device.createBindGroupLayout({
    label: 'mcpm-box-preview-camera-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  // Shared by both draws below: binding 0 (box vs) and bindings 1-2 (glyph vs/fs) each read
  // only the subset their own entry point needs — one bind group serves both pipelines.
  const boxLayout = device.createBindGroupLayout({
    label: 'mcpm-box-preview-box-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: 'mcpm-box-preview-layout',
    bindGroupLayouts: [camLayout, boxLayout],
  });

  const pipeline = device.createRenderPipeline({
    label: 'mcpm-box-preview',
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [
        {
          format: opts.targetFormat,
          // RenderGraph's OVERLAY_BLEND (premultiplied-over) — this pass is the one
          // exception to every other layer's additive LAYER_BLEND; see RenderGraph.ts.
          blend: opts.blend,
        },
      ],
    },
    primitive: { topology: 'line-list' },
  });

  const glyphPipeline = device.createRenderPipeline({
    label: 'mcpm-box-preview-glyphs',
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vsGlyph' },
    fragment: {
      module,
      entryPoint: 'fsGlyph',
      targets: [{ format: opts.targetFormat, blend: opts.blend }],
    },
    // Triangle quads (vsGlyph expands each GlyphSegment to 2 tris), not the hairline box's
    // line-list — pixel-space thickness needs real triangle coverage.
    primitive: { topology: 'triangle-list' },
  });

  const camBuffer = device.createBuffer({
    label: 'mcpm-box-preview-camera',
    size: MCPM_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camF32 = new Float32Array(MCPM_CAMERA_BYTES / 4);
  const camBindGroup = device.createBindGroup({
    label: 'mcpm-box-preview-camera',
    layout: camLayout,
    entries: [{ binding: 0, resource: { buffer: camBuffer } }],
  });

  const boxBuffer = device.createBuffer({
    label: 'mcpm-box-preview-box',
    size: BOX_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const boxF32 = new Float32Array(BOX_UNIFORM_BYTES / 4);

  const glyphBuffer = device.createBuffer({
    label: 'mcpm-box-preview-glyphs',
    size: GLYPH_STORAGE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const glyphF32 = new Float32Array(GLYPH_STORAGE_BYTES / 4);
  const glyphI32 = new Int32Array(glyphF32.buffer);

  const gizmoBuffer = device.createBuffer({
    label: 'mcpm-box-preview-gizmo',
    size: GIZMO_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const gizmoI32 = new Int32Array(GIZMO_UNIFORM_BYTES / 4);

  const boxBindGroup = device.createBindGroup({
    label: 'mcpm-box-preview-box',
    layout: boxLayout,
    entries: [
      { binding: 0, resource: { buffer: boxBuffer } },
      { binding: 1, resource: { buffer: glyphBuffer } },
      { binding: 2, resource: { buffer: gizmoBuffer } },
    ],
  });

  return {
    draw(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      view: McpmCameraView,
      builtBox: GridBox,
      pendingBox: GridBox,
      hoverHandle: GizmoHandleId | null,
      activeHandle: GizmoHandleId | null,
    ): void {
      writeMcpmCamera(camF32, builtBox, view);
      device.queue.writeBuffer(camBuffer, 0, camF32);

      // center is a POSITION: worldToVoxel carries it through builtBox's full affine
      // (rotate, translate, uniform-scale) exactly as before. halfExtents and the three
      // basis vectors are magnitudes/DIRECTIONS, not positions — halfExtents only needs
      // the uniform voxel-size division (rotation doesn't touch a length), and each basis
      // vector only needs builtBox's own rotation (no translate, no scale: a rotation
      // preserves unit length) — the same "direction, not position" leg cameraBasis
      // applies to right/up/forward in writeMcpmCamera.ts. At identity builtBox.rotation
      // this reduces to today's plain division/no-op, so the wireframe lands exactly where
      // it always has.
      const half = boxHalfExtentMpc(pendingBox.sizeMpc);
      const halfExtentsVoxel: Vec3 = [
        half[0] / builtBox.voxelSizeMpc,
        half[1] / builtBox.voxelSizeMpc,
        half[2] / builtBox.voxelSizeMpc,
      ];
      const pendingBasis = boxBasisVectors(pendingBox.rotation);
      const [bx, by, bz, bw] = builtBox.rotation;
      const builtConjugate: Vec4 = [-bx, -by, -bz, bw];

      boxF32.set(worldToVoxel(builtBox, pendingBox.centerMpc), 0);
      boxF32.set(halfExtentsVoxel, 4);
      boxF32.set(rotateVec3ByQuat(builtConjugate, pendingBasis.x), 8);
      boxF32.set(rotateVec3ByQuat(builtConjugate, pendingBasis.y), 12);
      boxF32.set(rotateVec3ByQuat(builtConjugate, pendingBasis.z), 16);
      device.queue.writeBuffer(boxBuffer, 0, boxF32);

      const arrowLengthMpc = gizmoArrowLengthMpc(view.eyeMpc, pendingBox.centerMpc, view.fovYRad);

      let si = 0;
      for (const seg of buildGlyphSegments(pendingBox, arrowLengthMpc)) {
        const a = worldToVoxel(builtBox, seg.posA);
        const b = worldToVoxel(builtBox, seg.posB);
        const base = si * GLYPH_SEGMENT_FLOATS;
        glyphF32[base] = a[0];
        glyphF32[base + 1] = a[1];
        glyphF32[base + 2] = a[2];
        glyphF32[base + 3] = seg.widthA;
        glyphF32[base + 4] = b[0];
        glyphF32[base + 5] = b[1];
        glyphF32[base + 6] = b[2];
        glyphF32[base + 7] = seg.widthB;
        glyphI32[base + 8] = seg.handleId;
        si++;
      }
      device.queue.writeBuffer(glyphBuffer, 0, glyphF32);

      gizmoI32[0] = encodeGizmoHandleId(hoverHandle);
      gizmoI32[1] = encodeGizmoHandleId(activeHandle);
      device.queue.writeBuffer(gizmoBuffer, 0, gizmoI32);

      const pass = encoder.beginRenderPass({
        label: 'mcpm-box-preview',
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      });
      pass.setBindGroup(0, camBindGroup);
      pass.setBindGroup(1, boxBindGroup);
      pass.setPipeline(pipeline);
      pass.draw(LINE_VERTICES);
      pass.setPipeline(glyphPipeline);
      pass.draw(GLYPH_VERTEX_COUNT);
      pass.end();
    },
    dispose(): void {
      camBuffer.destroy();
      boxBuffer.destroy();
      glyphBuffer.destroy();
      gizmoBuffer.destroy();
    },
  };
}
