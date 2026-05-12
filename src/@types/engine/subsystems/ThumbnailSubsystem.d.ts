import type { TexturedQuadRenderer } from '../../rendering/TexturedQuadRenderer';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { ThumbnailFrameInput } from './ThumbnailFrameInput';

export type ThumbnailSubsystem = {
  /**
   * Bind the atlas's GPU view to both texture-sampling renderers, and
   * stash the procedural-disk renderer for use by `runFrame` (it does
   * not sample the atlas, so no bindAtlas call for it — but we still
   * need a stable reference because the procedural-disk pass is issued
   * alongside quads/disks once per frame).  Called once after the
   * atlas's `initTexture()` completes (i.e. immediately after
   * createThumbnailSubsystem returns, but BEFORE the first `runFrame`).
   * We don't fold this into the constructor because the renderers
   * don't exist yet at construction time — they're built alongside it
   * in engine.ts.
   */
  bindToRenderers(
    texturedQuadRenderer: TexturedQuadRenderer,
    texturedDiskRenderer: TexturedDiskRenderer,
    proceduralDiskRenderer: ProceduralDiskRenderer,
  ): void;
  /**
   * Run the per-frame thumbnail-priority loop and emit ThumbnailInstances
   * + DiskInstances to the renderers.  Increments the LRU clock,
   * allocates atlas slots, kicks off fetches, and sorts back-to-front
   * for correct alpha compositing.
   */
  runFrame(input: ThumbnailFrameInput): void;
  /**
   * Returns true while at least one fetch is in flight OR a recently-
   * landed thumbnail is still in its load-fade window.  The engine's
   * render-on-demand "still animating" predicate ORs this in so the
   * loop keeps ticking until thumbnails settle.
   */
  hasInFlightFetches(): boolean;
  /**
   * Tear-down: clear the atlas's eviction handler, clear all
   * bookkeeping sets/maps.  In-flight fetches' onResult callbacks
   * become no-ops because the closure flag they check (`destroyed`)
   * gates the writes.  Called from engine.destroy().
   */
  destroy(): void;
  /** Test/inspection seam — exposed only to allow unit tests to
   * verify `bitmapReady` updates without poking through the closure. */
  __testGetState(): {
    bitmapReady: ReadonlySet<string>;
    bitmapFailed: ReadonlySet<string>;
    bitmapReadyTime: ReadonlyMap<string, number>;
    frameCounter: number;
    inFlightCount: number;
  };
};
