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

    // Stable refs to the React setters so we can wire them into BOTH
    // the flat callbacks (legacy shape, removed in Task 11) and the
    // nested sub-bag twins (new shape, what consumers will migrate to).
    // Same function identity in both slots → engine's dual-fire in
    // Task 4 calls the same setState twice with the same value, which
    // React reconciler dedups — zero behavioural change during the
    // transition.
    const onCloudReadyImpl = (source: Source, count: number) =>
      setSourceCounts((prev) => ({ ...prev, [source]: count }));
    const onCameraChangeImpl = (snapshot: { distance: number; fovYRad: number }) => {
      const c = canvasRef.current;
      if (!c) return;
      const info = computeScaleInfo({
        cam: snapshot,
        canvasSize: { width: c.clientWidth, height: c.clientHeight },
        targetPx: SCALE_TARGET_PX,
      });
      if (info !== null) setScale(info);
    };

    // Spread order subtlety: settings echoes live in `extraCallbacks`,
    // which we spread LAST so its flat keys win over any session
    // default.  But nested sub-bags are *objects*, and a naive spread
    // would replace (not merge) — settings' `camera = { onAutoRotate
    // …}` would wholly clobber our `camera = { onFocusChange }`.  We
    // therefore destructure the nested twins out of `extraCallbacks`
    // first, merge each bag explicitly, and let the remaining
    // top-level flat keys spread normally.
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
      volumes: extraVolumes,
      input: extraInput,
      ...extraFlat
    } = extraCallbacks ?? {};

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
      onCameraChange: onCameraChangeImpl,
      onCloudReady: onCloudReadyImpl,
      onFpsChange: setFps,
      initialTier: currentTier,
      onTierChange: setCurrentTier,
      onLoadProgress: setLoadProgress,

      ...extraFlat,

      // ── Nested sub-bag twins (H5 Task 3) ────────────────────────
      // Each entry below points at the SAME function reference as
      // its flat sibling above; the engine in Task 4 fires both
      // shapes during the migration window, and same-identity dual
      // fire is a no-op for React's setState equality.  These
      // namespaces are deleted-then-promoted-to-required in
      // Task 10/11 once the engine consumes only the nested path.
      //
      // Each bag merges this hook's session-level twins with the
      // settings hook's echoes (passed via `extraCallbacks`) so both
      // sources land in one engine-visible object.
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
        onFocusChange: setFocused,
        ...extraCamera,
      },
      sources: {
        onCloudReady: onCloudReadyImpl,
        onTierChange: setCurrentTier,
        onLoadProgress: setLoadProgress,
        ...extraSources,
      },
      // The remaining bags have no session-level twin here — they're
      // owned entirely by `extraCallbacks` (settings echoes plus the
      // volumes-changed dispatcher from App.tsx).  We pass them
      // through unconditionally so the optional-chain in engine code
      // resolves to the actual function (or stays undefined if the
      // consumer didn't subscribe).
      points: extraPoints,
      tonemap: extraTonemap,
      bias: extraBias,
      thumbnails: extraThumbnails,
      milkyWay: extraMilkyWay,
      filaments: extraFilaments,
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
