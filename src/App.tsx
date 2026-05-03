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
import { createEngine } from './services/engine';
import type { EngineHandle, EngineStatus, PointInfo, ScaleInfo } from './@types';
import type { LodMode } from './@types/LodMode';
import { StatusBar } from './components/StatusBar/StatusBar';
import { InfoCard } from './components/InfoCard/InfoCard';
import { ScaleBar } from './components/ScaleBar/ScaleBar';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { ALL_VISIBLE_MASK } from './data/sources';
import { isWebHIDSupported } from './services/input/spaceMouse';

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
  const [pointSize, setPointSize] = useState<number>(2.5);
  const [brightness, setBrightness] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  // Galaxy-texture quad pass: default `true` matches the engine's init value,
  // so the first paint and React's first render agree without flicker. The
  // engine echoes its own value through `onGalaxyTexturesEnabledChange` at
  // startup, which would correct any mismatch — but seeding the same default
  // here keeps the very first frame of the checkbox visually correct.
  const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState<boolean>(true);
  // Task 15 — orientation-visibility toggles.  Both default off to match
  // the engine's init values, so the first paint and React's first render
  // agree without flicker.  The engine echoes via the optional callbacks
  // below so any future engine-side flip stays mirrored.
  const [highlightFallback, setHighlightFallback] = useState<boolean>(false);
  const [realOnlyMode, setRealOnlyMode] = useState<boolean>(false);

  // ── Multi-survey + LOD state (rev-2) ─────────────────────────────────────
  //
  // `visibleSourceMask` is a 32-bit bitmask: bit `n` set means "draw points
  // from source n". We seed with `ALL_VISIBLE_MASK` (every source on) so the
  // first paint matches the engine's startup default.
  //
  // `lodMode` mirrors the engine's level-of-detail mode. In 'auto' the engine
  // recomputes the visible-source mask each frame based on camera distance;
  // in 'manual' it leaves the mask alone (so survey toggles stick).
  //
  // ── Source-of-truth note ────────────────────────────────────────────────
  // `EngineCallbacks` exposes `onLodModeChange` (which we wire up below) but
  // does NOT currently emit an `onSourceMaskChange` event. That means in
  // 'auto' mode, where the engine recomputes the mask each frame, our React
  // copy of `visibleSourceMask` will **not** track those engine-driven
  // changes — the checkboxes only reflect the user's *manual* toggles.
  //
  // For v1 this is acceptable because the survey toggles section is gated by
  // 'manual' LOD mode in practice (toggling a checkbox flips the engine to
  // manual via `setSourceVisible`'s spec). When the engine grows an
  // `onSourceMaskChange` callback later, we can wire it here without changing
  // any other code.
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(ALL_VISIBLE_MASK);
  const [lodMode, setLodMode] = useState<LodMode>('manual');

  // ── SpaceMouse state (optional, WebHID-only) ─────────────────────────────
  //
  // `spaceMouseConnected` mirrors the engine's view of pairing — flipped to
  // true only when `connectSpaceMouse()` resolves with `ok = true`, and back
  // to false on disconnect. `spaceMouseSensitivity` is the slider value;
  // 1.0 is the factory default and matches what the engine uses internally.
  const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);
  const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(1.0);

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
      onHoverChange: setHovered,
      onSelectChange: setSelected,
      onScaleChange: setScale,

      // Settings-panel callbacks: engine fires these when a setting changes
      // (including the initial seed at startup). React state stays in sync
      // automatically, so the panel always reflects the engine's truth.
      onPointSizeChange: setPointSize,
      onBrightnessChange: setBrightness,
      onAutoRotateChange: setAutoRotate,
      // Engine echoes its galaxy-thumbnail flag here at startup *and* on every
      // `setGalaxyTexturesEnabled`. Wiring this echo (rather than relying on
      // local-only optimistic updates) keeps React's view of "are thumbnails
      // on?" identical to the engine's source-of-truth value, even if the
      // engine ever flips it for non-UI reasons (e.g. perf-driven auto-disable).
      onGalaxyTexturesEnabledChange: setGalaxyTexturesEnabled,
      // Task 15 — orientation toggles echo back from the engine so React
      // state stays in sync if the engine ever flips them programmatically.
      onHighlightFallbackChange: setHighlightFallback,
      onRealOnlyModeChange: setRealOnlyMode,
      // LOD mode is seeded by the engine at init, then echoed back any time
      // `setLodMode` runs (or `setSourceVisible` flips us to manual).
      onLodModeChange: setLodMode,
      // Mirror the engine's source mask back into React.  Critical for fixing
      // the "first toggle is a no-op" bug: auto-LOD recomputes the engine mask
      // continuously, and without this echo React's checkbox state would drift
      // away from engine truth, making the first user toggle silently agree
      // with engine state instead of flipping it.
      onSourceMaskChange: setVisibleSourceMask,
      // SpaceMouse pairing state: `connect()`'s promise gives us the initial
      // success/failure, but only this callback covers spontaneous disconnects
      // (USB unplug, permission revocation).  Without it React's "Connected"
      // indicator could persist after the puck is gone.
      onSpaceMouseConnectedChange: setSpaceMouseConnected,
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

  // ── Keyboard shortcuts effect ──────────────────────────────────────────────
  //
  // Three shortcuts: Esc clears selection, `f` focuses on the pinned galaxy,
  // `h` returns the camera to the home view.  Re-runs when `selected` changes
  // so the `f` handler always reads the current pin (without a re-bind it
  // would close over the initial null forever).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ── Ignore keystrokes typed into form fields ────────────────────────────
      //
      // If the user is editing an <input> or <textarea>, we shouldn't hijack
      // their `f` and `h` keystrokes.  `e.target` could be any Element, so we
      // narrow with a tag check before reading its name.  This guards against
      // future text inputs (search box, label rename, etc.).
      const target = e.target as Element | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target as HTMLElement)?.isContentEditable) {
        return;
      }

      // ── Esc: clear pinned selection ────────────────────────────────────────
      if (e.key === 'Escape') {
        // `?.` safe-calls: no-op if the engine hasn't started yet or was destroyed.
        handleRef.current?.clearSelection();
        return;
      }

      // ── f: focus on currently-selected galaxy (no-op if nothing pinned) ────
      if (e.key === 'f' || e.key === 'F') {
        if (selected) {
          handleRef.current?.focusOn([selected.x, selected.y, selected.z]);
        }
        return;
      }

      // ── h: return to the home / Earth view ─────────────────────────────────
      if (e.key === 'h' || e.key === 'H') {
        handleRef.current?.focusOnHome();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]); // re-bind when pin changes so `f` reads the latest selection

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
      <InfoCard
        hovered={hovered}
        selected={selected}
        onFocus={(info) => handleRef.current?.focusOn([info.x, info.y, info.z])}
      />
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
        // Galaxy-thumbnail toggle: forward straight to the engine handle. The
        // engine fires `onGalaxyTexturesEnabledChange` synchronously, which
        // updates `galaxyTexturesEnabled` — so we don't need an optimistic
        // local `setGalaxyTexturesEnabled(v)` here. The `?.` on the setter
        // covers the (unlikely) case where the handle is missing the method;
        // the EngineHandle type marks `setGalaxyTexturesEnabled` as optional.
        galaxyTexturesEnabled={galaxyTexturesEnabled}
        onGalaxyTexturesChange={(enabled) => {
          handleRef.current?.setGalaxyTexturesEnabled?.(enabled);
        }}
        // Task 15 — orientation-visibility toggles. Same forward-only flow
        // as galaxyTexturesEnabled: engine fires the echo callback
        // synchronously inside the setter, so React state mirrors engine
        // truth without an optimistic local update here.
        highlightFallback={highlightFallback}
        onHighlightFallbackChange={(enabled) => {
          handleRef.current?.setHighlightFallback?.(enabled);
        }}
        realOnlyMode={realOnlyMode}
        onRealOnlyModeChange={(enabled) => {
          handleRef.current?.setRealOnlyMode?.(enabled);
        }}
        onResetCamera={() => handleRef.current?.focusOnHome()}
        // ── Multi-survey toggles + Auto-LOD master (rev-2) ──────────────
        //
        // These mirror what the engine knows. The engine accepts a single
        // `setSourceVisible(s, visible)` call which both flips the bit and
        // (per its spec) switches LOD into 'manual' mode automatically — so
        // we don't need a separate `setLodMode('manual')` from the toggle
        // handler. We *do* mirror that flip in React state immediately so
        // the checkbox row stays consistent on the very next render, even
        // though the engine echoes it back via `onLodModeChange` shortly.
        visibleSourceMask={visibleSourceMask}
        onToggleSource={(s, visible) => {
          // No optimistic local update — the engine fires `onSourceMaskChange`
          // synchronously inside `setSourceVisible`, which updates React state
          // before this handler returns.  Optimistic updates would race against
          // auto-LOD's mask, sometimes forcing the user to click twice.
          handleRef.current?.setSourceVisible?.(s, visible);
        }}
        lodMode={lodMode}
        onSetLodMode={(mode) => {
          // No optimistic local update needed — the engine will fire
          // `onLodModeChange(mode)` synchronously, which calls `setLodMode`.
          // But we set it here too for snappier feel and so a future
          // refactor that drops the synchronous echo doesn't silently
          // break the UI.
          setLodMode(mode);
          handleRef.current?.setLodMode?.(mode);
        }}
        // ── SpaceMouse 6DOF input wiring (optional, WebHID-only) ─────────
        //
        // `isWebHIDSupported()` is a pure feature check (one property
        // lookup); calling it on every render is harmless. The Connect
        // button delegates to the engine handle, which lazy-instantiates
        // the WebHID glue — so on Firefox/Safari the import never executes
        // any HID code (the `isWebHIDSupported` check inside short-circuits).
        spaceMouseSupported={isWebHIDSupported()}
        spaceMouseConnected={spaceMouseConnected}
        onConnectSpaceMouse={async () => {
          const ok = await handleRef.current?.connectSpaceMouse?.();
          setSpaceMouseConnected(!!ok);
        }}
        spaceMouseSensitivity={spaceMouseSensitivity}
        onSpaceMouseSensitivityChange={(v) => {
          setSpaceMouseSensitivity(v);
          handleRef.current?.setSpaceMouseSensitivity?.(v);
        }}
      />
    </>
  );
}
