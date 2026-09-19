/**
 * tests/setup/webgpuGlobals.ts — vitest setupFile.
 *
 * Vitest runs in Node, where the WebGPU usage-flag globals
 * (GPUBufferUsage, GPUShaderStage, GPUTextureUsage) don't exist.
 * Renderer code references these constants directly — `GPUBufferUsage.VERTEX`
 * is a numeric bit flag — and several tests construct fake devices that
 * record the flags they were asked to allocate.
 *
 * Pre-this-file, every renderer test that needed these declared its own
 * `beforeAll(() => { (globalThis as any).GPUBufferUsage = { ... } })`.
 * The numeric values were re-typed by hand each time, which both
 * duplicated the spec literal and risked drifting between files.
 *
 * Single source of truth: this file populates the flags ONCE per test
 * environment.  Vitest's `setupFiles` config runs it before any test
 * file imports user code, so `import { createGalaxyPointRenderer } from ...`
 * sees the constants on the first read.
 *
 * Values mirror the WebGPU spec verbatim (https://www.w3.org/TR/webgpu/).
 * If the spec adds a flag we care about, add it here — not in a renderer
 * test.
 */

// Types for these globals come from `@webgpu/types` (see tsconfig `types`),
// so we only need to provide the runtime values here. We cast through
// `unknown` because the spec types are nominal interfaces with read-only
// properties — assigning a plain object literal would otherwise be
// rejected by the structural check.

(globalThis as unknown as { GPUBufferUsage: unknown }).GPUBufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
};

(globalThis as unknown as { GPUShaderStage: unknown }).GPUShaderStage = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4,
};

(globalThis as unknown as { GPUTextureUsage: unknown }).GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
};

(globalThis as unknown as { GPUMapMode: unknown }).GPUMapMode = {
  READ: 0x0001,
  WRITE: 0x0002,
};

export {};
