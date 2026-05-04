/**
 * thumbnailSubsystem — owns the entire galaxy-thumbnail pipeline.
 *
 * Before this module existed, ~280 lines of per-frame body sprawled
 * inside `engine.ts`'s `frame()` plus another ~70 lines of init in the
 * async startup IIFE.  Six closure variables (`atlas`, `queue`,
 * `frameCounter`, `bitmapReady`, `bitmapFailed`, `bitmapReadyTime`)
 * tied together one cohesive responsibility — atlas-slot allocation,
 * priority-queued image fetch, idempotent failure memoisation, and
 * back-to-front sorted QuadInstance/DiskInstance emission.  Pulling
 * the whole pipeline into a single module is the largest readability
 * win in the engine.
 *
 * ### Why a closure-returning factory rather than a class?
 *
 * The Phase 1 subagent flagged "a `ThumbnailSubsystem` object that
 * owns its state and exposes `runFrame(...)` is cleaner".  A factory
 * returning a closure-keyed object matches the rest of the engine
 * (createRenderScheduler, createPickRenderer, etc.) and keeps the
 * internal state genuinely inaccessible from outside — there's no
 * `this.atlas` for a future caller to reach in and poke.  The
 * drawback (one allocation per engine instance, paid at construction)
 * is irrelevant: there's exactly one engine per page.
 *
 * ### What stays in engine.ts
 *
 * - The `galaxyTexturesEnabled` boolean — a user-facing setting that
 *   can be flipped at runtime.  The engine simply doesn't call
 *   `runFrame()` when disabled, which is cheaper than threading an
 *   "enabled?" branch through this module.  Side-effect: the LRU
 *   clock keeps ticking via `runFrame()`'s frame increment ONLY when
 *   the engine wants thumbnails — so when the user re-enables, the
 *   LRU age is "fresh" relative to when they re-enabled.  In practice
 *   this is fine: nothing else reads the clock while the toggle is
 *   off.
 *
 * - The QuadRenderer and DiskRenderer instances themselves.  The
 *   subsystem just *uses* them; it doesn't own them.  They have other
 *   consumers (selection halo, etc.) and live longer than the
 *   subsystem's runFrame() invocation.
 *
 * ### Critical invariant: retry-storm protection
 *
 * CLAUDE.md flags this as a known footgun: "the engine has BOTH a
 * `bitmapReady` and `bitmapFailed` Set — the per-frame gate must check
 * both. The image queue's `enqueue` is idempotent for in-flight
 * keys."  The per-frame loop in `runFrame()` preserves this exactly:
 *
 *   1. Allocate atlas slot (always — the slot is needed for hover
 *      regardless of bitmap state).
 *   2. If `bitmapFailed.has(key)` → continue.  Permanent skip.
 *   3. If `bitmapReady.has(key)` → emit instance.  Else enqueue +
 *      continue.  PriorityQueue.enqueue is idempotent on in-flight
 *      keys (see its own docstring), so we don't need to track
 *      "in-flight" ourselves.
 *
 * Unit tests in `thumbnailSubsystem.test.ts` exercise each branch.
 *
 * ### Memory leak fix: onEvict
 *
 * Before this extraction, `bitmapReady` / `bitmapFailed` /
 * `bitmapReadyTime` grew without bound — the atlas's LRU recycled
 * slots but the parallel maps kept their entries.  Now we wire
 * `atlas.setEvictHandler(...)` to drop the corresponding entry from
 * all three maps the moment a slot is reused.  See the atlas's own
 * docstring on `setEvictHandler` for the correctness rationale.
 */

