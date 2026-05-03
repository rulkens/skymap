/**
 * App — the root React component for Skymap.
 *
 * ### Architecture overview
 *
 * This component sits at the boundary between the imperative WebGPU engine and
 * the React UI. It:
 *
 *   1. Owns a `<canvas>` element via `useRef` — the canvas is passed to the
 *      engine, which takes over its GPU context.
 *   2. Starts the engine in a `useEffect` (runs once, on mount).
 *   3. Holds four pieces of state (`status`, `hovered`, `selected`, `scale`)
 *      that the engine updates via callbacks.
 *   4. Distributes that state to child components as plain props.
 *
 * The engine drives everything asynchronously (GPU init, data fetch, render
 * loop, pointer events). React just receives the results and re-renders. The
 * two worlds meet only here — the rest of the React tree is purely presentational.
 *
 * ### Why useRef for the canvas?
 *
 * `useRef` gives us a stable container whose `.current` property points to the
 * DOM node after the component mounts. Unlike `useState`, updating a ref does
 * NOT trigger a re-render — which is exactly what we want here. The canvas is
 * never replaced; only the engine needs to know about it.
 *
 * ### Why the empty dependency array on the engine useEffect?
 *
 * `useEffect(() => { ... }, [])` runs exactly once — after the initial mount —
 * and never re-runs. This is correct because:
 *
 *   - The engine is a one-shot side effect tied to the canvas's lifetime. There
 *     are no inputs that should cause it to restart.
 *   - If we listed `canvasRef` as a dependency, the effect would re-run if the
 *     ref object identity changed — but refs are stable by design (same object
 *     for the component's lifetime), so the effect would still run only once.
 *   - Listing callbacks (e.g. `setStatus`) as dependencies would cause a new
 *     engine to start on every render because `setState` functions are stable
 *     but the linter would still warn. The empty array is the honest statement:
 *     "this engine instance lives for as long as this component lives."
 *
 * ### Why no React.StrictMode?
 *
 * StrictMode in development double-mounts every component (mount → unmount →
 * mount again) to help detect effects that don't clean up properly. Our engine
 * creates GPU resources, starts a render loop, and attaches event listeners —
 * it's not designed for this double-mount pattern. Rather than paper over the
 * issue with guards, we simply don't wrap the app in StrictMode. The cleanup
 * function in `useEffect` is still correct and will run on hot-reload unmounts.
 *
 * ### Esc key handling
 *
 * A second `useEffect` (with an empty dep array) attaches a `keydown` listener
 * to `window`. It calls `handleRef.current?.clearSelection()` — reading the
 * latest handle through a ref rather than closing over the initial (null) value.
 *
 * Why a ref for the handle?
 *
 *   - The `keydown` listener is created once and never re-created (empty deps).
 *   - If we captured the handle directly from the engine `useEffect`, the
 *     listener would close over the value at creation time — which is undefined
 *     at the time the `keydown` effect runs. A ref is a stable box: we write
 *     the handle into it inside the engine effect and read it out in the keydown
 *     handler, both referring to the same `{ current }` object.
 */

import { useRef, useEffect, useState } from 'react';
import { createEngine } from './engine';
import type { EngineHandle, EngineStatus, PointInfo, ScaleInfo } from './engine';
import { StatusBar } from './components/StatusBar';
import { InfoCard } from './components/InfoCard';
import { ScaleBar } from './components/ScaleBar';
import { SettingsPanel } from './components/SettingsPanel';

// ── Default / initial state ────────────────────────────────────────────────────

/**
 * The scale bar needs a value from the first render, before the engine fires
 * its first `onScaleChange`. We use a safe placeholder that renders a visible
 * bar (100 px wide, "…" label) so the widget is present in the DOM even before
 * the camera state is ready.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

// ── App ────────────────────────────────────────────────────────────────────────

/**
 * Root application component.
 *
 * Renders the WebGPU canvas plus the three UI overlays. The canvas itself has
 * no React state — it's handed off to the engine and never touched by React
 * again (no style recalculation, no re-renders caused by canvas changes).
 */
