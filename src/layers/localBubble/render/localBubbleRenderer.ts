/**
 * LocalBubbleRenderer — GPU buffers for the Local Bubble cavity-wall mesh.
 * Scaffold only: `upload` builds the vertex/index buffers, `hasMesh` backs
 * the fade row's guard. The pipeline and `draw` land in Task 6 once the
 * shaders exist.
 */

import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import type { LocalBubbleRenderer } from '../../../@types/rendering/LocalBubbleRenderer';
import type { Renderer } from '../../../@types/rendering/Renderer';

export function createLocalBubbleRenderer(device: GPUDevice): LocalBubbleRenderer {
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
  }

  function hasMesh(): boolean {
    return indexBuffer !== null;
  }

  function destroy(): void {
    destroyMeshBuffers();
  }

  const renderer: LocalBubbleRenderer = {
    label: 'localBubbleRenderer',
    upload,
    hasMesh,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
