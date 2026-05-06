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
 *     fps, sourceCounts, loadProgress, currentTier.  Each is fed by an
 *     engine callback that fires only when the value changes, so
 *     direct `setX` wiring is safe (no spurious re-renders).
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
 * engine fires its first `onScaleChange`.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

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
      onScaleChange: setScale,
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
