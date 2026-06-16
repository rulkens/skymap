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
 *     fps, sourceCounts, loadProgress.  All but `scale` are fed by engine
 *     callbacks that fire only when the value changes, so direct `setX`
 *     wiring is safe (no spurious re-renders).  The data tier is NOT here:
 *     it lives in the engine settings store, read via `selectTier`; this
 *     hook only exposes the immutable `initialTier` boot seed.
 *     `scale` is derived locally from `onCameraChange` snapshots via
 *     the pure `computeScaleInfo` helper — the engine emits the
 *     camera scalars; this hook computes the legend.  React's
 *     `setState` equality filters unchanged frames.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook does NOT own
 * ──────────────────────────────────────────────────────────────────────
 * Settings values (point size, brightness, etc.) live in the
 * engine-owned settings store; React reads them via `useSettingsStore`
 * selectors, not through this hook.  The only thing the caller layers in
 * via `extraCallbacks` is extra EVENT subscriptions — App-level event
 * wiring plus the `filaments.onReady` event `useEngineSettings` owns —
 * which we spread into the createEngine options block alongside our
 * session callbacks.
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createEngine } from '../services/engine';
import { computeScaleInfo } from '../services/engine/helpers/scaleBar';
import type { EngineHandle } from '../@types/engine/EngineHandle';
import type { EngineStatus } from '../@types/engine/EngineStatus';
import type { FocusableTarget } from '../@types/engine/FocusableTarget';
import type { ScaleInfo } from '../@types/engine/ScaleInfo';
import type { LoadProgressState } from '../@types/loading/LoadProgressState';
import type { Tier } from '../@types/data/Tier';
import type { UseEngineInput } from '../@types/engine/UseEngineInput';
import type { UseEngineReturn } from '../@types/engine/UseEngineReturn';
import { initialTierFromViewport } from '../utils/initialTierFromViewport';
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EngineHandle | null>(null);

  const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
  const [hovered, setHovered] = useState<FocusableTarget | null>(null);
  const [selected, setSelected] = useState<FocusableTarget | null>(null);
  const [focused, setFocused] = useState<FocusableTarget | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
  const [fps, setFps] = useState<number>(0);
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<SourceType, number>>>({});
  const [structureCounts, setStructureCounts] = useState<
    Partial<Record<StructureId, number>>
  >({});
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  // One-time startup SEED for the engine's initial tier, derived from the
  // viewport (`window` guarded for SSR / unit-test hosts). This is no longer
  // React state: the live tier now lives in the engine settings store and is
  // read via `selectTier`, so this hook only needs the immutable boot value.
  // A stable `useMemo` keeps it from re-deriving (and so never perturbs the
  // engine effect's deps).
  const initialTier = useMemo<Tier>(
    () => (typeof window !== 'undefined' ? initialTierFromViewport(window.innerWidth) : 'medium'),
    [],
  );

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
    // sources events, plus the one-shot `filaments.onReady`.  Each bag
    // here merges this hook's session-level subscriptions (status /
    // hover / select / focus / camera / fps / catalog / tier / load
    // progress) with whatever `extraCallbacks` declares for that
    // cluster — App-level event subscriptions (e.g.
    // `selection.onStructureHoverChange`) plus the `filaments` events
    // `useEngineSettings` owns.  Spread order puts the extra-callback
    // entries LAST so the caller wins where both define the same
    // method.  Settings VALUES do not flow through here:
    // they live in the engine-owned store and React reads them via
    // `useSettingsStore` selectors, so there is no echo to merge.
    // `initialTier` rides through as a non-callback option.
    const {
      lifecycle: extraLifecycle,
      camera: extraCamera,
      selection: extraSelection,
      sources: extraSources,
      filaments: extraFilaments,
    } = extraCallbacks ?? {};

    const handle = createEngine(canvas, {
      initialTier,
      lifecycle: {
        onStatusChange: setStatus,
        onFpsChange: setFps,
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
      // The filaments-ready event has no session-level subscription
      // here — `useEngineSettings` owns it.  Pass it through
      // unconditionally so the optional-chain in engine code resolves to
      // the actual function (or stays undefined if the consumer didn't
      // subscribe).
      filaments: extraFilaments,
    });

    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Engine is a one-shot effect — see hook header for rationale.
    // `extraCallbacks` and `initialTier` are both intentionally captured at
    // first render: callbacks are stable React setters (would never trigger
    // meaningful re-runs even if listed); `initialTier` is a stable `useMemo`
    // startup seed. Listing either here would re-create the engine on every
    // render.
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
    fps,
    sourceCounts,
    structureCounts,
    loadProgress,
    initialTier,
  };
}
