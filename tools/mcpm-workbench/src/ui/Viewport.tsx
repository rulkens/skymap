/**
 * Viewport — owns the <canvas>, the McpmHarness, the render graph and the RAF
 * loop; delegates pointer/wheel input to `createViewportInput` (../input),
 * applying its hover/drag-handle state to the box-preview draw call. Viewport
 * is the ONLY caller of `initGpu` — a second call here would race another
 * device onto the same canvas. Every rebuild goes through `requestBuild`,
 * which serialises on `buildGeneration`: one in flight, latest config wins, a
 * request arriving mid-build served on completion. Only structural changes
 * are debounced; params/run tokens/camera are live.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { AgentWeights } from '../../@types/AgentWeights';
import type { AppState } from '../../@types/AppState';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { Store } from '../../@types/Store';
import type { ScalarFieldPaletteId } from '../../../../src/@types/data/volume/ScalarFieldPaletteId';
import { initGpu, resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';
import { downloadStem } from '../export/downloadStem';
import { emitTraceSidecar } from '../export/emitTraceSidecar';
import { exportNpy } from '../export/exportNpy';
import { exportScfd } from '../export/exportScfd';
import { previewPackedTrace } from '../export/previewPackedTrace';
import { triggerDownload } from '../export/triggerDownload';
import { widenTrace } from '../export/widenTrace';
import { catalogBounds } from '../field/catalogBounds';
import { deriveAgentWeights } from '../field/deriveAgentWeights';
import { deriveGridBox } from '../field/deriveGridBox';
import { loadCatalogPoints } from '../field/loadCatalogPoints';
import { syntheticCatalog } from '../field/syntheticCatalog';
import { createViewportInput } from '../input/createViewportInput';
import { cameraViewFor } from '../render/cameraViewFor';
import { effectiveVolpathDivisor, SETTLE_MS } from '../render/effectiveVolpathDivisor';
import { createRenderGraph, type RenderGraph } from '../render/RenderGraph';
import type { TraceView } from '../render/tracePass';
import { volpathKeyFor } from '../render/volpathKeyFor';
import type { McpmCameraView } from '../render/writeMcpmCamera';
import { createMcpmHarness } from '../sim/createMcpmHarness';
import { planGridBudget } from '../sim/planGridBudget';
import {
  setCatalogBuildError,
  setCatalogLoadStatus,
  setCatalogLoaded,
  setCatalogStatusMessage,
} from '../state/slices/catalogSlice';
import { buildKey } from '../state/buildKey';
import { gridShapeKeyFor } from '../state/gridShapeKeyFor';
import { createTokenWatcher } from '../state/tokenWatcher';
import { setMaxBufferBytes, setResolvedGrid } from '../state/slices/gridSlice';
import { recordHistogramSample, resetHistogram } from '../state/slices/histogramSlice';
import { incrementStep, resetStepCount } from '../state/slices/simSlice';
import { defaultViewSlice, setFps, setPreviewPacked } from '../state/slices/viewSlice';
import { storeWriteIsDirty } from '../state/storeWriteIsDirty';
import { frameNeedsRender } from './frameNeedsRender';

// The fork's ps_volume_trace multiplies fragment rgb by 2.0; the port dropped that,
// so exposure 2 reproduces it exactly through the blit.
const EXPOSURE = 2;
const CONTRAST = 1;
const REBUILD_DEBOUNCE_MS = 400;
// How long the pending-box wireframe stays up after the last grid-shaping change.
const BOX_PREVIEW_MS = 200;
// FPS badge throttle — pushing every frame would re-render the Hud at 60Hz.
const FPS_PUSH_INTERVAL_MS = 500;
// T20: the histogram PASS runs every step (encodeStep.ts) — cheap, only nDataPoints
// invocations do real work. What's worth throttling is the READBACK: mapAsync is a
// host round trip, and every sim step already queues one GPU submission of its own.
// Steps, not wall-clock, so the convergence plot's x-axis is exact step counts.
const HISTOGRAM_INTERVAL_STEPS = 20;

const canvasStyle: CSSProperties = { display: 'block', width: '100vw', height: '100vh' };

/**
 * `?probe`-gated boot signal: probeGpuErrors.ts has no React tree to observe, so it
 * polls `__mcpmProbeReady` instead of racing the HUD's own text. T25: the same probe
 * calls `__mcpmProbeMeanLogTraceAtPoints()` for the energy smoke test — a getter, not
 * a snapshot value, so every call reads whatever the store holds at that instant.
 */
type ProbeWindow = {
  __mcpmProbeReady?: boolean;
  __mcpmProbeMeanLogTraceAtPoints?: () => number;
};

/**
 * `packedDropId`/`packedSourceName` stand in for the dropped catalog's
 * identity — cheap to JSON.stringify every store notification (incl. every
 * running-sim frame), where the override's own Float32Arrays would not be.
 * The id (not the name alone) is what actually triggers a rebuild: the
 * fork exports its packed catalog under the same default filename on every
 * run, so re-dropping a regenerated file — the realistic repeat workflow —
 * would leave a name-only key unchanged and silently starve the reload.
 */
function catalogKey(s: AppState): unknown[] {
  return [s.catalog.sources, s.catalog.tier, s.catalog.packedDropId, s.catalog.packedSourceName];
}

