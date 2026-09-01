/**
 * Viewport — owns the <canvas> and the rAF frame driver; delegates
 * pointer/wheel input to `createViewportInput` (../input), applying its
 * hover/drag-handle state to the box-preview draw call. The scene itself
 * (device, harness, render graph, preview buffer) lives in `resources`
 * (`RenderResources`), created here and handed to `watchSceneSaga` via
 * `registerSagaContext` — the saga owns every write to it, this component
 * only reads it each frame. `resources.epoch` is how the store subscriber
 * below notices a rebuild landed, to reset per-scene bookkeeping.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { resizeCanvasToDisplay } from '../../../../../src/services/gpu/device';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import { deriveGridBox } from '../../field/deriveGridBox';
import { createViewportInput } from '../../input/createViewportInput';
import { cameraViewFor } from '../../render/cameraViewFor';
import { effectiveVolpathDivisor, SETTLE_MS } from '../../render/effectiveVolpathDivisor';
import { createRenderResources, disposeScene } from '../../render/renderResources';
import { volpathKeyFor } from '../../render/volpathKeyFor';
import { gridShapeKeyFor } from '../../state/gridShapeKeyFor';
import { incrementStep } from '../../state/sim/simSlice';
import { setFps } from '../../state/view/viewSlice';
import { storeWriteIsDirty } from '../../state/storeWriteIsDirty';
import type { RegisterSagaContext, WorkbenchStore } from '../../store/types';
import { frameNeedsRender } from '../frameNeedsRender';
import { BOX_PREVIEW_MS } from './utils/BOX_PREVIEW_MS';
import { canvasStyle } from './utils/canvasStyle';
import { CONTRAST } from './utils/CONTRAST';
import { EXPOSURE } from './utils/EXPOSURE';
import { FPS_PUSH_INTERVAL_MS } from './utils/FPS_PUSH_INTERVAL_MS';
import { traceViewFor } from './utils/traceViewFor';

/**
 * `?probe`-gated boot signal: probeGpuErrors.ts polls `__mcpmProbeMeanLogTraceAtPoints`
 * for the energy smoke test (a getter, not a snapshot — every call reads whatever the
 * store holds at that instant). `__mcpmProbeReady` (the OTHER probe signal) is set by
 * `watchSceneSaga` now, not here — it marks a completed HARNESS build, which this
 * component no longer performs.
 */
type ProbeWindow = {
  __mcpmProbeMeanLogTraceAtPoints?: () => number;
};

export type ViewportProps = {
  readonly store: WorkbenchStore;
  readonly registerSagaContext: RegisterSagaContext;
};

