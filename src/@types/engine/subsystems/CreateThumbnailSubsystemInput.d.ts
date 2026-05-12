/**
 * Hooks the subsystem needs from the outside world.  All passed once
 * at construction so `runFrame()` doesn't have to take them as
 * arguments — they're stable across the engine's lifetime.
 */
export type CreateThumbnailSubsystemInput = {
  /** WebGPU device — used by the atlas to upload bitmaps. */
  device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame.  Called when a
   * fetch completes (so the thumbnail appears) and when a fetch fails
   * (so the still-animating predicate can re-check `inFlightCount`
   * and let the loop sleep if this was the last pending fetch).
   */
  requestRender: () => void;
  /**
   * Optional override for the bitmap fetcher.  Production passes
   * undefined so we use `fetchGalaxyBitmap` from galaxyImageFetcher;
   * tests pass a stub returning a synthetic ImageBitmap (or null) so
   * they can exercise the per-frame gate without touching the
   * network.
   */
  fetcher?: (args: { ra: number; dec: number; famousId?: string }) => Promise<ImageBitmap | null>;
  /**
   * Round-robin stride decimation factor for the per-galaxy cull loop.
   *
   * The full cloud has ~3.5 M galaxies in the largest tier; the cheap
   * squared-distance cull alone burns ~5 ms per frame on mid-range
   * laptops because we walk the entire `positions` array on every wake.
   * Setting `decimationFactor = N` walks only `count/N` galaxies per
   * frame, advancing a cursor so a full sweep finishes every N frames.
   *
   * Galaxies that pass the cull on a sweep are stashed in a sticky map
   * keyed by their cloud-local index, and the renderer reads the union
   * of every cloud's sticky map every frame — so a thumbnail that's
   * already on screen keeps drawing while the cursor moves on.  Without
   * the sticky map, decimation would make visible thumbnails blink at
   * 60/N Hz as the cursor swept past them; with it, the user only sees
   * thumbnails appear / disappear with up to `N` frames of latency.
   *
   * Default 8 — at 60 fps, a full sweep completes in ~133 ms, well
   * within human tolerance for "thumbnails settle as I pan".  Tests
   * that need every galaxy visited every frame can pass `1` to disable
   * decimation entirely.
   */
  decimationFactor?: number;
};
