/**
 * `useEngine` — owns the WebGPU engine lifecycle and the React state
 * slices the engine itself drives.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook owns
 * ──────────────────────────────────────────────────────────────────────
 *   - `canvasRef` — the DOM node the engine takes over.  React's only
 *     job is to render the `<canvas>` element with this ref attached;
 *     the engine sets up its own WebGPU context against it.
 *   - `handleRef` — the `EngineHandle` returned by `createEngine`,
 *     stored in a ref so other hooks (useFocusUrlSync, useAliasIndex,
 *     useKeyboardShortcuts) can call methods on it without dependency
 *     gymnastics.
 *   - Engine-driven state: status, hovered, selected, focused, scale,
 *     sourceCounts, loadProgress.  All but `scale` are fed by engine
 *     callbacks that fire only when the value changes, so direct `setX`
 *     wiring is safe (no spurious re-renders).  The data tier is NOT here:
 *     it lives in the engine settings store, read via `selectTier` /
 *     `useAppSelector` — this hook neither holds nor exposes it.
 *     `scale` is derived locally from `onCameraChange` snapshots via
 *     the pure `computeScaleInfo` helper — the engine emits the
 *     camera scalars; this hook computes the legend.  React's
 *     `setState` equality filters unchanged frames.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook does NOT own
 * ──────────────────────────────────────────────────────────────────────
 * Settings values (point size, brightness, etc.) live in the injected
 * settings store — created once in `main.tsx` and shared with React via
 * the redux `<Provider>`.  React reads those values via `useAppSelector`
 * selectors, not through this hook; this hook only obtains the store via
 * `useAppStore` and threads that same instance into `createEngine` so the
 * engine reads its settings from the one store React renders from.  The
 * only thing the caller layers in via `extraCallbacks` is extra EVENT
 * subscriptions — App-level event wiring (e.g.
 * `selection.onStructureHoverChange`) — which we spread into the
 * createEngine options block alongside our session callbacks.
 *
 * Two NON-callback options ride into `createEngine` as plain values: the
 * `store` (above) and `setSagaContext` — the store factory's saga-context
 * setter.  Both are obtained from context seams symmetrically: `store` via
 * `useAppStore` (the redux `<Provider>`), `setSagaContext` via
 * `useSetSagaContext` (the `<SagaContextProvider>`).  The engine uses the
 * setter to register its `runTierTransition` runner so the tier saga can reach
 * the engine; this hook just forwards it, it neither owns nor reads it.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why empty `useEffect` deps?
 * ──────────────────────────────────────────────────────────────────────
 * Same rationale as the original App.tsx engine effect: the engine is
 * a one-shot side effect tied to the canvas's lifetime.  No inputs
 * should cause it to restart.  `extraCallbacks` is captured at first
 * render and held for the life of the engine — this is intentional
 * because its members are stable event subscriptions (setState
 * references and the like) for the component's lifetime.  Listing
 * extraCallbacks in the dep array would re-create the engine on every
 * render.
 */

import { useEffect, useRef, useState } from 'react';
import { createEngine } from '../services/engine';
import { computeScaleInfo } from '../services/engine/helpers/scaleBar';
import type { EngineHandle } from '../@types/engine/EngineHandle';
import type { EngineStatus } from '../@types/engine/EngineStatus';
import type { FocusableTarget } from '../@types/engine/FocusableTarget';
import type { ScaleInfo } from '../@types/engine/ScaleInfo';
import type { LoadProgressState } from '../@types/loading/LoadProgressState';
import type { UseEngineInput } from '../@types/engine/UseEngineInput';
import type { UseEngineReturn } from '../@types/engine/UseEngineReturn';
import { useAppStore } from '../store/hooks';
import { useSetSagaContext } from '../store/SagaContextProvider';
import type { SourceType } from '../@types/data/SourceType';
import type { StructureId } from '../@types/data/structure/StructureId';

/**
 * Initial scale-bar value that renders something sensible before the
 * engine fires its first `onCameraChange`.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

/**
 * Desired bar width in CSS pixels.  Same value the engine used to
 * hardcode before the lift; kept here as the React-side single source
 * of truth.  150 px is the design choice — wide enough to read,
 * narrow enough to never collide with the InfoCard.
 */
const SCALE_TARGET_PX = 150;

// UseEngineInput / UseEngineReturn moved to @types/engine/.

