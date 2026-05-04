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
import { pickColourIndex } from '../../data/colourIndex';
import type { PointCloud, QuadInstance } from '../../@types';
import type { OrbitCamera } from '../../@types';
import { TextureAtlas } from '../gpu/textureAtlas';
import { PriorityQueue } from '../../utils/concurrency/priorityQueue';
import type { QuadRenderer } from '../gpu/quadRenderer';
import { DiskRenderer, type DiskInstance } from '../gpu/diskRenderer';
import { ProceduralDiskRenderer } from '../gpu/proceduralDiskRenderer';
import type { ProceduralDiskInstance } from '../../@types/ProceduralDiskInstance';
import { fetchGalaxyBitmap } from '../../utils/network/galaxyImageFetcher';
import { cartesianToRaDecZ } from '../../utils/math';
import type { FamousMetaEntry, FamousXrefMap } from './famousMetaLoader';
import type { mat4 } from 'gl-matrix';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Below this on-screen size, we don't bother fetching a thumbnail at all. */
const APPARENT_SIZE_THRESHOLD_PX = 24;

/**
 * Procedural-disk crossfade band, in apparent-pixels.
 *
 *   - Below `PROCEDURAL_DISK_FADE_START_PX` (8): only the screen-aligned
 *     point billboard renders.  Distant galaxies look like soft glows.
 *   - Inside the band [8, 14): both passes render simultaneously with
 *     complementary alphas (smoothstep crossfade).
 *   - Above `PROCEDURAL_DISK_FADE_END_PX` (14): only the procedural
 *     disk renders.  The point pass has fully faded out.
 *
 * Picking these specific values:
 *
 *   - The band's lower edge (8) is roughly where a screen-aligned point
 *     starts to look pixelated rather than a clean glow — bigger than
 *     that, the eye expects to see structure.
 *   - The band width (6 px) is wide enough that the crossfade is
 *     visually smooth at typical zoom rates and narrow enough that
 *     there's a clean "all disk" regime.
 *   - The upper edge (14) is well below the existing
 *     APPARENT_SIZE_THRESHOLD_PX = 24 (the textured-disk threshold,
 *     declared just above), so the procedural impostor takes over long
 *     before the textured one would have engaged — exactly the
 *     visibility gap this feature exists to fill.
 *
 * Exported because two consumers read them: this module's per-frame
 * emission code (Task 7) gates the procedural-disk instance push and
 * computes `crossfadeAlpha`; the engine's point-pass uniform setup
 * (Task 8) hands them to the points shader so the soft-glow fade-out
 * stays exactly complementary to this fade-in.  Keeping them in one
 * module prevents accidental drift between the two passes.
 */
export const PROCEDURAL_DISK_FADE_START_PX = 8;
export const PROCEDURAL_DISK_FADE_END_PX = 14;

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

/**
 * Decide whether (and how) to emit a per-frame ProceduralDiskInstance for
 * a single galaxy.  Returns the populated instance, or `null` when the
 * galaxy fails any of the gates: too small on screen, or missing the
 * orientation data the procedural-disk shader needs.
 *
 * ### Why a pure helper rather than inline branching
 *
 * The runtime call lives deep inside `runFrame`'s per-galaxy loop, which
 * isn't directly reachable from a unit test (it requires a full WebGPU
 * device, an engine bootstrap, and a pre-loaded cloud).  Lifting the
 * decision into a pure function lets the test suite exercise the branch
 * boundaries — the `px > fadeStart` gate, the `Number.isFinite`
 * orientation guard, the smoothstep crossfade math — without standing
 * up the whole engine.  The runtime path then calls this same helper
 * inside the loop, so anything proved by the test holds for the live
 * frame too.
 *
 * ### Why the smoothstep shape matches WGSL `smoothstep`
 *
 * The points-pass fragment shader (Task 8 of the procedural-disk plan)
 * fades the screen-aligned billboard out across the same `[fadeStart,
 * fadeEnd]` band using WGSL's built-in `smoothstep(start, end, x)` —
 * which is exactly `t * t * (3 - 2 * t)` for `t = clamp((x - start) /
 * (end - start), 0, 1)`.  We reproduce that cubic bit-for-bit here so
 * the procedural-disk fade-IN and the points-pass fade-OUT sum to
 * identically 1.0 across the band.  The user's earlier "double-bright
 * donut" / "gap in the crossfade" reports were both caused by the two
 * curves disagreeing on the band's px scale; keeping the smoothstep
 * shape symmetric closes the loop.
 *
 * ### Position / size are passed as scalars, not a vec3 + length
 *
 * The caller already has `x`, `y`, `z` in cartesian world units (and
 * `sizeWorldMpc`) decomposed for its own bookkeeping; rebuilding a
 * vec3 here just to destructure it again into the returned struct
 * would be needless allocation in the hot loop.  Tests pass them as
 * literals.
 */