import { Source } from '../../data/sources';
import type { PointCloud, QuadInstance } from '../../@types';
import type { OrbitCamera } from '../../@types';
import { TextureAtlas } from '../gpu/textureAtlas';
import { PriorityQueue } from '../../utils/concurrency/priorityQueue';
import type { QuadRenderer } from '../gpu/quadRenderer';
import { DiskRenderer, type DiskInstance } from '../gpu/diskRenderer';
import { fetchGalaxyBitmap } from '../../utils/network/galaxyImageFetcher';
import { cartesianToRaDecZ } from '../../utils/math';
import type { FamousMetaEntry, FamousXrefMap } from './famousMetaLoader';
import type { mat4 } from 'gl-matrix';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Below this on-screen size, we don't bother fetching a thumbnail at all. */
const APPARENT_SIZE_THRESHOLD_PX = 24;

/**
 * Distance fade band — width (in px) above the apparent-size threshold
 * over which the smoothstep ramp from 0→1 occurs.  An 8 px band makes
 * thumbnails ramp in gradually as galaxies grow on screen rather than
 * popping at exactly the threshold pixel size.
 */
const FADE_BAND_PX = 8;

/**
 * Load fade duration (ms) — once a bitmap finishes landing in the
 * atlas, ramp from alpha 0 → 1 over this window so freshly-fetched
 * thumbnails don't replace the soft point glow with a hard JPEG square
 * in one frame.  Used both for the per-quad alpha multiplier AND to
 * gate the engine's render-on-demand "still animating" predicate.
 */
const LOAD_FADE_MS = 400;

/**
 * Largest plausible per-galaxy diameter we use to seed the cheap
 * squared-distance early-out in the per-galaxy loop.  Covers giant
 * ellipticals; smaller diameters are re-checked exactly with the
 * per-row sqrt + apparent-size compare further down.
 */
const MAX_PLAUSIBLE_DIAMETER_KPC = 200;

/**
 * Apparent-size threshold above which we use the 3D oriented disk
 * instead of the screen-aligned flat quad — at sub-4-pixel sizes the
 * inclination ellipse is perceptually indistinguishable from a
 * circle, and the cheaper quad path looks identical.
 */
const DISK_THRESHOLD_PX = 4;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Stable cache key for an atlas slot.  RA/Dec to 5 decimal places is
 * unique within ~0.1 arcsec — much finer than the SDSS pixel scale,
 * so two galaxies will never collide unless they're literally on top
 * of each other (in which case sharing a thumbnail is fine).
 */
export function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}

// ── Public types ────────────────────────────────────────────────────────────

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
  fetcher?: (args: {
    ra: number;
    dec: number;
    famousId?: string;
  }) => Promise<ImageBitmap | null>;
};

/**
 * Per-frame inputs.  Everything the inner loop reads from the engine's
 * closure today is forwarded here as an explicit parameter — no hidden
 * coupling.  The subsystem reads (not writes) every field.
 */
export type ThumbnailFrameInput = {
  /** Active orbit camera.  Apparent-size and visibility cull both rely on it. */
  cam: OrbitCamera;
  /** All loaded clouds keyed by Source enum.  Hidden surveys are filtered inside. */
  clouds: Map<Source, PointCloud>;
  /** Bitmask of currently-visible sources (1 bit per Source enum value). */
  visibleSourceMask: number;
  /** Canvas backing-store size in CSS pixels — feeds the pinhole pxPerRad. */
  canvasSize: { width: number; height: number };
  /** Render-pass encoder — quadRenderer + diskRenderer encode their draws here. */
  pass: GPURenderPassEncoder;
  /** Combined view+projection matrix for the current camera. */
  viewProj: mat4;
  /** pre-computed `canvas.height / (2 · tan(fovY/2))` to share with engine. */
  pxPerRad: number;
  /** Camera world-position snapshot for the back-to-front sort comparator. */
  camPos: Readonly<[number, number, number]>;
  /** QuadRenderer instance — engine owns it; subsystem just calls draw(). */
  quadRenderer: QuadRenderer;
  /** DiskRenderer instance — same ownership story as quadRenderer. */
  diskRenderer: DiskRenderer;
  /** Famous-meta sidecar, used to route Famous-source rows to curated WebPs. */
  famousMeta: FamousMetaEntry[];
  /** Famous-xrefs sidecar — currently unused inside the subsystem but kept
   * as a hook so future cross-survey badge logic can read it without
   * widening the function signature. */
  famousXrefs: FamousXrefMap;
};

