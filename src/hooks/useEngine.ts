/**
 * `useEngine` — owns the WebGPU engine lifecycle.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook owns
 * ──────────────────────────────────────────────────────────────────────
 *   - `canvasRef` — the DOM node the engine takes over.  React's only
 *     job is to render the `<canvas>` element with this ref attached;
 *     the engine sets up its own WebGPU context against it.
 *   - `handleRef` — the `EngineHandle` returned by `createEngine`,
 *     stored in a ref so other hooks and containers (useFocusUrlSync,
 *     useAliasIndex, InfoCardContainer, CommandPaletteContainer) can call
 *     methods on it without dependency gymnastics.
 *
 * All engine-driven state (status, scale, source counts, load progress,
 * structure counts) lives in the Redux `engine` slice, dispatched
 * directly by the engine. React reads via `useAppSelector(selectX)`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook does NOT own
 * ──────────────────────────────────────────────────────────────────────
 * Settings values (point size, brightness, etc.) live in the injected
 * settings store — created once in `main.tsx` and shared with React via
 * the redux `<Provider>`.  React reads those values via `useAppSelector`
 * selectors, not through this hook; this hook only obtains the store via
 * `useAppStore` and threads that same instance into `createEngine` so the
 * engine reads its settings from the one store React renders from.
 *
 * Two plain-value options ride into `createEngine`: the `store` (above)
 * and `setSagaContext` — the store factory's saga-context setter.  Both
 * are obtained from context seams symmetrically: `store` via `useAppStore`
 * (the redux `<Provider>`), `setSagaContext` via `useSetSagaContext` (the
 * `<SagaContextProvider>`).  The engine uses the setter to register its
 * `runTierTransition` runner so the tier saga can reach the engine; this
 * hook just forwards it, it neither owns nor reads it.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why empty `useEffect` deps?
 * ──────────────────────────────────────────────────────────────────────
 * Same rationale as the original App.tsx engine effect: the engine is
 * a one-shot side effect tied to the canvas's lifetime.  No inputs
 * should cause it to restart.  `store` and `setSagaContext` are both
 * single instances stable for the app's lifetime (each created once in
 * main.tsx); listing either in the dep array would re-create the engine
 * on every render.
 */

import { useEffect, useRef } from 'react';
import { createEngine } from '../services/engine';
import type { EngineHandle } from '../@types/engine/EngineHandle';
import type { UseEngineReturn } from '../@types/engine/UseEngineReturn';
import { useAppStore } from '../store/hooks';
import { useSetSagaContext } from '../store/SagaContextProvider';
import { installPerfHook } from '../state/perf/installPerfHook';

export function useEngine(): UseEngineReturn {
  // The injected settings store — created in main.tsx, shared with React via
  // the redux `<Provider>`. We thread this exact instance into `createEngine`
  // so the engine reads its settings from the same store React renders from.
  const store = useAppStore();

  // The store factory's saga-context setter — its sibling, carried to this seam
  // by the `<SagaContextProvider>` symmetrically with how `useAppStore` carries
  // the store. Forwarded into `createEngine` so the engine can register its saga
  // runners (`runTierTransition` + the `ReconcileEffects` closures); this hook
  // neither owns nor reads it.
  const setSagaContext = useSetSagaContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EngineHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createEngine(canvas, { store, setSagaContext });
    handleRef.current = handle;

    // Perf harness seam — a no-op unless the page is in `?perf` mode. Installed
    // here (not main.tsx) because it needs the live engine handle to reach the
    // GPU timing service via `engine.debug.timingService`.
    installPerfHook(store, handle);

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Engine is a one-shot effect — see hook header for rationale.
    // `store` and `setSagaContext` are both intentionally captured at first
    // render: each is a single instance stable for the app's lifetime
    // (created once in main.tsx). Listing either here would re-create the
    // engine on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store/setSagaContext are stable app-lifetime singletons; listing them would re-create the engine on every render
  }, []);

  return { canvasRef, handleRef };
}
