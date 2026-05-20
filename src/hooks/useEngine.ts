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
 *     fps, sourceCounts, loadProgress, currentTier.  All but `scale`
 *     are fed by engine callbacks that fire only when the value
 *     changes, so direct `setX` wiring is safe (no spurious re-renders).
 *     `scale` is derived locally from `onCameraChange` snapshots via
 *     the pure `computeScaleInfo` helper — the engine emits the
 *     camera scalars; this hook computes the legend.  React's
 *     `setState` equality filters unchanged frames.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook does NOT own
 * ──────────────────────────────────────────────────────────────────────
 * Settings echoes (point size, brightness, etc.) live in
 * `useEngineSettings`.  The caller passes that hook's
 * `engineCallbacks` slice in via `extraCallbacks`, and we spread it
 * into the createEngine options block alongside our session callbacks.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why empty `useEffect` deps?
 * ──────────────────────────────────────────────────────────────────────
 * Same rationale as the original App.tsx engine effect: the engine is
 * a one-shot side effect tied to the canvas's lifetime.  No inputs
 * should cause it to restart.  `extraCallbacks` is captured at first
 * render and held for the life of the engine — this is intentional
 * because the engine's echo callbacks are setState references, which
 * are stable for the component's lifetime.  Listing extraCallbacks in
 * the dep array would re-create the engine on every render.
 */

import { useEffect, useRef, useState } from 'react';
import { createEngine } from '../services/engine';
import { computeScaleInfo } from '../services/engine/helpers/scaleBar';
import type { EngineHandle } from '../@types/engine/EngineHandle';
import type { EngineStatus } from '../@types/engine/EngineStatus';
import type { GalaxyInfo } from '../@types/engine/GalaxyInfo';
import type { ScaleInfo } from '../@types/engine/ScaleInfo';
import type { EngineCallbacks } from '../@types/engine/EngineCallbacks';
import type { LoadProgressState } from '../@types/loading/LoadProgressState';
import type { Tier } from '../@types/data/Tier';
import type { UseEngineInput } from '../@types/engine/UseEngineInput';
import type { UseEngineReturn } from '../@types/engine/UseEngineReturn';
import { initialTierFromViewport } from '../utils/initialTierFromViewport';
import type { SourceType } from '../@types/data/Source';

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
  const [hovered, setHovered] = useState<GalaxyInfo | null>(null);
  const [selected, setSelected] = useState<GalaxyInfo | null>(null);
  const [focused, setFocused] = useState<GalaxyInfo | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
  const [fps, setFps] = useState<number>(0);
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<SourceType, number>>>({});
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  // Lazy-init from viewport — `window` is guarded for SSR / unit-test
  // hosts.  Echoed by the engine via `onTierChange`, so this state
  // mirrors engine truth after the first user-driven swap too.
  const [currentTier, setCurrentTier] = useState<Tier>(() =>
    typeof window !== 'undefined' ? initialTierFromViewport(window.innerWidth) : 'medium',
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stable refs to the React setters wired into the nested sub-bag
    // entries below.  H5 task 11 deleted the flat callback shape from
    // `EngineCallbacks`; every subscriber now lives inside its cluster
    // (`lifecycle`, `selection`, `camera`, `sources`, …).
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

    // H5 Task 11: only nested sub-bags survive in `EngineCallbacks`.
    // Each bag here merges this hook's session-level subscriptions
    // (status / hover / select / focus / camera / fps / cloud / tier /
    // load progress) with whatever `extraCallbacks` from
    // `useEngineSettings` declares for that cluster.  Spread order
    // puts the extra-callback entries LAST so the settings hook's
    // echoes win where both define the same method (rare but well-
    // defined).  `initialTier` rides through as a non-callback option.
    const {
      lifecycle: extraLifecycle,
      points: extraPoints,
      tonemap: extraTonemap,
      camera: extraCamera,
      selection: extraSelection,
      sources: extraSources,
      bias: extraBias,
      thumbnails: extraThumbnails,
      milkyWay: extraMilkyWay,
      filaments: extraFilaments,
      labels: extraLabels,
      volumes: extraVolumes,
      input: extraInput,
    } = extraCallbacks ?? {};

    const handle = createEngine(canvas, {
      initialTier: currentTier,
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
        onTierChange: setCurrentTier,
        onLoadProgress: setLoadProgress,
        ...extraSources,
      },
      // The remaining bags have no session-level subscription here —
      // they're owned entirely by `extraCallbacks` (settings echoes
      // plus the volumes-changed dispatcher from App.tsx).  We pass
      // them through unconditionally so the optional-chain in engine
      // code resolves to the actual function (or stays undefined if
      // the consumer didn't subscribe).
      points: extraPoints,
      tonemap: extraTonemap,
      bias: extraBias,
      thumbnails: extraThumbnails,
      milkyWay: extraMilkyWay,
      filaments: extraFilaments,
      labels: extraLabels,
      volumes: extraVolumes,
      input: extraInput,
    });

    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Engine is a one-shot effect — see hook header for rationale.
    // `extraCallbacks` and `currentTier` are both intentionally
    // captured at first render: callbacks are stable React setters
    // (would never trigger meaningful re-runs even if listed); the
    // tier is a startup seed that the engine echoes back through
    // `onTierChange`.  Listing either here would re-create the engine
    // on every render.
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
    loadProgress,
    currentTier,
  };
}