export type ThumbnailSubsystem = {
  /**
   * Bind the atlas's GPU view to both renderers.  Called once after
   * the atlas's `initTexture()` completes (i.e. immediately after
   * createThumbnailSubsystem returns, but BEFORE the first
   * `runFrame`).  We don't fold this into the constructor because
   * the QuadRenderer/DiskRenderer don't exist yet at construction
   * time — they're built alongside it in engine.ts.
   */
  bindToRenderers(quadRenderer: QuadRenderer, diskRenderer: DiskRenderer): void;
  /**
   * Run the per-frame thumbnail-priority loop and emit QuadInstances
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

// ── Implementation ──────────────────────────────────────────────────────────

export function createThumbnailSubsystem(
  input: CreateThumbnailSubsystemInput,
): ThumbnailSubsystem {
  const { device, requestRender } = input;
  const fetcher = input.fetcher ?? fetchGalaxyBitmap;

  const atlas = new TextureAtlas(device);
  atlas.initTexture();

  const queue = new PriorityQueue();

  // ── Bookkeeping sets ─────────────────────────────────────────────────────
  //
  // `bitmapReady` is the positive flag: a fetch completed AND the bitmap
  // landed in the atlas.  Without it the per-frame gate would emit a
  // QuadInstance for a slot that's still pointing at whatever was there
  // before (or a blank cleared region of the atlas).
  //
  // `bitmapFailed` is the retry-storm guard: a single permanent flag per
  // session.  Without it, every frame the per-galaxy loop would see
  // `!bitmapReady` and re-enqueue the same dead key — flooding the SDSS /
  // DSS endpoints with 404s and clogging the queue.  Treated as
  // session-permanent: a page reload retries.  See CLAUDE.md "things that
  // have bitten us" for the historical bug this fixed.
  //
  // `bitmapReadyTime` records the moment a bitmap finished landing —
  // feeds the load-fade lerp + the still-animating predicate.
  const bitmapReady = new Set<string>();
  const bitmapFailed = new Set<string>();
  const bitmapReadyTime = new Map<string, number>();

  // Wire the atlas's eviction notification to clear our parallel maps.
  // This plugs the small memory leak called out in the engine's pre-
  // refactor comment around the atlas construction.
  atlas.setEvictHandler((key) => {
    bitmapReady.delete(key);
    bitmapFailed.delete(key);
    bitmapReadyTime.delete(key);
  });

  // The LRU clock.  Incremented unconditionally inside runFrame() so it
  // stays monotonic even across engine pauses (e.g. tab backgrounded).
  let frameCounter = 0;

  // Latched at destroy() — gates the in-flight onResult callbacks so
  // their writes don't land after teardown.  Unlikely to matter in
  // practice (StrictMode unmount + remount races), but cheap insurance.
  let destroyed = false;

  // The renderer-binding step is split out so the construction order in
  // engine.ts can remain "atlas first, renderers second"; both renderers
  // need the atlas's texture view, which only exists after initTexture().
  let bound = false;

  function bindToRenderers(
    quadRenderer: QuadRenderer,
    diskRenderer: DiskRenderer,
  ): void {
    quadRenderer.bindAtlas(atlas.getTextureView());
    diskRenderer.bindAtlas(atlas.getTextureView());
    bound = true;
  }

  function runFrame(frameInput: ThumbnailFrameInput): void {
    if (destroyed) return;
    if (!bound) return; // Bindings must be in place; defensive guard.

    const {
      cam,
      clouds,
      visibleSourceMask,
      canvasSize,
      pass,
      viewProj,
      pxPerRad,
      camPos,
      quadRenderer,
      diskRenderer,
      famousMeta,
    } = frameInput;

    frameCounter++;

    // ── Per-frame constants, hoisted out of the per-galaxy loop ──────────
    //
    // The earlier inline implementation called `apparentSizePx({...})` once
    // per galaxy, which (with 3.5 M galaxies/frame) burned ~350 ms per
    // frame on object-literal allocation, function-call overhead, and a
    // Math.tan that only depends on the camera's frame-constant fov.
    //
    // We hoist the constant chain into one scalar (pxPerRad — provided by
    // the engine because it shares it with the points pass).  Then we
    // derive a closed-form `maxCamDistForVisibilityUpper` so the inner
    // check becomes a cheap squared-distance compare instead of a
    // Math.hypot + division + compare.
    //
    // The per-galaxy diameter read + sqrt only happens AFTER the cheap
    // cull eliminates the absolute majority of off-screen rows.

    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    const maxCamDistForVisibilityUpper =
      (dMpcMax * pxPerRad) / APPARENT_SIZE_THRESHOLD_PX;
    const maxCamDistSqUpper =
      maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const quads: QuadInstance[] = [];
    // Disks accumulate alongside quads.  We sort each galaxy into exactly
    // one bucket (see the branch at the tail of the loop body) so the two
    // arrays never double-count an instance.
    const disks: DiskInstance[] = [];

    const nowMs = performance.now();

    // ── Per-cloud loop ──────────────────────────────────────────────────
    //
    // Iterate with `.entries()` so `cloudSource` is in scope for the
    // Famous-source bypass: famous landmarks always show their curated
    // thumbnail regardless of apparent angular size.
    for (const [cloudSource, cloud] of clouds.entries()) {
      // Honour the user's visibility-mask: if a survey is toggled off we
      // shouldn't be enqueueing thumbnails for galaxies the points pass
      // will skip — otherwise hidden surveys' quads would fill the atlas
      // and ghost across the scene.
      if (((visibleSourceMask >> cloudSource) & 1) === 0) continue;

      const positions = cloud.positions;
      const count = cloud.count;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = positions[i3 + 0]!;
        const y = positions[i3 + 1]!;
        const z = positions[i3 + 2]!;

        // Squared-distance early-out — single biggest perf win in the
        // loop.  Skips ~99.9% of galaxies before we pay for the sqrt.
        const dx = cx - x;
        const dy = cy - y;
        const dz = cz - z;
        const camDistSq = dx * dx + dy * dy + dz * dz;
        if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

        // Survived the cheap cull; pay for the per-galaxy diameter read,
        // sqrt, and exact apparent-size compare.
        const dKpcRow = cloud.diameterKpc[i]!;
        const dMpcRow = dKpcRow / 1000;
        const camDist = Math.sqrt(camDistSq);
        const px = (dMpcRow / camDist) * pxPerRad;

        // Famous-atlas rows always show their thumbnail — landmarks the
        // user expects visible regardless of angular size.  Survey rows
        // gate on the threshold so we don't load 3.5 M cutouts at maximum
        // zoom-out.
        if (cloudSource !== Source.Famous && px < APPARENT_SIZE_THRESHOLD_PX) continue;

        // Recover RA/Dec for the cutout URL.  PointCloud only stores
        // Cartesian Mpc — invert the Hubble-law conversion that was
        // applied at import time.
        const [ra, dec] = cartesianToRaDecZ(x, y, z);
        const key = galaxyCacheKey(ra, dec);

        // Allocate (or refresh) an atlas slot.  Idempotent for repeat
        // frames — same key returns the same slot index and bumps the
        // LRU clock so the entry isn't evicted while still on screen.
        // If the atlas is full, this triggers an LRU eviction which
        // fires `onEvict` (cleaning bitmapReady/Failed/Time for the
        // ousted key — see the setEvictHandler call above).
        const slot = atlas.allocate(key, frameCounter);

        // ── Retry-storm guard ──
        //
        // If we've already failed to fetch this galaxy (404 / CORS /
        // decode error), don't try again this session.  Without this
        // gate we'd re-enqueue the same dead key every frame.  Survives
        // the extraction unchanged — one of the project's known
        // footguns (CLAUDE.md "things that have bitten us").
        if (bitmapFailed.has(key)) continue;

        // If we don't have a bitmap yet, kick off a fetch.  The queue
        // dedupes on in-flight keys (see PriorityQueue.enqueue
        // docstring); re-enqueuing only refreshes priority for a still-
        // pending entry.  Priority = apparent-size px so big galaxies
        // load first.
        if (!bitmapReady.has(key)) {
          // Capture stable copies of the closure bindings the fetcher
          // and onResult will use.  `cloudSource` and `i` are stable
          // because the queue calls each fetcher exactly once per key.
          const sourceForFetch = cloudSource;
          const idxForFetch = i;
          queue.enqueue({
            key,
            priority: px,
            fetcher: () => {
              // Famous galaxies use a curated local WebP rather than
              // the SDSS/DSS chain.
              const fId =
                sourceForFetch === Source.Famous
                  ? famousMeta[idxForFetch]?.id
                  : undefined;
              return fetcher({ ra, dec, famousId: fId });
            },
            onResult: (bitmap) => {
              // Engine destroyed mid-fetch — drop the result.
              if (destroyed) {
                bitmap?.close();
                return;
              }
              if (!bitmap) {
                // Both SDSS and DSS failed (or the decode threw).
                // Memoise the failure so the per-frame loop stops
                // re-enqueueing this key.
                bitmapFailed.add(key);
                // Wake one frame so the still-animating predicate
                // re-checks queue.inFlightCount() and the loop can
                // sleep if this was the last in-flight fetch.
                requestRender();
                return;
              }
              // Slot may have been reassigned by LRU between enqueue
              // and fetch resolution.  `lastSeenFrame` returns
              // undefined for keys not currently in the atlas (i.e.
              // evicted before our async fetch resolved); in that case
              // we drop the bitmap.
              if (atlas.lastSeenFrame(key) === undefined) {
                bitmap.close();
                requestRender();
                return;
              }
              atlas.uploadBitmap(slot, bitmap);
              bitmapReady.add(key);
              bitmapReadyTime.set(key, performance.now());
              bitmap.close();
              // Wake the loop so the freshly-uploaded thumbnail
              // appears on the next frame.  The load-fade lerp needs
              // the loop ticking for the duration of the fade —
              // handled by the still-animating predicate.
              requestRender();
            },
          });
          continue; // no quad this frame — wait for the bitmap to land
        }

        // ── Pack the QuadInstance / DiskInstance ───────────────────────
        //
        // 4× the per-galaxy diameter gives the quad visual presence
        // without dwarfing the surrounding dot field — same multiplier
        // as the GALAXY_RADIUS_MPC formula in points.wgsl, so the soft-
        // glow dot and the textured thumbnail occupy identical screen
        // real-estate at the texture-load fade-in moment.
        const sizeWorldMpc = (dKpcRow / 1000) * 4;
        const [u0, v0, u1, v1] = atlas.slotUv(slot);

        // ── Fade-in multipliers ──
        //
        // Two fades combine to keep thumbnails from popping in:
        //
        //  1. Distance fade — smoothstep across an 8 px band above the
        //     apparent-size threshold so a galaxy that just crossed the
        //     threshold (≈ 24 px) emerges gradually as the camera zooms
        //     further in (~32 px).
        //  2. Load fade — once a bitmap finishes landing in the atlas,
        //     ramp from 0 to 1 over LOAD_FADE_MS so freshly-uploaded
        //     thumbnails don't replace the soft point glow with a hard
        //     JPEG square in one frame.
        //
        // Multiplied together so a galaxy that crosses the distance
        // threshold AND has just landed its bitmap fades twice (once
        // from each axis); galaxies that have been ready for a while
        // only see the distance fade.
        const distT = Math.min(
          1,
          Math.max(0, (px - APPARENT_SIZE_THRESHOLD_PX) / FADE_BAND_PX),
        );
        // Smoothstep cubic — matches WGSL's smoothstep shape.
        const distFade = distT * distT * (3 - 2 * distT);
        const tReady = bitmapReadyTime.get(key);
        const loadFade =
          tReady === undefined
            ? 0
            : Math.min(1, (nowMs - tReady) / LOAD_FADE_MS);
        const fadeAlpha = distFade * loadFade;

        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;
        // 3D disk path: only when (a) the apparent size is large enough
        // that the inclination ellipse is perceptually distinguishable
        // from a circle, and (b) the orientation values are finite
        // (defensive — the build pipeline guarantees this, but a
        // corrupted cache could flip them to NaN, in which case we fall
        // back to a flat quad rather than render a NaN-projected mess).
        if (px > DISK_THRESHOLD_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
          disks.push({
            x,
            y,
            z,
            sizeWorld: sizeWorldMpc,
            u0,
            v0,
            u1,
            v1,
            axisRatio: ar,
            positionAngleDeg: pa,
            fadeAlpha,
          });
        } else {
          quads.push({
            x,
            y,
            z,
            sizeWorld: sizeWorldMpc,
            u0,
            v0,
            u1,
            v1,
            fadeAlpha,
          });
        }
      }
    }

    // ── Back-to-front sort for correct alpha compositing ────────────────
    //
    // Both QuadRenderer and DiskRenderer use premultiplied "over"
    // blending, which is order-dependent: a far galaxy drawn AFTER a near
    // one composites on top of it, breaking the painter's expectation.
    // We sort each list by descending camera-distance² so far galaxies
    // emit first and near ones overlay them correctly.
    //
    // O(N log N) per frame with N ≤ SLOT_COUNT (256), so the sort cost is
    // well under a millisecond even on mobile GPUs; way cheaper than a
    // depth-sorted GPU pass.
    const cmpFar = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ): number => {
      const dax = a.x - camPos[0];
      const day = a.y - camPos[1];
      const daz = a.z - camPos[2];
      const dbx = b.x - camPos[0];
      const dby = b.y - camPos[1];
      const dbz = b.z - camPos[2];
      return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
    };
    quads.sort(cmpFar);
    disks.sort(cmpFar);

    if (quads.length > 0) {
      quadRenderer.draw(
        pass,
        viewProj,
        [canvasSize.width, canvasSize.height],
        quads,
        camPos,
        pxPerRad,
      );
    }
    if (disks.length > 0) {
      diskRenderer.draw(
        pass,
        viewProj,
        [canvasSize.width, canvasSize.height],
        camPos,
        disks,
      );
    }
  }

  function hasInFlightFetches(): boolean {
    if (queue.inFlightCount() > 0) return true;
    // Recently-loaded thumbnails fade in over LOAD_FADE_MS; keep the loop
    // ticking while any fade is still in progress so the alpha lerp ramps
    // smoothly without the user having to nudge the mouse.
    if (bitmapReadyTime.size === 0) return false;
    const nowMs = performance.now();
    for (const t of bitmapReadyTime.values()) {
      if (nowMs - t < LOAD_FADE_MS) return true;
    }
    return false;
  }

  function destroy(): void {
    destroyed = true;
    atlas.setEvictHandler(undefined);
    bitmapReady.clear();
    bitmapFailed.clear();
    bitmapReadyTime.clear();
  }

  return {
    bindToRenderers,
    runFrame,
    hasInFlightFetches,
    destroy,
    __testGetState() {
      return {
        bitmapReady,
        bitmapFailed,
        bitmapReadyTime,
        frameCounter,
        inFlightCount: queue.inFlightCount(),
      };
    },
  };
}