export function useEngine(input: UseEngineInput = {}): UseEngineReturn {
  const { extraCallbacks } = input;

  // The injected settings store — created in main.tsx, shared with React via
  // the redux `<Provider>`. We thread this exact instance into `createEngine`
  // so the engine reads its settings from the same store React renders from.
  const store = useAppStore();

  // The store factory's saga-context setter — its sibling, carried to this seam
  // by the `<SagaContextProvider>` symmetrically with how `useAppStore` carries
  // the store. Forwarded into `createEngine` so the engine can register its
  // `runTierTransition` runner; this hook neither owns nor reads it.
  const setSagaContext = useSetSagaContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EngineHandle | null>(null);

  const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
  const [hovered, setHovered] = useState<FocusableTarget | null>(null);
  const [selected, setSelected] = useState<FocusableTarget | null>(null);
  const [focused, setFocused] = useState<FocusableTarget | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<SourceType, number>>>({});
  const [structureCounts, setStructureCounts] = useState<Partial<Record<StructureId, number>>>({});
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stable refs to the React setters wired into the nested sub-bag
    // entries below.  `EngineCallbacks` is nested-only: every subscriber
    // lives inside its event cluster (`lifecycle`, `selection`,
    // `camera`, `sources`).
    const onCatalogReadyImpl = (source: SourceType, count: number) =>
      setSourceCounts((prev) => ({ ...prev, [source]: count }));
    const onCameraChangeImpl = (snapshot: { distance: number; fovYRad: number }) => {
      const c = canvasRef.current;
      if (!c) return;
      const info = computeScaleInfo({
        cam: snapshot,
        canvasSize: { width: c.clientWidth, height: c.clientHeight },
        targetPx: SCALE_TARGET_PX,
      });
      if (info === null) return;
      // `computeScaleInfo` allocates a fresh object every call, so
      // `setScale(info)` always passes React's `Object.is` dedup
      // even when the visible values are unchanged.  During autorotate
      // (or any animation that holds `distance`/`fovYRad` constant) the
      // scale-bar legend is bit-stable frame to frame; reusing `prev`'s
      // reference in that case stops App from re-rendering every frame
      // and cascading through the rest of the HUD.
      setScale((prev) =>
        prev.label === info.label && prev.widthPx === info.widthPx ? prev : info,
      );
    };

    // `EngineCallbacks` is EVENT-only: lifecycle / selection / camera /
    // sources events.  Each bag here merges this hook's session-level
    // subscriptions (status / hover / select / focus / camera / catalog /
    // tier / load progress) with whatever `extraCallbacks` declares for
    // that cluster — App-level event subscriptions (e.g.
    // `selection.onStructureHoverChange`).  Spread order puts the
    // extra-callback entries LAST so the caller wins where both define the
    // same method.  Settings VALUES do not flow through here: they live in
    // the injected store and React reads them via `useAppSelector` selectors,
    // so there is no echo to merge.  The injected `store` rides through as a
    // non-callback option — the engine reads its settings from it.
    const {
      lifecycle: extraLifecycle,
      camera: extraCamera,
      selection: extraSelection,
      sources: extraSources,
    } = extraCallbacks ?? {};

    const handle = createEngine(canvas, {
      store,
      setSagaContext,
      lifecycle: {
        onStatusChange: setStatus,
        ...extraLifecycle,
      },
      selection: {
        onHoverChange: setHovered,
        onSelectChange: setSelected,
        ...extraSelection,
      },
      camera: {
        // Derive scale-bar legend from the engine's per-frame camera
        // snapshot.  `computeScaleInfo` is pure (and reused from the
        // engine's helpers — see scaleBar.ts).  We read viewport
        // dimensions from the live canvas ref so a resize that hasn't
        // yet triggered a cam tick still produces an up-to-date bar on
        // the next emission.  The pure function returns null for
        // degenerate inputs (viewport height 0, distance ≈ 0); we
        // skip setState in that window so the placeholder stays.
        // React's setState equality dedups unchanged frames.
        onFocusChange: setFocused,
        onCameraChange: onCameraChangeImpl,
        ...extraCamera,
      },
      sources: {
        onCatalogReady: onCatalogReadyImpl,
        onLoadProgress: setLoadProgress,
        onStructureCountsChange: setStructureCounts,
        ...extraSources,
      },
    });

    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Engine is a one-shot effect — see hook header for rationale.
    // `extraCallbacks` and `store` are both intentionally captured at first
    // render: callbacks are stable React setters (would never trigger
    // meaningful re-runs even if listed); `store` is the single injected store
    // instance, stable for the app's lifetime. Listing either here would
    // re-create the engine on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    canvasRef,
    handleRef,
    status,
    hovered,
    selected,
    focused,
    scale,
    sourceCounts,
    structureCounts,
    loadProgress,
  };
}
