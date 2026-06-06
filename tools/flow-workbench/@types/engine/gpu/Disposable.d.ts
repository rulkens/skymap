/**
 * Disposable — the minimal "I own resources that must be freed" contract.
 *
 * WebGPU resources (buffers, textures, pipelines) are not garbage-collected
 * deterministically; a long-lived tool that swaps visualizations on and off
 * must release them explicitly or it leaks GPU memory. Rather than scatter
 * ad-hoc `.destroy()` calls, anything that holds resources exposes a single
 * `dispose()` and is handed to the engine's resource tracker, which calls
 * dispose in reverse-acquisition order at teardown.
 *
 * Deliberately one method: this is the smallest surface that lets the tracker
 * treat heterogeneous owners (a visualization, a render graph, a wrapper
 * around a raw GPUBuffer) uniformly.
 */
export type Disposable = { dispose(): void };