export function maybeEmitProceduralDisk(
  px: number,
  ar: number,
  pa: number,
  x: number,
  y: number,
  z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  fadeStartPx: number,
  fadeEndPx: number,
): ProceduralDiskInstance | null {
  // Apparent-size gate.  Strictly `>` so the band lower edge is exclusive,
  // matching the original inline check; tests pin this with `8.0001` vs.
  // `8.0` to catch a future flip to `>=`.
  if (px <= fadeStartPx) return null;
  // Orientation guard.  PointCloud columns can carry NaN sentinels for
  // sources without orientation data (synthetic, partial 2MRS rows); we
  // can't render an oriented disk without both, so skip rather than
  // emitting a shader-NaN.
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;

  // Smoothstep over the [fadeStartPx, fadeEndPx] band — see the
  // doc-comment above for why this exact cubic.
  const t = Math.min(
    1,
    Math.max(0, (px - fadeStartPx) / (fadeEndPx - fadeStartPx)),
  );
  const crossfadeAlpha = t * t * (3 - 2 * t);
  return {
    x,
    y,
    z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex,
    crossfadeAlpha,
  };
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
    quadRenderer: QuadRenderer,
    diskRenderer: DiskRenderer,
    proceduralDiskRenderer: ProceduralDiskRenderer,
  ): void;
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
  // engine.ts can remain "atlas first, renderers second"; both texture-
  // sampling renderers need the atlas's texture view, which only exists
  // after initTexture().
  //
  // The procedural-disk renderer doesn't sample the atlas (it's
  // synthesised in the fragment shader from `colourIndex` +
  // `crossfadeAlpha`), so no bindAtlas call for it.  We stash it as a
  // module-private `let` here so `runFrame` can issue its draw alongside
  // the quad/disk passes without widening the per-frame
  // `ThumbnailFrameInput` type.  The two existing renderers stay on
  // `ThumbnailFrameInput` for backward-compat with the pre-extraction
  // call sites in renderFrame.ts; the procedural-disk renderer is new,
  // so the simpler closure-stash pattern is fine.
  let bound = false;
  let proceduralDiskRendererRef: ProceduralDiskRenderer | null = null;

  function bindToRenderers(
    quadRenderer: QuadRenderer,
    diskRenderer: DiskRenderer,
    proceduralDiskRenderer: ProceduralDiskRenderer,
  ): void {
    quadRenderer.bindAtlas(atlas.getTextureView());
    diskRenderer.bindAtlas(atlas.getTextureView());
    proceduralDiskRendererRef = proceduralDiskRenderer;
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
    // ProceduralDiskInstances accumulate independently — unlike the
    // quad/disk dichotomy (which is mutually exclusive per galaxy), a
    // single galaxy in the 8-14 px crossfade band emits BOTH a point
    // sprite (with fading-out alpha) and a procedural disk (with
    // fading-in alpha).  Above 24 px the textured disk takes over, but
    // the procedural disk continues to render too — its `crossfadeAlpha`
    // saturates at 1.0 for px > 14, so it draws underneath the
    // higher-fidelity textured pass.  The procedural pass is intended
    // as a fallback for the visibility gap between the point and the
    // texture, so a small amount of overdraw at very large sizes is
    // acceptable.
    const proceduralDisks: ProceduralDiskInstance[] = [];

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
        // gate on the LOWER of the textured-thumbnail threshold (24 px)
        // and the procedural-disk fade-in start (8 px), because the
        // procedural-disk pass needs to enter the loop body for any
        // galaxy above 8 px to emit a crossfade instance.  The
        // bitmap-fetch + Quad/Disk push code below is then re-gated on
        // the unchanged 24 px threshold so we don't swamp the priority
        // queue with fetch requests for barely-visible galaxies.
        const minPxForLoopEntry = Math.min(
          APPARENT_SIZE_THRESHOLD_PX,
          PROCEDURAL_DISK_FADE_START_PX,
        );
        if (cloudSource !== Source.Famous && px < minPxForLoopEntry) continue;

        // Bind orientation + size up-front: both the textured-disk path
        // (gated on px ≥ 24) and the procedural-disk emission (gated on
        // px > 8) need them.  Reading a Float32Array element is cheap;
        // we'd be paying for it inside both branches anyway, so hoist.
        //
        // 4× the per-galaxy diameter gives the rendered impostor visual
        // presence without dwarfing the surrounding dot field — same
        // multiplier as the GALAXY_RADIUS_MPC formula in points.wgsl, so
        // the soft-glow dot and the impostor occupy identical screen
        // real-estate at the texture-load fade-in moment.
        const sizeWorldMpc = (dKpcRow / 1000) * 4;
        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;

        // ── Bitmap-fetch + textured-quad/disk push ────────────────────
        //
        // Re-gate on the original 24 px threshold so the priority queue
        // doesn't get flooded with fetch requests for barely-visible
        // galaxies.  Below 24 px, only the procedural-disk path below
        // can fire.
        if (px >= APPARENT_SIZE_THRESHOLD_PX || cloudSource === Source.Famous) {
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
          // gate we'd re-enqueue the same dead key every frame.  Note:
          // we use a labelled-style early skip — instead of `continue`
          // (which would also skip the procedural-disk emission below),
          // we wrap the bitmap path in another `if`.  This preserves
          // the retry-storm protection while still allowing the
          // procedural disk to render for galaxies whose bitmap fetch
          // permanently failed.
          if (!bitmapFailed.has(key)) {
            // If we don't have a bitmap yet, kick off a fetch.  The
            // queue dedupes on in-flight keys (see PriorityQueue.enqueue
            // docstring); re-enqueuing only refreshes priority for a
            // still-pending entry.  Priority = apparent-size px so big
            // galaxies load first.
            if (!bitmapReady.has(key)) {
              // Capture stable copies of the closure bindings the
              // fetcher and onResult will use.  `cloudSource` and `i`
              // are stable because the queue calls each fetcher exactly
              // once per key.
              const sourceForFetch = cloudSource;
              const idxForFetch = i;
              queue.enqueue({
                key,
                priority: px,
                fetcher: () => {
                  // Famous galaxies use a curated local WebP rather
                  // than the SDSS/DSS chain.
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
                    // re-checks queue.inFlightCount() and the loop
                    // can sleep if this was the last in-flight fetch.
                    requestRender();
                    return;
                  }
                  // Slot may have been reassigned by LRU between
                  // enqueue and fetch resolution.  `lastSeenFrame`
                  // returns undefined for keys not currently in the
                  // atlas (i.e. evicted before our async fetch
                  // resolved); in that case we drop the bitmap.
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
                  // appears on the next frame.  The load-fade lerp
                  // needs the loop ticking for the duration of the
                  // fade — handled by the still-animating predicate.
                  requestRender();
                },
              });
              // Bitmap not ready yet — no quad/disk this frame.  Fall
              // through to the procedural-disk emission below so the
              // user still sees something while the fetch is in
              // flight.
            } else {
              // ── Pack the QuadInstance / DiskInstance ─────────────
              const [u0, v0, u1, v1] = atlas.slotUv(slot);

              // ── Fade-in multipliers ──
              //
              // Two fades combine to keep thumbnails from popping in:
              //
              //  1. Distance fade — smoothstep across an 8 px band
              //     above the apparent-size threshold so a galaxy
              //     that just crossed the threshold (≈ 24 px) emerges
              //     gradually as the camera zooms further in (~32 px).
              //  2. Load fade — once a bitmap finishes landing in the
              //     atlas, ramp from 0 to 1 over LOAD_FADE_MS so
              //     freshly-uploaded thumbnails don't replace the
              //     soft point glow with a hard JPEG square in one
              //     frame.
              //
              // Multiplied together so a galaxy that crosses the
              // distance threshold AND has just landed its bitmap
              // fades twice (once from each axis); galaxies that have
              // been ready for a while only see the distance fade.
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

              // 3D disk path: only when (a) the apparent size is
              // large enough that the inclination ellipse is
              // perceptually distinguishable from a circle, and
              // (b) the orientation values are finite (defensive —
              // the build pipeline guarantees this, but a corrupted
              // cache could flip them to NaN, in which case we fall
              // back to a flat quad rather than render a
              // NaN-projected mess).
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
        }

        // ── Procedural-disk emission ─────────────────────────────────
        //
        // Above PROCEDURAL_DISK_FADE_START_PX (8 px), emit a procedural-
        // disk instance with a smoothstep crossfade alpha that ramps
        // 0 → 1 across the [8, 14] band.  The points pass uses the
        // *same* smoothstep shape on the same px values to fade out (see
        // points.wgsl, hooked up in Task 8), so the two passes
        // crossfade exactly.  Above 14 px the procedural disk renders at
        // full alpha; the textured-disk pass (24+ px) overlays it with
        // higher fidelity.
        //
        // Per-galaxy colour-index plumbing.  Earlier this branch used a
        // fixed 1.0 mid-ramp fallback because PointCloud has no
        // `colourIndex` array — but `pickColourIndex(source, magU/G/R/I/Z)`
        // (used by the points-pass bake) returns the same [0, 2]-
        // normalised ramp coordinate the procedural-disk shader expects,
        // so we call it here too.  Result: the procedural disk's hue
        // matches its companion point's hue exactly.
        //
        // K-correction (kPerZ × redshift) is deliberately omitted: the
        // procedural disk only renders for galaxies above 8 px apparent
        // size, which by construction means very nearby (z ≈ 0) galaxies
        // where the K-correction is negligible.
        // Cheap pre-gate to short-circuit the colour-index lookup for the
        // ~all-but-a-handful galaxies that fail the apparent-size threshold.
        // The helper repeats this check authoritatively, but doing it here
        // first keeps `pickColourIndex` (a 5-mag-channel switch) out of the
        // hot path for the bulk of the catalog.  Per-galaxy colour-index
        // lookup lives at the call-site (not inside the helper) because the
        // magU/G/R/I/Z columns are typed-array views — keeping the helper
        // signature scalar-only makes it directly callable from the test
        // suite without fixturing a whole PointCloud.
        if (px > PROCEDURAL_DISK_FADE_START_PX) {
          const ci = pickColourIndex(
            cloudSource,
            cloud.magU[i] ?? NaN,
            cloud.magG[i] ?? NaN,
            cloud.magR[i] ?? NaN,
            cloud.magI[i] ?? NaN,
            cloud.magZ[i] ?? NaN,
          );
          const colourIndex = ci !== null ? ci.colourIndex : 1.0; // 1.0 = mid-ramp fallback
          const emitted = maybeEmitProceduralDisk(
            px,
            ar,
            pa,
            x, y, z,
            sizeWorldMpc,
            colourIndex,
            PROCEDURAL_DISK_FADE_START_PX,
            PROCEDURAL_DISK_FADE_END_PX,
          );
          if (emitted) proceduralDisks.push(emitted);
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
    proceduralDisks.sort(cmpFar);

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
    // Procedural-disk pass.  In the steady-state crossfade band [8, 14]
    // px the textured passes don't fire at all (their gate is 24 px),
    // so the procedural disk is the only impostor on screen and the
    // ordering relative to quads/disks only matters in the >24 px
    // regime where a textured bitmap has loaded.  The procedural disk's
    // `crossfadeAlpha` saturates at 1.0 above 14 px, so above 24 px
    // both impostors render — Task 11 (visual verification) will
    // confirm whether further tapering of `crossfadeAlpha` past 24 px
    // is needed; if so, that's a small change in the crossfade ramp
    // above, not a structural one here.
    if (proceduralDisks.length > 0 && proceduralDiskRendererRef !== null) {
      // mat4 from gl-matrix is a Float32Array at runtime, but TS sees a
      // distinct branded type — cast through `Float32Array` so the
      // renderer's parameter type matches without changing its public
      // signature (other call-sites in the repo pass Float32Array
      // directly).
      proceduralDiskRendererRef.draw(
        pass,
        viewProj as Float32Array,
        [canvasSize.width, canvasSize.height],
        [camPos[0], camPos[1], camPos[2]],
        pxPerRad,
        proceduralDisks,
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