function Viewport({ store, registerSagaContext }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Re-typed (not just narrowed) so nested closures below don't need to
    // re-check nullability — TS doesn't carry a `const` narrowing across a
    // function-declaration boundary the way it does for arrow functions.
    const canvas: HTMLCanvasElement = canvasEl;

    const resources = createRenderResources();

    let disposed = false;
    let rafHandle = 0;
    let lastGridShapeKey = JSON.stringify(gridShapeKeyFor(store.getState()));
    let boxPreviewUntil = 0;
    // null whenever the path tracer is off — reaching this frame with the layer freshly
    // turned on always differs from null, so enabling it always resets, per the
    // accumulation contract (task-V2A-report.md).
    let lastVolpathKey: string | null = null;
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
    // and cleared once per frame() tick. Starts true so the very first frame — whatever
    // it finds in `resources` — always draws.
    let dirty = true;
    let lastDirtyCheckState = store.getState();
    // Reset alongside the accumulator itself (same volpathKey edge, below) — see
    // ViewSlice.d.ts's pathTracer.sampleCap doc comment.
    let volpathSampleCount = 0;
    // The epoch this component last reacted to — `watchSceneSaga` bumps `resources.epoch`
    // on every dispose (including a no-op one), so a mismatch here means a rebuild landed
    // (or tore down) since the last time the subscriber checked.
    let lastSeenEpoch = resources.epoch;

    // T25: `store` is the App.tsx-memoized instance for this component's whole
    // lifetime, so installing the getter once here (rather than per-build) is enough.
    if (hasUrlGate('probe')) {
      (window as unknown as ProbeWindow).__mcpmProbeMeanLogTraceAtPoints = () =>
        store.getState().histogram.meanLogTraceAtPoints;
    }

    const frame = (): void => {
      if (disposed) return;
      const s = store.getState();
      if (s.view.deviceLost) return; // stop for good — watchSceneSaga's device-lost watcher fired
      rafHandle = requestAnimationFrame(frame);
      // No scene yet (mid-rebuild, or the pre-boot gap before the first catalogLoaded) —
      // keep polling so the loop is already running the instant `resources` fills in.
      if (!resources.gpu || !resources.graph) return;
      // h is null in the empty-catalog scene — every field-fed block below
      // (sim step, layer draws, palette re-attach) checks it; camera, gizmo
      // wireframe and tonemap run either way.
      const gpu = resources.gpu;
      const h = resources.harness;
      const graph = resources.graph;

      const now = performance.now();
      // The one per-frame input-apply site (task: input-port): camera-gesture steps
      // fold into `input`'s register here rather than dispatching per pointermove.
      // Feeds the SAME interaction-priority boost as a store write (below) — without
      // this, orbiting/panning/zooming the camera would never trip the boost, since
      // the register no longer dispatches until the gesture ends.
      if (input.drain(now)) {
        dirty = true;
        lastInteractionMs = now;
      }
      // Sim pauses outright while an interaction is fresh (same window as the divisor
      // boost below): a step on a large cube can cost ~300ms of unpreemptible GPU
      // time, so throttling its cadence still hitches every drag — only not stepping
      // keeps the canvas fluid. Resumes SETTLE_MS after the last input.
      if (h && s.sim.running && now - lastInteractionMs >= SETTLE_MS) {
        h.step(s.sim.params, s.histogram.sampleRandomly);
        store.dispatch(incrementStep());
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
        simRunning: h !== null && s.sim.running,
        pathTracerOn: h !== null && s.view.layers.pathTracer,
        pathTracerSampleCount: volpathSampleCount,
        pathTracerSampleCap: s.view.pathTracer.sampleCap,
        holdUntilMs,
        nowMs: now,
      });
      if (!needsRender) {
        // Idle: reseed the EMA sentinel so the next LIVE frame's delta doesn't fold
        // this gap in as a bogus multi-second frame time — same idiom the epoch reset
        // (subscriber, below) uses on a fresh rebuild. The FPS badge itself is
        // untouched: it keeps showing the last live reading rather than decaying
        // toward zero while idle.
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
            store.dispatch(setFps(fpsRounded));
          }
          lastFpsPushTime = now;
        }
      }
      lastFrameTime = now;

      graph.resize(canvas.width, canvas.height);

      const encoder = gpu.device.createCommandEncoder({ label: 'mcpm-workbench-frame' });
      const cam = cameraViewFor(input.getCameraPose(), [canvas.width, canvas.height]);
      // Independent layers over one clear, back to front. The clear is unconditional:
      // with every layer off the frame is black, not last frame's pixels.
      const { layers } = s.view;
      graph.clear(encoder);
      if (h && layers.raymarch) {
        // Task FLE: same interaction boost as the path tracer below — coarser divisor
        // while a UI write is fresh, the user's own setting once it settles.
        const effectiveRaymarchDivisor = effectiveVolpathDivisor(
          s.view.raymarch.divisor,
          now - lastInteractionMs,
        );
        // T18: previewPacked wants the packed cube, but only while it is still
        // the pack of THIS stepCount — `watchPreviewPackedSaga` owns disposing a
        // stale one (spec's "STALE"), so this is a pure read; the fallback IS
        // the live trace, not a blank frame.
        if (
          s.view.raymarch.previewPacked &&
          graph.hasPreviewTrace() &&
          s.view.raymarch.previewPackedAtStep === s.sim.stepCount
        ) {
          // drawPreviewTrace routes through the same drawTracePass divisor path as
          // drawTrace (RenderGraph owns both passes symmetrically — task R7) — same
          // reduced target, same upsample, no special-casing for the packed source.
          graph.drawPreviewTrace(encoder, traceViewFor(s, h.box, cam), effectiveRaymarchDivisor);
        } else {
          graph.drawTrace(encoder, traceViewFor(s, h.box, cam), effectiveRaymarchDivisor);
        }
      }
      if (h && layers.agents) {
        graph.drawSplat(encoder, {
          ...cam,
          sampleWeight: s.view.raymarch.sampleWeight,
          intensity: s.view.agents.intensity,
          pointSizePx: s.view.agents.pointSizePx,
        });
      }
      if (h && layers.galaxies) graph.drawGalaxyOverlay(encoder, cam, s.view.galaxies);
      if (h && layers.pathTracer) {
        // Task FLE: boost trigger generalized to ANY UI store write (lastInteractionMs,
        // set by the subscriber above) — was camera-only, a per-frame `cam` JSON
        // comparison. effectiveVolpathDivisor decays it back to the user's own setting
        // SETTLE_MS after the last one, same as raymarch's own use above.
        const effectiveDivisor = effectiveVolpathDivisor(
          s.view.pathTracer.divisor,
          now - lastInteractionMs,
        );
        // Reset on camera move or pathTracer param change (divisor included, sampleCap
        // excluded — volpathKeyFor.ts); an explicit reset/clear-trace no longer feeds
        // this key (watchSimCommandsSaga calls graph.resetVolpath() directly).
        // Deliberately NOT keyed on sim.stepCount: an earlier version wiped the
        // accumulator every 16 steps, visible as never converging — the field drifts
        // slowly enough to ride across steps, and a box change that invalidates the
        // grid reaches here via a harness rebuild instead (epoch reset, below). Also
        // NOT keyed on effectiveDivisor: VolpathPass's own accumulator already
        // resizes/self-resets on that, so keying it here too would just add a
        // redundant second reset 200ms after every interaction.
        const volpathKey = JSON.stringify(volpathKeyFor(cam, s.view.pathTracer));
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
      if (input.isWireframeVisible(s, now)) {
        // No harness (empty scene): the pending box IS the built box — the gizmo
        // manipulates a selection that nothing has been built against yet.
        const pendingBox = deriveGridBox(s.grid);
        graph.drawBoxPreview(
          encoder,
          cam,
          h ? h.box : pendingBox,
          pendingBox,
          input.getHoverHandle(),
          input.getDragHandleId(),
        );
      }
      graph.tonemap(encoder, gpu.context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
      gpu.device.queue.submit([encoder.finish()]);
    };

    registerSagaContext({ canvas, resources });
    rafHandle = requestAnimationFrame(frame);

    const unsubscribe = store.subscribe(() => {
      if (disposed) return;
      const s = store.getState();

      // A rebuild (or teardown) landed since this subscriber last checked — reseed
      // per-scene bookkeeping BEFORE the checks below run (mirrors the old ordering:
      // a token bumped while no harness existed must not fire against its replacement).
      if (resources.epoch !== lastSeenEpoch) {
        lastSeenEpoch = resources.epoch;
        lastFrameTime = -1;
        fpsEma = 0;
        lastFpsPushTime = 0;
        lastPushedFps = 0;
        dirty = true;
        lastVolpathKey = null;
        lastInteractionMs = performance.now();
      }

      // Task FLE: one check feeds both render-on-demand's dirty flag AND the
      // interaction-priority boost trigger — the fps-only write is excluded inside
      // storeWriteIsDirty itself, not here, so both stay a single call.
      if (storeWriteIsDirty(lastDirtyCheckState, s)) {
        dirty = true;
        lastInteractionMs = performance.now();
      }
      lastDirtyCheckState = s;
    });

    // Orbit input → view slice camera (a gizmo handle hit short-circuits it into a
    // drag instead) — DOM attach/detach, the gesture recognizer, hover/pick state and
    // drag mechanics all live in createViewportInput (task input-port); this component
    // only supplies the F1.7 preview-flash term (showGridBox/boxPreviewUntil) it can't
    // see, drains it once per frame above, and reads back hover/drag-handle state for
    // the box-preview draw call below.
    const input = createViewportInput({
      canvas,
      store,
      isPreviewVisible: (s, now) => s.grid.showGridBox || now < boxPreviewUntil,
      markDirty: () => {
        dirty = true;
      },
    });

    return () => {
      disposed = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      unsubscribe();
      disposeScene(resources);
      input.destroy();
    };
  }, [store, registerSagaContext]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default Viewport;
