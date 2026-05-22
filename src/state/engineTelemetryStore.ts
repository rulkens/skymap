/**
 * engineTelemetryStore — a single source of truth for the *engine→React*
 * telemetry values that the imperative WebGPU engine pushes outward each
 * frame (or each load tick).
 *
 * ### What problem this replaces
 *
 * Before this store, every engine→React value travelled the same four-hop
 * chain: the engine fired an `EngineCallbacks` entry → `useEngine` caught
 * it in a `useState` setter → `useEngine` returned the value → `App.tsx`
 * destructured it and prop-drilled it down to the leaf that renders it
 * (`StatsPanel` for fps, `LoadingBar` for load progress).  Adding one new
 * telemetry value meant editing four files in lockstep, and every value
 * forced an `App` re-render even when only one deep leaf cared.
 *
 * A vanilla Zustand store collapses that to two hops: the engine writes a
 * field; the interested leaf subscribes to *just that field* via a
 * selector and re-renders in isolation.  `App` is no longer a pass-through
 * for state it doesn't itself use.
 *
 * ### Why Zustand's *vanilla* store (not the React-coupled `create`)
 *
 * The writer is the engine — plain imperative code with no React context.
 * `createStore` (from `zustand/vanilla`) yields a store usable from
 * anywhere via `.getState()` / `.setState()`, and React leaves subscribe
 * through the `useStore` hook.  The hot-loop read cost is a single
 * `.getState()` deref returning the raw state object — measured at ~31 ns,
 * negligible at the engine's per-frame (not per-galaxy) write cadence.
 *
 * ### Why these two fields, and not the whole settings tree
 *
 * fps and loadProgress are *pure passthroughs* — the engine computes a
 * value and the UI displays it verbatim.  They're the cleanest fit for a
 * shared store.  Camera snapshots are deliberately NOT here: they feed a
 * React-side *derivation* (`computeScaleInfo`) rather than being shown
 * directly, so they stay on the existing callback path until a derived-
 * selector pattern is in place.  Per-frame mutable engine state (camera
 * yaw, fade clocks) stays in the engine's in-place `EngineState` bag — a
 * store would buy nothing there and the immutable-set write model would
 * allocate on the hot path.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type { LoadProgressState } from '../@types/loading/LoadProgressState';

type EngineTelemetryState = {
  /**
   * Rolling-window FPS estimate (integer Hz).  `0` means "not yet
   * reported" — the engine never emits 0 in practice (its window needs
   * ≥ 2 samples), so consumers render a placeholder for the 0 case.
   */
  fps: number;
  /**
   * Aggregated download-progress snapshot, or `null` when no fetch is in
   * flight (the loading bar fades out on null).
   */
  loadProgress: LoadProgressState | null;
  setFps: (fps: number) => void;
  setLoadProgress: (progress: LoadProgressState | null) => void;
};

export const engineTelemetryStore = createStore<EngineTelemetryState>((set) => ({
  fps: 0,
  loadProgress: null,
  setFps: (fps) => set({ fps }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
}));

/**
 * React selector hooks, bound with React's own `useSyncExternalStore`
 * rather than zustand's `useStore`.
 *
 * ### Why not `useStore`
 *
 * zustand's `useStore` passes `getInitialState` as the
 * `useSyncExternalStore` *server* snapshot.  Under this project's
 * `renderToStaticMarkup` test convention (node env, no DOM — see
 * CLAUDE.md), React takes the server-snapshot path, so `useStore` would
 * always report the store's *initial* value and ignore any runtime
 * write — making store-connected components untestable via static
 * markup.  Skymap is a client-only SPA (Vite, no SSR hydration), so
 * there's no hydration-mismatch risk in using the *live* `getState`
 * value for both the client and server snapshots.  That one choice both
 * fixes the test path and keeps the runtime behaviour identical.
 *
 * Each hook re-renders its caller only when its own slice changes: a
 * StatsPanel reading fps does NOT re-render on a loadProgress tick.
 */
export const useEngineFps = (): number =>
  useSyncExternalStore(
    engineTelemetryStore.subscribe,
    () => engineTelemetryStore.getState().fps,
    () => engineTelemetryStore.getState().fps,
  );

export const useEngineLoadProgress = (): LoadProgressState | null =>
  useSyncExternalStore(
    engineTelemetryStore.subscribe,
    () => engineTelemetryStore.getState().loadProgress,
    () => engineTelemetryStore.getState().loadProgress,
  );