function traceViewFor(s: AppState, box: GridBox, cam: McpmCameraView): TraceView {
  return {
    eyeMpc: cam.eyeMpc,
    targetMpc: cam.targetMpc,
    upMpc: cam.upMpc,
    fovYRad: cam.fovYRad,
    aspect: cam.viewportPx[0] / cam.viewportPx[1],
    trimDensity: s.view.raymarch.trimDensity,
    sampleWeight: s.view.raymarch.sampleWeight,
    opticalThickness: s.view.raymarch.opticalThickness,
    stepVoxels: s.view.raymarch.stepVoxels,
    additive: s.view.raymarch.additive,
    // Scaled to the grid AND the step length, never fixed: the box diagonal is longer
    // than any axis, and sub-1 stepVoxels needs proportionally more steps — a bound
    // short of the crossing truncates the march silently, with no visual cue that it did.
    maxSteps: Math.ceil(
      (2 * Math.max(box.dims[0], box.dims[1], box.dims[2])) /
        Math.max(s.view.raymarch.stepVoxels, 0.25),
    ),
  };
}

export type ViewportProps = {
  readonly store: Store<AppState>;
};

function Viewport({ store }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Re-typed (not just narrowed) so nested closures below don't need to
    // re-check nullability — TS doesn't carry a `const` narrowing across a
    // function-declaration boundary the way it does for arrow functions.
    const canvas: HTMLCanvasElement = canvasEl;

    let disposed = false;
    let rafHandle = 0;
    let rebuildTimer = 0;
    let harness: McpmHarness | null = null;
    let renderGraph: RenderGraph | null = null;
    // Task P34: identifies THIS rebuild's device to its own `device.lost` callback —
    // reassigned the instant a NEWER rebuild acquires its device (before that
    // rebuild's harness exists), so a stale device's loss can't clobber a working
    // one's status. Mirrors the `harness !== h` staleness check the async read-back
    // paths use, one step earlier in the build (device exists, harness doesn't yet).
    let currentDevice: GPUDevice | null = null;
    let points: CatalogPoints | null = null;
    // The T16 export leg's other half of buildFromPoints' local `weights` —
    // held here so runExport (below) can reach the SAME weights the running
    // harness was seeded with, not a freshly re-derived copy.
    let latestWeights: AgentWeights | null = null;
    let loadedCatalogKey = '';
    // REQUESTED, not "last built": the frame loop notifies this subscriber every
    // frame (the step counter is store state), so the guard has to compare against
    // what a build was last asked for or every frame would request another one.
    let requestedCatalogKey = JSON.stringify(catalogKey(store.getSnapshot()));
    let requestedBuildKey = JSON.stringify(buildKey(store.getSnapshot()));
    let buildGeneration = 0;
    let building = false;
    const resetTokenWatcher = createTokenWatcher(store.getSnapshot().sim.resetToken);
    const clearTraceTokenWatcher = createTokenWatcher(store.getSnapshot().sim.clearTraceToken);
    const exportTokenWatcher = createTokenWatcher(store.getSnapshot().sim.exportToken);
    const scfdTokenWatcher = createTokenWatcher(store.getSnapshot().sim.scfdToken);
    let lastGridShapeKey = JSON.stringify(gridShapeKeyFor(store.getSnapshot()));
    let boxPreviewUntil = 0;
    // T18 preview-export view: a second TracePass over a packed-cube buffer, owned by
    // RenderGraph (attachPreviewTrace/drawPreviewTrace/disposePreviewTrace — task R7),
    // built once per false→true edge of `view.raymarch.previewPacked` (see the
    // subscriber below) rather than every frame. Viewport keeps only the buffer (its
    // own build against the harness) and the staleness snapshot: `previewPackedAtStep`
    // is the `sim.stepCount` taken the moment the pack landed; frame() drops back to
    // the live trace once `stepCount` moves past it (spec's "STALE").
    let previewBuffer: GPUBuffer | null = null;
    let previewPackedAtStep = -1;
    let lastPreviewPacked = store.getSnapshot().view.raymarch.previewPacked;
    // T20: jittered-position samples and data-point samples are differently-defined
    // statistics under the same `meanLogTraceAtPoints` name — every toggle edge clears
    // `history` (below) so the two never ride the same convergence curve.
    let lastSampleRandomly = store.getSnapshot().histogram.sampleRandomly;
    // null whenever the path tracer is off — reaching this frame with the layer freshly
    // turned on always differs from null, so enabling it always resets, per the
    // accumulation contract (task-V2A-report.md).
    let lastVolpathKey: string | null = null;
    // The palette each attached pass was BUILT with (the LUT bakes into the pass's
    // bind group at construction) — frame() re-attaches a pass when its slice value
    // moves. Set alongside the attach calls in buildFromPoints.
    let attachedRaymarchPalette: ScalarFieldPaletteId | null = null;
    let attachedVolpathPalette: ScalarFieldPaletteId | null = null;
    // Task FLE: the interaction-priority boost trigger — was camera-only (a per-frame
    // `cam` JSON comparison), now ANY UI store write (see the subscriber below), fanned
    // out to the path tracer AND raymarch divisors and the sim step cadence, all through
    // the same effectiveVolpathDivisor(userValue, msSinceInteraction) shape. -Infinity so
    // boot never reads as "mid-interaction".
    let lastInteractionMs = -Infinity;
    // -1 sentinel: skips the first frame's delta, which spans the async catalog
    // load + harness build and would otherwise seed the EMA with a huge bogus dt.
    let lastFrameTime = -1;
    let fpsEma = 0;
    let lastFpsPushTime = 0;
    let lastPushedFps = 0;
    // Task FLE: render-on-demand. Set by the store subscriber (storeWriteIsDirty,
    // fps-write excluded) and by pointer/wheel events on the canvas below; consumed
    // and cleared once per frame() tick. Starts true so a freshly (re)built harness
    // always draws its first frame.
    let dirty = true;
    let lastDirtyCheckState = store.getSnapshot();
    // Reset alongside the accumulator itself (same volpathKey edge, below) — see
    // ViewSlice.d.ts's pathTracer.sampleCap doc comment.
    let volpathSampleCount = 0;
    // Cadence throttle's own frame counter — only meaningful while sim.running; not
    // reset on rebuild, since "every Nth frame" doesn't care where N last landed.
    let simFrameCounter = 0;
    // Guards against overlapping readbacks: a mapAsync round trip can outlive the next
    // throttle boundary on a slow device, and stacking calls would only queue more of
    // the same expensive wait.
    let histogramInFlight = false;

    // T25: `store` is the App.tsx-memoized instance for this component's whole
    // lifetime, so installing the getter once here (rather than per-build) is enough.
    if (hasUrlGate('probe')) {
      (window as unknown as ProbeWindow).__mcpmProbeMeanLogTraceAtPoints = () =>
        store.getSnapshot().histogram.meanLogTraceAtPoints;
    }

    /** Frees the T18 preview pass (RenderGraph's own) + its packed buffer
     * (Viewport's own). Idempotent. */
    function disposePreview(): void {
      renderGraph?.disposePreviewTrace();
      previewBuffer?.destroy();
      previewBuffer = null;
    }

    function disposeHarness(): void {
      disposePreview();
      renderGraph?.dispose();
      renderGraph = null;
      harness?.dispose();
      harness = null;
    }

    /**
     * T16 export leg: readback → `.npy` + `polyphy-trace` sidecar from one
     * `downloadStem`, both via `triggerDownload`. `readbackTrace` refuses
     * by name (over `maxBufferSize`) rather than throwing mid-copy, but
     * either way a failure here must not reach the caller — it runs off
     * the store subscriber, not inside the rAF `frame()` loop, so an
     * unhandled rejection would only be a silent console error, not a
     * dead loop; caught explicitly anyway so the failure reads as an
     * export-specific message, not a generic unhandled-rejection trace.
     */
    async function runExport(): Promise<void> {
      const h = harness;
      const pts = points;
      const weights = latestWeights;
      if (!h || !pts || !weights) return;
      const s = store.getSnapshot();
      try {
        const readback = await h.readbackTrace();
        const stem = downloadStem(new Date());
        triggerDownload(`${stem}.npy`, exportNpy(readback), 'application/octet-stream');
        const sidecar = emitTraceSidecar({
          box: h.box,
          points: pts,
          weights,
          tier: s.catalog.tier,
          params: s.sim.params,
          agentCount: s.sim.agentCount,
          steps: s.sim.stepCount,
          seed: s.sim.seed,
          producedAt: new Date(),
        });
        triggerDownload(`${stem}.json`, sidecar, 'application/json');
      } catch (err) {
        console.error('mcpm-workbench: export failed', err);
      }
    }

    /**
     * T17 leg 2: readback → widen → `.scfd`, through the SAME
     * `packLogTraceVoxels`/`encodeScalarField` the offline `buildRhizomeVolume`
     * importer runs, so the two outputs are diffable. Same refusal contract
     * as `runExport` above — caught here so it can never kill the rAF loop.
     */
    async function runScfdExport(): Promise<void> {
      const h = harness;
      if (!h) return;
      try {
        const readback = await h.readbackTrace();
        const values = widenTrace(readback);
        const scfd = exportScfd(values, h.box);
        const stem = downloadStem(new Date());
        triggerDownload(`${stem}.scfd`, scfd, 'application/octet-stream');
      } catch (err) {
        console.error('mcpm-workbench: scfd export failed', err);
      }
    }

    /**
     * T18: readback → widen → `previewPackedTrace` (the REAL packLogTraceVoxels,
     * `runScfdExport`'s own call) → `graph.attachPreviewTrace`, RenderGraph's own
     * TracePass construction — Viewport builds only the buffer, not the pass.
     * Runs once per toggle-on; frame() below is what decides every
     * frame whether the result is still fresh enough to draw. `harness !== h`
     * guards the rebuild race the same way `buildFromPoints` guards `generation`
     * — `readbackTrace` can outlive a catalog switch that starts mid-await. The
     * `previewPacked` re-check guards a second race the token-diff style above
     * doesn't: the user can uncheck before this lands, and only the flag at
     * COMMIT time (not at call time) says whether the result is still wanted —
     * skip installing rather than build-then-dispose, so nothing orphaned is
     * ever created.
     */
    async function runPreviewPacked(): Promise<void> {
      const h = harness;
      const graph = renderGraph;
      if (!h || !graph) return;
      try {
        const readback = await h.readbackTrace();
        const values = widenTrace(readback);
        if (disposed || harness !== h) return;
        if (!store.getSnapshot().view.raymarch.previewPacked) return;
        disposePreview();
        const packed = previewPackedTrace(h.gpu.device, values, h.box);
        previewBuffer = packed.buffer;
        graph.attachPreviewTrace({
          traceBuffer: packed.buffer,
          box: h.box,
          element: packed.element,
          paletteId: store.getSnapshot().view.raymarch.paletteId,
        });
        previewPackedAtStep = store.getSnapshot().sim.stepCount;
      } catch (err) {
        console.error('mcpm-workbench: preview packed trace failed', err);
        disposePreview();
        store.setState((st) => ({ ...st, view: setPreviewPacked(st.view, false) }));
      }
    }

    /**
     * T20: throttled histogram readback (HISTOGRAM_INTERVAL_STEPS above) — reads back
     * whatever `step()`'s last dispatch left in the histogram counts + densities
     * buffers and derives `meanLogTraceAtPoints` from it. `harness !== h` guards the
     * same rebuild race `runPreviewPacked` does: a catalog switch can land mid-await.
     */
    async function runHistogram(h: McpmHarness, stepCount: number): Promise<void> {
      if (histogramInFlight) return;
      histogramInFlight = true;
      try {
        const { counts, sampledCount, densities } = await h.readHistogram();
        if (disposed || harness !== h) return;
        store.setState((st) => ({
          ...st,
          histogram: recordHistogramSample(
            st.histogram,
            counts,
            sampledCount,
            densities,
            stepCount,
          ),
        }));
      } catch (err) {
        console.error('mcpm-workbench: histogram readback failed', err);
      } finally {
        histogramInFlight = false;
      }
    }

    function startLoop(): void {
      if (rafHandle) cancelAnimationFrame(rafHandle);
      // Re-seed the FPS sentinels exactly as their declarations do: every rebuild tears
      // the loop down and restarts it here, and without this reset the first frame back
      // would blend the multi-second build gap into the EMA as a ~5fps reading.
      lastFrameTime = -1;
      fpsEma = 0;
      lastFpsPushTime = 0;
      lastPushedFps = 0;
      // Task FLE: a fresh harness (this is every rebuild, not just first boot) always
      // needs its first frame drawn, regardless of what the dirty flag last held.
      dirty = true;
      const frame = (): void => {
        if (disposed || !harness || !renderGraph) return;
        rafHandle = requestAnimationFrame(frame);
        const h = harness;
        const graph = renderGraph;

        const s = store.getSnapshot();
        const now = performance.now();
        if (s.sim.running) {
          simFrameCounter += 1;
          // Task FLE: the SAME boost-then-settle shape as the divisors below, applied
          // to physics cadence via a synthetic "divisor 1" — step every frame once
          // settled, only every BOOST_DIVISOR-th frame while an interaction is fresh,
          // trading simulation rate for less GPU contention against the render passes.
          const cadenceDivisor = effectiveVolpathDivisor(1, now - lastInteractionMs);
          if (simFrameCounter % cadenceDivisor === 0) {
            h.step(s.sim.params, s.histogram.sampleRandomly);
            const nextStepCount = s.sim.stepCount + 1;
            store.setState((st) => ({ ...st, sim: incrementStep(st.sim) }));
            if (nextStepCount % HISTOGRAM_INTERVAL_STEPS === 0) void runHistogram(h, nextStepCount);
          }
        }

        const gridShapeKey = JSON.stringify(gridShapeKeyFor(s));
        if (gridShapeKey !== lastGridShapeKey) {
          lastGridShapeKey = gridShapeKey;
          boxPreviewUntil = now + BOX_PREVIEW_MS;
        }

        // Task FLE: the DOM read has to run every tick, idle or not — it's the only
        // place a pure window resize (no store write) would ever get noticed.
        // graph.resize (the expensive half, reallocating GPU targets) waits below for
        // an actual render; it no-ops on an unchanged size anyway (RenderGraph.ts).
        if (resizeCanvasToDisplay(canvas)) dirty = true;
        const frameDirty = dirty;
        dirty = false;
        // The interaction-boost settle deadline joins the hold term too: raymarch (below)
        // has no accumulator of its own to keep re-drawing through the boost window the
        // way the path tracer's sample-cap check does, so without this the LAST frame
        // drawn while boosted — coarse divisor — would just stay on screen forever once
        // no further UI write comes in to wake the loop back up.
        const holdUntilMs = Math.max(boxPreviewUntil, lastInteractionMs + SETTLE_MS);
        const needsRender = frameNeedsRender({
          dirty: frameDirty,
          simRunning: s.sim.running,
          pathTracerOn: s.view.layers.pathTracer,
          pathTracerSampleCount: volpathSampleCount,
          pathTracerSampleCap: s.view.pathTracer.sampleCap,
          holdUntilMs,
          nowMs: now,
        });
        if (!needsRender) {
          // Idle: reseed the EMA sentinel so the next LIVE frame's delta doesn't fold
          // this gap in as a bogus multi-second frame time — same idiom startLoop uses
          // on a fresh rebuild. The FPS badge itself is untouched: it keeps showing the
          // last live reading rather than decaying toward zero while idle.
          lastFrameTime = -1;
          return;
        }

        if (lastFrameTime >= 0) {
          const dt = now - lastFrameTime;
          fpsEma = fpsEma === 0 ? dt : fpsEma * 0.9 + dt * 0.1;
          if (fpsEma > 0 && now - lastFpsPushTime >= FPS_PUSH_INTERVAL_MS) {
            const fpsRounded = Math.round(1000 / fpsEma);
            if (fpsRounded !== lastPushedFps) {
              lastPushedFps = fpsRounded;
              store.setState((st) => ({ ...st, view: setFps(st.view, fpsRounded) }));
            }
            lastFpsPushTime = now;
          }
        }
        lastFrameTime = now;

        graph.resize(canvas.width, canvas.height);

        // Palette moves re-BUILD their pass (LUT bakes into the bind group at
        // construction; see ViewSlice.d.ts) — cheap enough to do mid-loop, and the
        // fresh volpath pass restarts accumulation exactly as the key change below
        // demands anyway. The T18 preview pass also baked the old palette: drop it
        // and un-toggle, the same recovery the staleness path below uses.
        if (s.view.raymarch.paletteId !== attachedRaymarchPalette) {
          attachedRaymarchPalette = s.view.raymarch.paletteId;
          graph.attachTrace({
            traceBuffer: h.traceBuffer,
            box: h.box,
            element: h.element,
            paletteId: attachedRaymarchPalette,
          });
          if (graph.hasPreviewTrace()) {
            disposePreview();
            store.setState((st) => ({ ...st, view: setPreviewPacked(st.view, false) }));
          }
        }
        if (s.view.pathTracer.paletteId !== attachedVolpathPalette) {
          attachedVolpathPalette = s.view.pathTracer.paletteId;
          graph.attachVolpath({
            traceBuffer: h.traceBuffer,
            box: h.box,
            element: h.element,
            paletteId: attachedVolpathPalette,
          });
        }

        const encoder = h.gpu.device.createCommandEncoder({ label: 'mcpm-workbench-frame' });
        const cam = cameraViewFor(s, [canvas.width, canvas.height]);
        // Independent layers over one clear, back to front. The clear is unconditional:
        // with every layer off the frame is black, not last frame's pixels.
        const { layers } = s.view;
        graph.clear(encoder);
        if (layers.raymarch) {
          // Task FLE: same interaction boost as the path tracer below — coarser divisor
          // while a UI write is fresh, the user's own setting once it settles.
          const effectiveRaymarchDivisor = effectiveVolpathDivisor(
            s.view.raymarch.divisor,
            now - lastInteractionMs,
          );
          // T18: previewPacked wants the packed cube, but only while it is still
          // the pack of THIS stepCount — a sim step invalidates it (spec's
          // "STALE"), and the fallback IS the live trace, not a blank frame.
          if (
            s.view.raymarch.previewPacked &&
            graph.hasPreviewTrace() &&
            previewPackedAtStep === s.sim.stepCount
          ) {
            // drawPreviewTrace routes through the same drawTracePass divisor path as
            // drawTrace (RenderGraph owns both passes symmetrically — task R7) — same
            // reduced target, same upsample, no special-casing for the packed source.
            graph.drawPreviewTrace(encoder, traceViewFor(s, h.box, cam), effectiveRaymarchDivisor);
          } else {
            if (s.view.raymarch.previewPacked && graph.hasPreviewTrace()) {
              disposePreview();
              store.setState((st) => ({ ...st, view: setPreviewPacked(st.view, false) }));
            }
            graph.drawTrace(encoder, traceViewFor(s, h.box, cam), effectiveRaymarchDivisor);
          }
        }
        if (layers.agents) {
          graph.drawSplat(encoder, {
            ...cam,
            sampleWeight: s.view.raymarch.sampleWeight,
            intensity: s.view.agents.intensity,
            pointSizePx: s.view.agents.pointSizePx,
          });
        }
        if (layers.galaxies) graph.drawGalaxyOverlay(encoder, cam, s.view.galaxies);
        if (layers.pathTracer) {
          // Task FLE: boost trigger generalized to ANY UI store write (lastInteractionMs,
          // set by the subscriber above) — was camera-only, a per-frame `cam` JSON
          // comparison. effectiveVolpathDivisor decays it back to the user's own setting
          // SETTLE_MS after the last one, same as raymarch's own use above.
          const effectiveDivisor = effectiveVolpathDivisor(
            s.view.pathTracer.divisor,
            now - lastInteractionMs,
          );
          // Reset on any camera move, any pathTracer param change (divisor included,
          // sampleCap excluded — see volpathKeyFor.ts), or an explicit clear-trace/reset
          // command — `cam` is the SAME serialized object already computed above, so
          // this can't drift from what actually drew. Deliberately NOT keyed on
          // `sim.stepCount`: an earlier version floored a step term in here so a running
          // sim wiped the accumulator every 16 steps instead of every frame — still a
          // periodic full-wipe, visible as never converging. The field drifts slowly
          // enough (same reasoning that justified the 16-step floor) that letting
          // samples ride across steps indefinitely is fine; a box change that actually
          // invalidates the grid reaches here through a harness rebuild instead
          // (buildFromPoints resets `lastVolpathKey` to null there). Deliberately NOT
          // keyed on `effectiveDivisor` either: VolpathPass's own accumulator already
          // resizes (and so self-resets) the moment ITS size changes, which tracks
          // effectiveDivisor directly — keying this string on it too would only add a
          // second, redundant reset exactly 200ms after every interaction, on top of
          // the resize the accumulator was always going to do on its own.
          const volpathKey = JSON.stringify(
            volpathKeyFor(cam, s.view.pathTracer, s.sim.clearTraceToken, s.sim.resetToken),
          );
          if (volpathKey !== lastVolpathKey) {
            graph.resetVolpath();
            volpathSampleCount = 0;
          }
          lastVolpathKey = volpathKey;
          graph.drawVolpath(encoder, cam, s.view.pathTracer, effectiveDivisor);
          volpathSampleCount += 1;
        } else {
          lastVolpathKey = null;
        }
        // The pending box leads the debounced harness rebuild by up to REBUILD_DEBOUNCE_MS —
        // that lead is the point, live tuning ahead of the rebuild landing. Drawn last, over
        // the galaxy dots.
        // A drag in progress keeps the wireframe up even once the 200ms preview timer
        // lapses — a continuous pointer signal is its own "still hot"; `input`'s own
        // isWireframeVisible ORs that in on top of the showGridBox/flash pair below (F1.7).
        if (points && input.isWireframeVisible(s, now)) {
          graph.drawBoxPreview(
            encoder,
            cam,
            h.box,
            deriveGridBox(s.grid),
            input.getHoverHandle(),
            input.getDragHandleId(),
          );
        }
        graph.tonemap(encoder, h.gpu.context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
        h.gpu.device.queue.submit([encoder.finish()]);
      };
      rafHandle = requestAnimationFrame(frame);
    }

    async function buildFromPoints(pts: CatalogPoints, generation: number): Promise<void> {
      const s = store.getSnapshot();
      const weights = deriveAgentWeights(pts.log10StellarMass, s.catalog.weightMode);
      const boundsMpc = pts.count > 0 ? catalogBounds(pts.positions) : null;
      store.setState((st) => ({
        ...st,
        catalog: setCatalogLoaded(st.catalog, pts.count, weights.nanCount, boundsMpc),
      }));

      const box = deriveGridBox(s.grid);
      // Free the old device memory BEFORE allocating the new grids: the two sets of
      // buffers must never be resident together on a box-sized allocation.
      disposeHarness();
      if (disposed) return;

      // Device acquisition is a canvas/browser concern this component owns; the
      // harness only needs the resulting GpuContext, freshly acquired per rebuild.
      const gpu = await initGpu(canvas, {
        requiredFeatures: ['shader-f16'],
        requiredLimits: {
          maxComputeInvocationsPerWorkgroup: 1024, // propagate's 10x10x10 = 1000
          maxBufferSize: Number.MAX_SAFE_INTEGER, // clamped to the adapter's max by initGpu
          maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
        },
      });
      // Task P34: wired here, the one call site a device ever comes from. 'destroyed'
      // is an intentional device.destroy() (a future rebuild/dispose path, not one
      // this codebase calls yet) — never a real loss, so it's excluded on top of the
      // currentDevice staleness check. No auto-recreation: this only stops the loop
      // and reports; the maintainer reloads.
      currentDevice = gpu.device;
      void gpu.device.lost.then((info) => {
        if (disposed || currentDevice !== gpu.device || info.reason === 'destroyed') return;
        if (rafHandle) cancelAnimationFrame(rafHandle);
        rafHandle = 0;
        store.setState((st) => ({
          ...st,
          catalog: setCatalogStatusMessage(
            st.catalog,
            `GPU device lost (${info.reason}) — reload the page`,
          ),
        }));
      });

      const h = await createMcpmHarness({
        gpu,
        points: pts,
        weights,
        box,
        agentCount: s.sim.agentCount,
        initMode: s.sim.initMode,
        seed: s.sim.seed,
      });
      if (disposed || generation !== buildGeneration) {
        h.dispose();
        return;
      }
      harness = h;
      latestWeights = weights;
      resetTokenWatcher.sync(store.getSnapshot().sim.resetToken);
      clearTraceTokenWatcher.sync(store.getSnapshot().sim.clearTraceToken);
      exportTokenWatcher.sync(store.getSnapshot().sim.exportToken);
      scfdTokenWatcher.sync(store.getSnapshot().sim.scfdToken);
      // disposeHarness() (above, via disposePreview()) already freed the old
      // preview pass/buffer; forcing the edge low re-packs against the fresh
      // harness on the subscriber's next tick, IF the toggle was left on.
      lastPreviewPacked = false;
      previewPackedAtStep = -1;

      // h.agents.nDataPoints, not pts.count: task S14 culls out-of-box catalog points
      // inside createMcpmHarness, so the harness's own buffer sizes (what this budget
      // must describe) are already smaller than the raw loaded count whenever the box
      // crops the catalog.
      const budget = planGridBudget(
        box,
        h.agents.nDataPoints + s.sim.agentCount,
        h.element,
        h.gpu.device.limits,
      );
      store.setState((st) => ({
        ...st,
        // V2: records the device's real per-buffer ceiling once a GPU exists — non-user,
        // does not clear importedBox — so deriveGridBox can clamp every FUTURE derivation
        // (this build's own `box` above was already derived, unclamped, against the prior
        // value or null; that's fine, it either already fit or the refusal above caught it).
        grid: setMaxBufferBytes(
          setResolvedGrid(st.grid, box, h.element, budget),
          h.gpu.device.limits.maxStorageBufferBindingSize,
        ),
        sim: resetStepCount(st.sim),
        // A new grid box / catalog never continues the old convergence curve — same
        // reasoning as the resetToken path below, same one-line fix.
        histogram: resetHistogram(st.histogram),
      }));

      const makeShader = (code: string, label: string): GPUShaderModule =>
        h.gpu.device.createShaderModule({ code, label });
      const graph = createRenderGraph(h.gpu.device, h.gpu.format, makeShader);
      // The trace buffer dies with its harness, so both passes reading it are
      // re-attached on every rebuild — a graph kept across one would march freed memory.
      attachedRaymarchPalette = s.view.raymarch.paletteId;
      attachedVolpathPalette = s.view.pathTracer.paletteId;
      const traceSource = {
        traceBuffer: h.traceBuffer,
        box,
        element: h.element,
        paletteId: attachedRaymarchPalette,
      };
      graph.attachTrace(traceSource);
      graph.attachVolpath({ ...traceSource, paletteId: attachedVolpathPalette });
      graph.attachAgents(h.agents, h.overlayAgents, box);
      renderGraph = graph;
      // A fresh accumulator already clears on its own first draw (VolpathPass's
      // `pendingClear` starts true) — this just keeps the reset-tracking key from
      // outliving the harness it was computed against. Re-arming lastInteractionMs
      // too treats a rebuild as its own interaction, arming the quality boost for
      // the harness's first few frames the same way a real UI write would.
      lastVolpathKey = null;
      lastInteractionMs = performance.now();
      startLoop();
      if (hasUrlGate('probe')) (window as unknown as ProbeWindow).__mcpmProbeReady = true;
    }

    /** One build against the live snapshot, reloading the catalog only if its key moved. */
    async function buildOnce(generation: number): Promise<void> {
      const s = store.getSnapshot();
      const ck = JSON.stringify(catalogKey(s));
      try {
        if (!points || ck !== loadedCatalogKey) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'loading') }));
          // A dev-dropped packed catalog (App.tsx) wins outright — sticky for the
          // session, same as the doc comment on CatalogSlice's packedOverride field.
          // Otherwise `?probe` (probeGpuErrors.ts) swaps ONLY the next line — a
          // deterministic in-tool catalog instead of the network fetch — so the gate
          // never touches the network or `public/data` and every downstream pass
          // (grid fit, seeding, propagate/decay/raymarch) runs unmodified.
          const pts = s.catalog.packedOverride
            ? s.catalog.packedOverride
            : hasUrlGate('probe')
              ? syntheticCatalog()
              : await loadCatalogPoints(s.catalog.sources, s.catalog.tier);
          if (disposed || generation !== buildGeneration) return;
          points = pts;
          loadedCatalogKey = ck;
        }
        if (points.count === 0) {
          // Zero points is a real, reachable state (every selected source excluded
          // at this tier, or none selected) — not a crash: tear down any harness
          // left from a previous non-empty selection and surface a human status
          // instead of letting createMcpmHarness's own guard throw.
          disposeHarness();
          store.setState((st) => ({
            ...st,
            catalog: setCatalogStatusMessage(
              setCatalogLoaded(st.catalog, 0, 0, null),
              'no catalog points — enable a source or pick a tier that carries one',
            ),
          }));
          return;
        }
        await buildFromPoints(points, generation);
      } catch (err) {
        console.error('mcpm-workbench: build failed', err);
        if (!disposed) {
          store.setState((st) => ({
            ...st,
            catalog: setCatalogBuildError(st.catalog, (err as Error).message),
          }));
        }
      }
    }

    /**
     * Serialised rebuild: one build in flight, latest config wins. The generation
     * bump is what makes a request arriving mid-build survive — the runner re-reads
     * it on completion and goes round again, where a boolean gate would drop it.
     */
    function requestBuild(): void {
      buildGeneration += 1;
      if (building) return;
      void (async () => {
        building = true;
        try {
          let served = -1;
          while (!disposed && served !== buildGeneration) {
            served = buildGeneration;
            await buildOnce(served);
          }
        } finally {
          building = false;
        }
      })();
    }

    requestBuild();

    const unsubscribe = store.subscribe(() => {
      if (disposed) return;
      const s = store.getSnapshot();

      // Task FLE: one check feeds both render-on-demand's dirty flag AND the
      // interaction-priority boost trigger — the fps-only write is excluded inside
      // storeWriteIsDirty itself, not here, so both stay a single call.
      if (storeWriteIsDirty(lastDirtyCheckState, s)) {
        dirty = true;
        lastInteractionMs = performance.now();
      }
      lastDirtyCheckState = s;

      const ck = JSON.stringify(catalogKey(s));
      const bk = JSON.stringify(buildKey(s));
      if (ck !== requestedCatalogKey) {
        requestedCatalogKey = ck;
        requestedBuildKey = bk;
        clearTimeout(rebuildTimer);
        requestBuild();
      } else if (bk !== requestedBuildKey) {
        // Debounced so typing into a grid-box field doesn't reallocate the GPU
        // buffers per keystroke; a catalog switch is a deliberate click, so it isn't.
        requestedBuildKey = bk;
        clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(requestBuild, REBUILD_DEBOUNCE_MS);
      }

      if (harness) {
        if (resetTokenWatcher.changed(s.sim.resetToken)) {
          harness.reset(s.sim.initMode, s.sim.seed);
          store.setState((st) => ({
            ...st,
            sim: resetStepCount(st.sim),
            histogram: resetHistogram(st.histogram),
            // Reset restores framing too, deliberately: the orbit target is absolute
            // world Mpc, not box-relative, so nothing else recenters the camera onto
            // the box — this is the one recovery path for "camera drifted".
            view: { ...st.view, camera: defaultViewSlice.camera },
          }));
        }
        if (clearTraceTokenWatcher.changed(s.sim.clearTraceToken)) {
          harness.clearTrace();
        }
        if (exportTokenWatcher.changed(s.sim.exportToken)) {
          void runExport();
        }
        if (scfdTokenWatcher.changed(s.sim.scfdToken)) {
          void runScfdExport();
        }
        // T20: jittered-position samples and data-point samples are differently-defined
        // statistics under the same name — a toggle mid-run must not interleave them
        // into one curve, so every edge clears history (and counts/mean) outright.
        if (s.histogram.sampleRandomly !== lastSampleRandomly) {
          lastSampleRandomly = s.histogram.sampleRandomly;
          store.setState((st) => ({ ...st, histogram: resetHistogram(st.histogram) }));
        }
        // T18: a boolean edge, not a token — ControlsPanel's checkbox already
        // IS the one-shot trigger (checking it twice without unchecking is a
        // no-op, unlike reset/export's repeatable click), and frame() above
        // owns the false transition it fires on staleness, so mirroring that
        // here too keeps a manual uncheck responsive without waiting a frame.
        if (s.view.raymarch.previewPacked && !lastPreviewPacked) {
          void runPreviewPacked();
        } else if (!s.view.raymarch.previewPacked && lastPreviewPacked) {
          disposePreview();
        }
      }
      lastPreviewPacked = s.view.raymarch.previewPacked;
    });

    // Orbit input → view slice camera (a gizmo handle hit short-circuits it into a
    // drag instead) — pointer/wheel interpretation, hover/pick state and drag
    // mechanics all live in createViewportInput (task R6); this component only
    // supplies the F1.7 preview-flash term (showGridBox/boxPreviewUntil) it can't
    // see and reads back hover/drag-handle state for the box-preview draw call above.
    const input = createViewportInput({
      canvas,
      store,
      isPreviewVisible: (s, now) => s.grid.showGridBox || now < boxPreviewUntil,
    });
    canvas.addEventListener('pointerdown', input.onPointerDown);
    canvas.addEventListener('pointerup', input.onPointerUp);
    canvas.addEventListener('pointercancel', input.onPointerCancel);
    canvas.addEventListener('pointermove', input.onPointerMove);
    canvas.addEventListener('pointerleave', input.onPointerLeave);
    canvas.addEventListener('wheel', input.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', input.onContextMenu);
    // Task FLE: render-on-demand's OTHER dirty source, alongside the store
    // subscriber above — a separate listener per event rather than folding into
    // `input`'s own handlers, so createViewportInput stays unaware the render loop
    // is on-demand at all. Not `contextmenu`: it only ever preventDefault()s.
    const markDirty = (): void => {
      dirty = true;
    };
    canvas.addEventListener('pointerdown', markDirty);
    canvas.addEventListener('pointerup', markDirty);
    canvas.addEventListener('pointercancel', markDirty);
    canvas.addEventListener('pointermove', markDirty);
    canvas.addEventListener('pointerleave', markDirty);
    canvas.addEventListener('wheel', markDirty);

    return () => {
      disposed = true;
      clearTimeout(rebuildTimer);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      unsubscribe();
      disposeHarness();
      canvas.removeEventListener('pointerdown', input.onPointerDown);
      canvas.removeEventListener('pointerup', input.onPointerUp);
      canvas.removeEventListener('pointercancel', input.onPointerCancel);
      canvas.removeEventListener('pointermove', input.onPointerMove);
      canvas.removeEventListener('pointerleave', input.onPointerLeave);
      canvas.removeEventListener('wheel', input.onWheel);
      canvas.removeEventListener('contextmenu', input.onContextMenu);
      canvas.removeEventListener('pointerdown', markDirty);
      canvas.removeEventListener('pointerup', markDirty);
      canvas.removeEventListener('pointercancel', markDirty);
      canvas.removeEventListener('pointermove', markDirty);
      canvas.removeEventListener('pointerleave', markDirty);
      canvas.removeEventListener('wheel', markDirty);
    };
  }, [store]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default Viewport;
