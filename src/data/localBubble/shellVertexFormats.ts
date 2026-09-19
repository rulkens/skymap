import type { ShellMeshDtype } from '../../@types/data/shellMesh/ShellMeshDtype';

/**
 * `.shell` dtype → the WebGPU vertex format its raw bytes upload as. f16
 * files carry raw f16 bit patterns (`shellMeshFormat.ts`); the GPU widens
 * them to f32 per-lane at vertex fetch, so no CPU-side conversion happens
 * between decode and upload.
 */
export const SHELL_VERTEX_FORMAT: Record<ShellMeshDtype, GPUVertexFormat> = {
  f16: 'float16x4',
  f32: 'float32x4',
};
