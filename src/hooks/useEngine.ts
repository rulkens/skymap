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
import type {
  EngineHandle,
  EngineStatus,
  PointInfo,
  ScaleInfo,
} from '../@types';
import type {
  EngineCallbacks,
  LoadProgressState,
} from '../@types/EngineCallbacks';
import type { Tier } from '../@types/Tier';
import { initialTierFromViewport } from '../utils/initialTierFromViewport';
import type { Source } from '../data/sources';

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

export type UseEngineInput = {
  /**
   * Extra callbacks to layer onto the engine's options block.  In
   * practice this is the `engineCallbacks` slice from
   * `useEngineSettings` — settings echoes that drive React-side
   * SettingsPanel state.  Captured at first render; do not expect
   * subsequent changes to take effect.
   */
  extraCallbacks?: Partial<EngineCallbacks>;
};

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: PointInfo | null;
  selected: PointInfo | null;
  focused: PointInfo | null;
  scale: ScaleInfo;
  fps: number;
  sourceCounts: Partial<Record<Source, number>>;
  loadProgress: LoadProgressState | null;
  currentTier: Tier;
};

export function useEngine(input: UseEngineInput = {}): UseEngineReturn {
  const { extraCallbacks } = input;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EngineHandle | null>(null);

  const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
  const [hovered, setHovered] = useState<PointInfo | null>(null);
  const [selected, setSelected] = useState<PointInfo | null>(null);
  const [focused, setFocused] = useState<PointInfo | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
  const [fps, setFps] = useState<number>(0);
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<Source, number>>>({});
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  // Lazy-init from viewport — `window` is guarded for SSR / unit-test
  // hosts.  Echoed by the engine via `onTierChange`, so this state
  // mirrors engine truth after the first user-driven swap too.
  const [currentTier, setCurrentTier] = useState<Tier>(() =>
    typeof window !== 'undefined'
      ? initialTierFromViewport(window.innerWidth)
      : 'medium',
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createEngine(canvas, {
      onStatusChange: setStatus,
      onHoverChange: setHovered,
      onSelectChange: setSelected,
      onFocusChange: setFocused,
      // Derive scale-bar legend from the engine's per-frame camera
      // snapshot.  `computeScaleInfo` is pure (and reused from the
      // engine's helpers — see scaleBar.ts).  We read viewport
      // dimensions from the live canvas ref so a resize that hasn't
      // yet triggered a cam tick still produces an up-to-date bar on
      // the next emission.  The pure function returns null for
      // degenerate inputs (viewport height 0, distance ≈ 0); we
      // skip setState in that window so the placeholder stays.
      // React's setState equality dedups unchanged frames, replacing
      // the engine's old `lastSig` string compare.
      onCameraChange: (snapshot) => {
        const c = canvasRef.current;
        if (!c) return;
        const info = computeScaleInfo({
          cam: snapshot,
          canvasSize: { width: c.clientWidth, height: c.clientHeight },
          targetPx: SCALE_TARGET_PX,
        });
        if (info !== null) setScale(info);
      },
      onCloudReady: (source, count) =>
        setSourceCounts((prev) => ({ ...prev, [source]: count })),
      onFpsChange: setFps,
      initialTier: currentTier,
      onTierChange: setCurrentTier,
      onLoadProgress: setLoadProgress,
      ...extraCallbacks,
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
