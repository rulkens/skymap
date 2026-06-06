/**
 * createDisposableTracker — a reverse-order resource sink for GPU teardown.
 *
 * WebGPU buffers and textures must be `.destroy()`-ed explicitly, and the
 * cosmic-flow engine creates them in dependency order (a bind group after the
 * buffers it points at, a pipeline after its layout). Freeing them in the same
 * order can release a resource another still references; freeing in REVERSE
 * acquisition order (LIFO) mirrors construction and is the safe default — the
 * same discipline a stack of `defer`s or a C++ destructor chain gives you.
 *
 * `track(r)` registers a resource and returns it unchanged, so it reads
 * fluently at the creation site: `const buf = track(device.createBuffer(...))`.
 * It accepts either a raw GPU resource (detected by a `.destroy` method) or any
 * `Disposable` (detected by `.dispose`). `disposeAll()` tears everything down
 * once and clears the list, so a second call is a harmless no-op.
 */
import type { Disposable } from '../../../@types/engine/gpu/Disposable';

type Tracked = Disposable | GPUBuffer | GPUTexture;

export function createDisposableTracker(): {
  track<T extends Tracked>(r: T): T;
  disposeAll(): void;
} {
  let resources: Tracked[] = [];

  return {
    track<T extends Tracked>(r: T): T {
      resources.push(r);
      return r;
    },
    disposeAll(): void {
      // LIFO: tear down in reverse of acquisition so a resource is never freed
      // while something acquired after it still depends on it.
      for (let i = resources.length - 1; i >= 0; i--) {
        const r = resources[i] as Partial<Disposable> & Partial<GPUBuffer>;
        if (typeof (r as { destroy?: unknown }).destroy === 'function') {
          (r as GPUBuffer).destroy();
        } else if (typeof (r as { dispose?: unknown }).dispose === 'function') {
          (r as Disposable).dispose();
        }
      }
      resources = [];
    },
  };
}
