/**
 * LocalBubbleRenderer — GPU pipeline for the Local Bubble cavity-wall shell.
 * Byte-layout contract (see comments.md), so the table below stays fully
 * spelled out rather than trimmed to the usual budget: two vertex buffers
 * (position/normal, format resolved from the mesh's own dtype) plus a u32
 * index buffer, one additive `drawIndexed`. No depth: the hdr NEAR0 target
 * (`HDR_TARGET_FORMAT`) carries none, and neither wall of the shell should
 * occlude the other — both read additively.
 *
 * Uniforms (@group(0), byte-exact with `shaders/localBubble/shell.wesl`):
 *   0..79    cam       lib::camera CameraUniforms — viewProj per `draw`;
 *                       viewportPx stays 0 (the shell never reads it).
 *   80..143  model     mat4x4<f32> — FRAME_TO_WORLD[frame] ×
 *                       translate(centrePc·PC_TO_MPC) × scale(PC_TO_MPC),
 *                       written at `upload` — fixed for the mesh's life.
 *   144..155 eye       vec3<f32>   — per `draw`.
 *   156..159 opacity   f32         — per `draw`.
 *   160..171 tint      vec3<f32>   — LOCAL_BUBBLE_TINT, written at `upload`.
 *   172..175 _pad      f32
 */

import { mat4 } from 'wgpu-matrix';

import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';

import shellCode from '../../../services/gpu/shaders/localBubble/shell.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { SHELL_VERTEX_FORMAT } from '../../../data/localBubble/shellVertexFormats';
import { FRAME_TO_WORLD } from '../../../data/frameToWorld';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { LOCAL_BUBBLE_TINT } from '../../../data/localBubble/localBubbleTint';

// f32 indices into the uniform block — see module header's byte table.
const UNIFORMS_BYTES = 176;
const VIEW_PROJ_F32_INDEX = 0;
const MODEL_F32_INDEX = 20;
const EYE_F32_INDEX = 36;
const OPACITY_F32_INDEX = 39;
const TINT_F32_INDEX = 40;
// Bytes 0..159: everything `draw` rewrites; tint above it is upload-only.
const PER_DRAW_BYTES = 160;

const COMPONENTS_PER_VERTEX = 4;

/**
 * FRAME_TO_WORLD[frame] × translate(centrePc·PC_TO_MPC) × scale(PC_TO_MPC).
 * Composed with wgpu-matrix's post-multiply convention (`translate`/`scale`
 * append to the right of their `dst` argument), mirroring
 * `buildCubeModelMatrix`'s derivation of the same kind of placement matrix.
 */
function buildModelMatrix(mesh: ShellMesh): Float32Array {
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;
  const model = mat4.copy(FRAME_TO_WORLD[mesh.frame]);
  mat4.translate(
    model,
    [mesh.centrePc[0] * pcToMpc, mesh.centrePc[1] * pcToMpc, mesh.centrePc[2] * pcToMpc],
    model,
  );
  mat4.scale(model, [pcToMpc, pcToMpc, pcToMpc], model);
  return model as Float32Array;
}

export function createLocalBubbleRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): LocalBubbleRenderer {
  const shellModule = createShaderModuleWithDevLog(device, shellCode, 'local-bubble.shell');

  const uniformsBgl = device.createBindGroupLayout({
    label: 'local-bubble-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const uniformsBuffer = device.createBuffer({
    label: 'local-bubble-uniforms-buffer',
    size: UNIFORMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformsBindGroup = device.createBindGroup({
    label: 'local-bubble-bg-uniforms',
    layout: uniformsBgl,
    entries: [{ binding: 0, resource: { buffer: uniformsBuffer } }],
  });

  // Per-renderer CPU mirror of the uniform block, hoisted out of `draw` — no
  // per-frame allocation. Model + tint land at `upload`; `draw` patches the rest.
  const uniformsScratch = new Float32Array(UNIFORMS_BYTES / 4);

  const pipelineLayout = device.createPipelineLayout({
    label: 'local-bubble-pipeline-layout',
    bindGroupLayouts: [uniformsBgl],
  });

  let pipeline: GPURenderPipeline | null = null;
  let positionBuffer: GPUBuffer | null = null;
  let normalBuffer: GPUBuffer | null = null;
  let indexBuffer: GPUBuffer | null = null;
  let indexCount = 0;

  function destroyMeshBuffers(): void {
    positionBuffer?.destroy();
    normalBuffer?.destroy();
    indexBuffer?.destroy();
    positionBuffer = null;
    normalBuffer = null;
    indexBuffer = null;
    indexCount = 0;
    pipeline = null;
  }

  function upload(mesh: ShellMesh): void {
    destroyMeshBuffers();

    positionBuffer = device.createBuffer({
      label: 'local-bubble-position-buffer',
      size: mesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

    normalBuffer = device.createBuffer({
      label: 'local-bubble-normal-buffer',
      size: mesh.normals.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(normalBuffer, 0, mesh.normals);

    indexBuffer = device.createBuffer({
      label: 'local-bubble-index-buffer',
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, mesh.indices);
    indexCount = mesh.indices.length;

    const stride = mesh.positions.BYTES_PER_ELEMENT * COMPONENTS_PER_VERTEX;
    pipeline = device.createRenderPipeline({
      label: `local-bubble-pipeline-${mesh.dtype}`,
      layout: pipelineLayout,
      vertex: {
        module: shellModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: stride,
            attributes: [{ shaderLocation: 0, offset: 0, format: SHELL_VERTEX_FORMAT[mesh.dtype] }],
          },
          {
            arrayStride: stride,
            attributes: [{ shaderLocation: 1, offset: 0, format: SHELL_VERTEX_FORMAT[mesh.dtype] }],
          },
        ],
      },
      fragment: {
        module: shellModule,
        entryPoint: 'fs',
        targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    uniformsScratch.set(buildModelMatrix(mesh), MODEL_F32_INDEX);
    uniformsScratch.set(LOCAL_BUBBLE_TINT, TINT_F32_INDEX);
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsScratch);
  }

  function hasMesh(): boolean {
    return indexBuffer !== null;
  }

  function clearMesh(): void {
    destroyMeshBuffers();
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    eyeMpc: Readonly<Vec3>,
    opacity: number,
  ): void {
    if (!positionBuffer || !normalBuffer || !indexBuffer || !pipeline) return;

    uniformsScratch.set(viewProj, VIEW_PROJ_F32_INDEX);
    uniformsScratch.set(eyeMpc, EYE_F32_INDEX);
    uniformsScratch[OPACITY_F32_INDEX] = opacity;
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsScratch, 0, PER_DRAW_BYTES / 4);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformsBindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, normalBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    destroyMeshBuffers();
    uniformsBuffer.destroy();
  }

  const renderer: LocalBubbleRenderer = {
    label: 'localBubbleRenderer',
    upload,
    hasMesh,
    clearMesh,
    draw,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
