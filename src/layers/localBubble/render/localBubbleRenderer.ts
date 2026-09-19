/**
 * LocalBubbleRenderer — GPU pipeline for the Local Bubble cavity-wall shell:
 * two vertex buffers (position/normal, format resolved from the mesh's own
 * dtype) plus a u32 index buffer, one additive `drawIndexed`. No depth: the
 * hdr NEAR0 target carries none (`renderTargets.ts:198`), and neither wall of
 * the shell should occlude the other — both read additively.
 *
 * Uniforms (@group(0), byte-exact with `shaders/localBubble/{vertex,fragment}.wesl`):
 *   0..63   model      mat4x4<f32> — FRAME_TO_WORLD[frame] ×
 *                       translate(centrePc·PC_TO_MPC) × scale(PC_TO_MPC).
 *                       Written once at `upload` — fixed for the mesh's life.
 *   64..75  tint       vec3<f32>   — written every `draw`.
 *   76..79  opacity    f32         — written every `draw`.
 *   80..95  _reserved  vec4<f32>   — never written; stays zero.
 *
 * Camera (@group(1)) is renderer-private, NOT `lib::camera`'s shared
 * CameraUniforms — that struct deliberately excludes eye position (see its
 * own header), and the shell's Fresnel view vector needs one:
 *   0..63   viewProj   mat4x4<f32>
 *   64..75  eye        vec3<f32>
 *   76..79  _pad       f32
 */

import { mat4 } from 'wgpu-matrix';

import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { ShellMeshDtype } from '../../../@types/data/shellMesh/ShellMeshDtype';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';

import vsCode from '../../../services/gpu/shaders/localBubble/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/localBubble/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { SHELL_VERTEX_FORMAT } from '../../../data/localBubble/shellVertexFormats';
import { FRAME_TO_WORLD } from '../../../data/frameToWorld';
import { SCALE_UNITS } from '../../../data/scaleUnits';

const UNIFORMS_BYTES = 96;
const TINT_F32_INDEX = 16; // byte 64 — see module header's byte table
const CAMERA_BYTES = 80;
const EYE_F32_INDEX = 16; // byte 64 — see module header's byte table

const COMPONENTS_PER_VERTEX = 4;
const BYTES_PER_COMPONENT: Record<ShellMeshDtype, number> = { f16: 2, f32: 4 };

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
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'local-bubble.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'local-bubble.fragment');

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

  const cameraBgl = device.createBindGroupLayout({
    label: 'local-bubble-bgl-camera',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const cameraBuffer = device.createBuffer({
    label: 'local-bubble-camera-buffer',
    size: CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const cameraBindGroup = device.createBindGroup({
    label: 'local-bubble-bg-camera',
    layout: cameraBgl,
    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'local-bubble-pipeline-layout',
    bindGroupLayouts: [uniformsBgl, cameraBgl],
  });

  // One pipeline per dtype, built lazily on first upload of that dtype — the
  // vertex layout is the only thing dtype changes, and a session only ever
  // sees whichever dtype the bake shipped.
  const pipelines = new Map<ShellMeshDtype, GPURenderPipeline>();

  function pipelineFor(dtype: ShellMeshDtype): GPURenderPipeline {
    const cached = pipelines.get(dtype);
    if (cached) return cached;
    const stride = COMPONENTS_PER_VERTEX * BYTES_PER_COMPONENT[dtype];
    const pipeline = device.createRenderPipeline({
      label: `local-bubble-pipeline-${dtype}`,
      layout: pipelineLayout,
      vertex: {
        module: vsModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: stride,
            attributes: [{ shaderLocation: 0, offset: 0, format: SHELL_VERTEX_FORMAT[dtype] }],
          },
          {
            arrayStride: stride,
            attributes: [{ shaderLocation: 1, offset: 0, format: SHELL_VERTEX_FORMAT[dtype] }],
          },
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // No depthStencil block: the hdr NEAR0 target has no depth attachment,
      // and both walls of the shell contribute additively regardless of
      // which one a fragment happens to belong to.
    });
    pipelines.set(dtype, pipeline);
    return pipeline;
  }

  let positionBuffer: GPUBuffer | null = null;
  let normalBuffer: GPUBuffer | null = null;
  let indexBuffer: GPUBuffer | null = null;
  let indexCount = 0;
  let currentDtype: ShellMeshDtype | null = null;

  function destroyMeshBuffers(): void {
    positionBuffer?.destroy();
    normalBuffer?.destroy();
    indexBuffer?.destroy();
    positionBuffer = null;
    normalBuffer = null;
    indexBuffer = null;
    indexCount = 0;
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
    currentDtype = mesh.dtype;
    pipelineFor(mesh.dtype);

    // Model only — tint/opacity/reserved stay zero here and are written per
    // draw (tint/opacity) or never (reserved); see the module header.
    const buf = new ArrayBuffer(UNIFORMS_BYTES);
    new Float32Array(buf).set(buildModelMatrix(mesh), 0);
    device.queue.writeBuffer(uniformsBuffer, 0, buf);
  }

  function hasMesh(): boolean {
    return indexBuffer !== null;
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    eyeMpc: Readonly<Vec3>,
    tint: Readonly<Vec3>,
    opacity: number,
  ): void {
    if (!positionBuffer || !normalBuffer || !indexBuffer || currentDtype === null) return;

    const camBuf = new ArrayBuffer(CAMERA_BYTES);
    const camF32 = new Float32Array(camBuf);
    camF32.set(viewProj, 0);
    camF32[EYE_F32_INDEX] = eyeMpc[0];
    camF32[EYE_F32_INDEX + 1] = eyeMpc[1];
    camF32[EYE_F32_INDEX + 2] = eyeMpc[2];
    device.queue.writeBuffer(cameraBuffer, 0, camBuf);

    const tintOpacityBuf = new ArrayBuffer(16);
    const tintOpacityF32 = new Float32Array(tintOpacityBuf);
    tintOpacityF32[0] = tint[0];
    tintOpacityF32[1] = tint[1];
    tintOpacityF32[2] = tint[2];
    tintOpacityF32[3] = opacity;
    device.queue.writeBuffer(uniformsBuffer, TINT_F32_INDEX * 4, tintOpacityBuf);

    pass.setPipeline(pipelineFor(currentDtype));
    pass.setBindGroup(0, uniformsBindGroup);
    pass.setBindGroup(1, cameraBindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, normalBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    destroyMeshBuffers();
    uniformsBuffer.destroy();
    cameraBuffer.destroy();
  }

  const renderer: LocalBubbleRenderer = {
    label: 'localBubbleRenderer',
    upload,
    hasMesh,
    draw,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