export function App(): React.ReactElement {
  // ── Refs ───────────────────────────────────────────────────────────────────

  // The canvas DOM node. React sets `canvasRef.current` after the first render.
  // We pass it to `createEngine` inside the engine `useEffect`.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The engine handle. Written inside the engine `useEffect`; read in the Esc
  // `useEffect`. Both effects run after mount; storing the handle in a ref
  // avoids dependency-array gymnastics (see module comment above).
  const handleRef = useRef<EngineHandle | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  //
  // Four pieces of state drive the three UI components. They are updated
  // exclusively by engine callbacks — React never writes to them directly.
  //
  // `useState` with an initial value gives the component something to render
  // on the very first frame, before the engine's first callback fires.

  const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
  const [hovered, setHovered] = useState<PointInfo | null>(null);
  const [selected, setSelected] = useState<PointInfo | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);

  // ── Settings panel state ─────────────────────────────────────────────────
  //
  // These mirror the engine's internal settings values. They are seeded by the
  // engine's `onPointSizeChange`, `onBrightnessChange`, `onAutoRotateChange`
  // callbacks (including the initial seed fired at startup), so the panel
  // always reflects the engine's current state — not the other way around.
  // The user's interactions flow: slider → callback → handleRef.setXxx → engine
  // closure variable updated → callback fired → setState → React re-render.
  const [pointSize,  setPointSize]  = useState<number>(2.5);
  const [brightness, setBrightness] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

  // ── Engine startup effect ──────────────────────────────────────────────────

  useEffect(() => {
    // Guard: canvasRef.current should always be set by the time useEffect runs
    // (effects run after the DOM is committed), but the type is `T | null`, so
    // we check to keep TypeScript happy and avoid a runtime exception if the
    // component somehow renders without a canvas.
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Start the engine. `createEngine` returns synchronously; async work
    // (GPU init, data loading) progresses in the background and is reported
    // via the callbacks below.
    const handle = createEngine(canvas, {
      // Each callback just forwards the engine's output to React state.
      // Because the engine deduplicates (only calls these when values change),
      // we can pass `setState` functions directly — no extra memoisation needed.
      onStatusChange: setStatus,
      onHoverChange:  setHovered,
      onSelectChange: setSelected,
      onScaleChange:  setScale,

      // Settings-panel callbacks: engine fires these when a setting changes
      // (including the initial seed at startup). React state stays in sync
      // automatically, so the panel always reflects the engine's truth.
      onPointSizeChange:  setPointSize,
      onBrightnessChange: setBrightness,
      onAutoRotateChange: setAutoRotate,
    });

    // Store the handle so the Esc effect (below) can call clearSelection().
    handleRef.current = handle;

    // Cleanup: runs when the component unmounts (hot-reload, navigation, etc.).
    // This stops the render loop, removes event listeners, and releases GPU
    // resources — preventing orphaned RAF loops or memory leaks on hot-reload.
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []); // Empty array: run once on mount, clean up on unmount.

  // ── Esc key effect ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Add a window-level keydown listener that clears the selection on Escape.
    // We use `handleRef.current` (not a captured `handle` variable) so the
    // listener always sees the latest handle — it's written by the engine
    // effect which may run slightly after this effect on the first mount.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // `?.` safe-calls: no-op if the engine hasn't started yet or was destroyed.
        handleRef.current?.clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    // Cleanup: remove the listener when the component unmounts.
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []); // Empty array: add once, remove on unmount.

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/*
        The WebGPU canvas. CSS makes it fill the viewport (width: 100vw;
        height: 100vh). The engine takes over this element's GPU context —
        React never writes to it after the initial render.

        `id="c"` matches the CSS rule in index.html: `#c { display: block; ... }`.
      */}
      <canvas ref={canvasRef} id="c" />

      {/*
        UI overlays. Each receives only the slice of state it needs.
        When `status` changes, only `StatusBar` re-renders. When `hovered` or
        `selected` changes, only `InfoCard` re-renders. And so on.
      */}
      <StatusBar status={status} />
      <InfoCard hovered={hovered} selected={selected} />
      <ScaleBar scale={scale} />
      {/*
        Settings panel — bottom-left overlay with four renderer controls.
        All state lives here in App; the panel is purely presentational.
        Interactions funnel through handleRef to avoid stale-closure issues
        (same pattern as the Esc key handler above).
      */}
      <SettingsPanel
        pointSize={pointSize}
        brightness={brightness}
        autoRotate={autoRotate}
        onPointSizeChange={(v) => handleRef.current?.setPointSize(v)}
        onBrightnessChange={(v) => handleRef.current?.setBrightness(v)}
        onAutoRotateChange={(v) => handleRef.current?.setAutoRotate(v)}
        onResetCamera={() => handleRef.current?.resetCamera()}
      />
    </>
  );
}
