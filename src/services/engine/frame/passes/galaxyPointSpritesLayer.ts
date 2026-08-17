/**
 * galaxyPointSpritesLayer — instanced point-billboard draw, the headline
 * HDR content layer.
 *
 * ### What it draws
 *
 * Every loaded galaxy from every visible source rendered as a
 * screen-space-aligned billboard with magnitude-driven size and a
 * per-source colour-index mapping.  Pure additive blending against
 * the HDR offscreen target — overlap regions naturally bloom bright
 * before tone-mapping compresses them back to displayable range.
 *
 * ### When it draws
 *
 * Always — there's no user-facing toggle for "hide all the points".
 * Per-source visibility is gated inside the shader via the
 * `visibleSourceMask` uniform, so disabling SDSS is a 4-byte uniform
 * write, not a CPU-side skip. (The renderer's own per-source loop skips
 * a source whose resolved fade opacity is exactly 0 — see
 * `galaxyPointRenderer.draw` — which is what keeps a completed deep-zoom
 * survey fade from rasterizing millions of alpha-0 instances.)
 *
 * ### What it reads
 *
 * - `ctx.galaxyPointRenderer` — the bootstrap-narrowed `GalaxyPointRenderer`
 * - `view.vp` — this layer's resolved view-projection matrix
 * - `view.viewportPx` — backing-store viewport dimensions
 * - `view.camPos` — camera position, fed to the shader's parallax
 *   + brightness terms
 * - `ctx.drawPxPerRad` — radian→pixel scale for apparent-size
 *   computation (slab-invariant; no `SlabView` equivalent)
 * - `ctx.visibleSourceMask` — bitmask of currently-visible source codes
 * - `state.settings.galaxyCatalogs.{sizePx,brightness,provenance,depthFade}`
 *   — point-billboard appearance knobs
 * - `state.settings.bias.{mode,absMagLimit}` — luminosity-bias correction
 * - `state.selection.select` — structured selection ref translated to the
 *   packed u32 the shader compares per vertex
 * - `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` —
 *   module constants from `proceduralDiskSubsystem`; kept in one place so
 *   the fade-in band (disks layer) and fade-out band (points layer) can't
 *   drift apart and recreate the double-bright donut artefact
 *
 * ### Selection-packed encoding
 *
 * The shader expects a single u32 in the form
 * `(sourceCode << 27) | localIdx` to identify the selected galaxy
 * (or `0xFFFFFFFF` for "nothing selected").  Settings carries the
 * structured `{ source, localIdx } | null` shape; we translate to
 * the packed u32 here so settings stays in plain-TS-land and the
 * shader sees a single integer.  `0xFFFFFFFF` is the sentinel: the
 * max u32, well outside any realistic packed identity (the top 5
 * bits would have to encode source code 31, which we don't allocate).
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { Source } from '../../../../data/sources';
import { packSelection, SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import { galaxyCatalogIdOf } from '../../../../utils/galaxyCatalogIdOf';
import { pickUniformBytesOf } from '../../helpers/pickUniformBytesOf';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../../data/galaxyLodBands';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';

export const galaxyPointSpritesLayer: ContentLayer = {
  name: 'point-sprites',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  // Always-on.  Per-source visibility is shader-side (uniform mask),
  // not CPU-side gating.
  enabled() {
    return true;
  },

  draw(pass, view, ctx, state) {
    const { galaxyPointRenderer, drawPxPerRad } = ctx;

    // Deep-zoom survey fade: the survey point clouds recede as the camera
    // descends toward the solar system, yielding once the local starfield
    // fills the near field. Keyed on distance from the heliocentric render
    // origin (NOT cam.distance, the orbit-to-focus radius). Spatial, so it is
    // the same for every source this frame — compute it ONCE here, not
    // per-source inside the closure.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);

    // Pack the galaxy selection into the u32 the shader compares
    // against per-vertex `(sourceCode << 27u) | instance_index`.
    // Structure targets don't light up galaxy halos, so they map to the
    // "nothing selected" sentinel.
    const selected = state.selection.select;
    const selectedPacked =
      selected !== null && selected.type === 'galaxyCatalog'
        ? packSelection(selected.source, selected.index)
        : SELECTION_NONE_SENTINEL;

    // Capture the fade registry + the frame clock once so the per-source
    // closure below reads a single shared timestamp.
    const nowMs = ctx.nowMs;
    const fades = state.subsystems.fades;

    galaxyPointRenderer.draw(pass, view.vp, view.viewportPx, {
      pointSizePx: state.settings.galaxyCatalogs.sizePx,
      brightness: state.settings.galaxyCatalogs.brightness,
      selectedPacked,
      visibleSourceMask: ctx.visibleSourceMask,
      camPosWorld: view.camPos,
      pxPerRad: drawPxPerRad,
      provenance: state.settings.galaxyCatalogs.provenance,
      biasMode: state.settings.bias.mode,
      absMagLimit: state.settings.bias.absMagLimit,
      depthFadeEnabled: state.settings.galaxyCatalogs.depthFade,
      sbScale: state.settings.galaxyCatalogs.sbScale,
      sbMax: state.settings.galaxyCatalogs.sbMax,
      falloffStrength: state.settings.galaxyCatalogs.falloffStrength,
      // The points-layer fragment fades alpha to zero across the same
      // apparent-pixel-size band the procedural-disk layer fades IN over.
      // Both thresholds come from one source of truth so they can't drift
      // apart and re-introduce the double-bright donut artefact.
      pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
      // Shared cluster-focus bind group (@group(3)). The engine owns the
      // single focus buffer (written once per frame in renderFrame); we
      // bind its group. At rest (blend 0) the shader multiplier is 1.0.
      focusBindGroup: state.gpu.focusUniform!.bindGroup,
      // Look up the FadeRegistry opacity for each source at this frame's
      // timestamp. The renderer calls back with the numeric source code of
      // each loaded catalog; resolve it to the catalog's string id (the
      // registry's fade-id discriminator). The registry returns 1.0 for
      // unregistered handles — a safe fallback so a source that hasn't
      // registered yet renders at full opacity rather than disappearing.
      // The frame-wide deep-zoom survey fade (hoisted above) multiplies in
      // on top for every SURVEY source — both factors are in [0, 1], and the
      // pass is additive, so a 0 product means invisible. The famous catalog
      // is exempt: its ~20 curated galaxies stay visible inside the Milky Way
      // and near Earth as reference points, so the deep zoom keeps its
      // landmarks while the millions of survey points yield.
      fadeOpacityOf: (source) =>
        fades.opacityOf({ kind: 'galaxyCatalog', id: galaxyCatalogIdOf(source) }, nowMs) *
        (source === Source.FamousGalaxy ? 1 : surveyFade),
    });
  },

  // Pick aspect — the point half of the pick pass. Re-runs the SAME
  // instanced billboard geometry through the r32uint pick pipeline, which
  // writes a packed hit id `(sourceCode << 27) | localIdx` instead of
  // colour. Delegates to `pickRenderer.drawPoints`; the pick camera is
  // rebuilt as a value by `pickUniformBytesOf` (same byte layout as the
  // visual pack, minus the selection identity — the pick fragment writes
  // its own hit id).
  //
  // ### @group(0) prefix contract
  //
  // This row is first among the cosmological pickables in the registry,
  // and `drawPoints` uploads + binds @group(0) (the pick CameraUniforms)
  // even with zero sources. The ring / disk pick pipelines read that same
  // @group(0) prefix, so point-sprites running first — and always leaving
  // slot 0 pointing at the fresh pick camera — is load-bearing, not
  // incidental ordering. (The Milky-Way pick left this pass for NEAR0 and
  // binds its own slot-0 camera there.)
  //
  // ### Mask semantics
  //
  // `ctx.visibleSourceMask` is the PICK mask here: the pick program builds
  // its ctx via `pickFrameContext`, which passes `deriveSourceMasks(state).pick`
  // as the mask. Filtering `loadedSources()` by it is the pick gate — a
  // fading-out catalog clears its bit and immediately stops claiming hits.
  // The deep-zoom survey fade composes into the same gate: a survey source
  // whose band-multiplied opacity has reached exactly 0 is invisible, so it
  // must not claim hits either (invisible → unpickable, the same coherence
  // the Milky-Way gate keeps). The famous catalog is exempt, mirroring the
  // visual draw — its galaxies stay visible at deep zoom, so they stay
  // pickable.
  //
  // `drawPoints` is called even when the filter empties the list — the
  // @group(0) pick-camera upload/bind it performs is the prefix contract
  // above, and the ring / disk pick pipelines still need it.
  drawPick(pass, view, ctx, state) {
    if (state.gpu.pickRenderer === null) return;
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);
    const fades = state.subsystems.fades;
    const sources = Array.from(ctx.galaxyPointRenderer.loadedSources()).filter((s) => {
      if (((ctx.visibleSourceMask >> s.source) & 1) === 0) return false;
      const opacity =
        fades.opacityOf({ kind: 'galaxyCatalog', id: galaxyCatalogIdOf(s.source) }, ctx.nowMs) *
        (s.source === Source.FamousGalaxy ? 1 : surveyFade);
      return opacity !== 0;
    });
    state.gpu.pickRenderer.drawPoints(pass, sources, pickUniformBytesOf(view, ctx, state));
  },
};
