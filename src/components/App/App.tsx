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

import { useState } from 'react';
import { useEngine } from '../../hooks/useEngine';
import { StatusBar } from '../StatusBar/StatusBar';
import { LoadingBar } from '../LoadingBar/LoadingBar';
import { InfoCard } from '../InfoCard/InfoCard';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import { NavigationPanel } from '../NavigationPanel/NavigationPanel';
import { StatsPanel } from '../StatsPanel/StatsPanel';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SearchTrigger } from '../SearchTrigger/SearchTrigger';
import appStyles from './App.module.css';
import { useFocusUrlSync } from '../../hooks/useFocusUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEngineSettings } from '../../hooks/useEngineSettings';

// ── App ────────────────────────────────────────────────────────────────────────

/**
 * Root application component.
 *
 * Renders the WebGPU canvas plus the three UI overlays. The canvas itself has
 * no React state — it's handed off to the engine and never touched by React
 * again (no style recalculation, no re-renders caused by canvas changes).
 */
export function App(): React.ReactElement {
  // ── Engine-driven settings (point size, brightness, filaments, tone map, …) ──
  //
  // All settings useStates live inside `useEngineSettings`.  The hook
  // returns:
  //   - `settings` — a read-only object with all current values.
  //   - `engineCallbacks` — the EngineCallbacks slice the engine uses to
  //     echo those values back into React state; spread into createEngine.
  //   - Three App-owned setters for the no-echo / partial-echo cases.
  //
  // useEngineSettings runs FIRST because useEngine consumes its callbacks.
  const {
    settings,
    engineCallbacks: settingsCallbacks,
    setFilamentsEnabled,
    setFilamentIntensity,
    setExposure,
  } = useEngineSettings();
  const {
    pointSize,
    brightness,
    autoRotate,
    galaxyTexturesEnabled,
    milkyWayEnabled,
    filamentsEnabled,
    filamentIntensity,
    filamentCounts,
    highlightFallback,
    realOnlyMode,
    depthFadeEnabled,
    visibleSourceMask,
    lodMode,
    biasMode,
    absMagLimit,
    toneMapCurve,
    exposure,
  } = settings;

  // ── Engine lifecycle + engine-driven session state ────────────────────────
  //
  // canvasRef, handleRef, and the nine engine-driven state values (status,
  // hovered, selected, focused, scale, fps, sourceCounts, loadProgress,
  // currentTier) all live inside useEngine.  The hook owns the createEngine
  // startup effect, the cleanup on unmount, and the lazy viewport-based tier
  // seed.  See src/hooks/useEngine.ts for the full rationale.
  const {
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
  } = useEngine({ extraCallbacks: settingsCallbacks });

  // ── Initial mobile signal (drives panel-collapse on first paint) ─────────
  //
  // Same 768-px breakpoint as `initialTierFromViewport` — small viewports
  // get the small data tier AND get the Navigation / Stats / Settings panels
  // collapsed by default so the canvas isn't covered on first paint.
  //
  // The lazy `useState` initializer runs exactly once at mount and is never
  // re-evaluated on subsequent renders.  We intentionally drop the setter
  // (destructure to a single element) — re-orienting a phone mid-session
  // shouldn't yank the user's expanded panels back closed under them.
  //
  // SSR-safe: in unit tests where `window` is undefined we fall back to the
  // desktop default (panels open).
  const [initialMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const initialPanelsOpen = !initialMobile;

  // ── Command palette state ─────────────────────────────────────────────────
  //
  // `paletteOpen` controls the overlay visibility.  The famous-galaxy meta
  // (entries + xrefs) comes from `useFamousMeta` below — loaded once at
  // mount and shared with the deep-link drain via `useFocusUrlSync`.
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Famous-galaxy sidecars (CommandPalette + deep-link drain) ────────────
  const { famousMeta, famousXrefs } = useFamousMeta();

  // ── Lazy alias index for command palette ────────────────────────────────
  const { aliasIndex, aliasMap } = useAliasIndex({
    paletteOpen,
    sourceCounts,
    engineHandleRef: handleRef,
  });

  // ── Deep-link focus URL sync ──────────────────────────────────────────────
  //
  // Single hook owning the entire `#focus=…` lifecycle: mount-time hash
  // parse + scrub, selection-driven URL writes, drain of pending deep
  // links once the engine is `'ready'` (which guarantees `state.cam`),
  // and the supersede-on-selection cleanup.  See the hook's module
  // header for the full rationale of each effect.
  const { pendingTarget } = useFocusUrlSync({
    focused,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    engineHandleRef: handleRef,
  });

  // ── Global keyboard shortcuts (Cmd+K, Esc, f, h, l) ─────────────────────
  useKeyboardShortcuts({
    selected,
    paletteOpen,
    engineHandleRef: handleRef,
    setPaletteOpen,
  });

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
        Loading bar — pinned to top of viewport above every other overlay.
        Fades itself out when `loadProgress` becomes null (no fetches in
        flight).  Mounted unconditionally so the first paint after a
        click-to-tier-swap doesn't flash a visible mount frame.
      */}
      <LoadingBar progress={loadProgress} />

      {/*
        UI overlays. Each receives only the slice of state it needs.
        When `status` changes, only `StatusBar` re-renders. When `hovered` or
        `selected` changes, only `InfoCard` re-renders. And so on.
      */}
      <StatusBar status={status} />
      <InfoCard
        hovered={hovered}
        selected={selected}
        onFocus={(info) => handleRef.current?.focusOn(info)}
        onClose={() => handleRef.current?.clearSelection()}
      />
      <ScaleBar scale={scale} />
      {/*
        Left-column overlay stack — wraps the three bottom-left panels
        (Navigation, Settings, Stats) in a single fixed-position flex
        column anchored at the bottom-left corner of the viewport.

        Why a wrapper here rather than three independently-positioned
        panels?  Each panel used to set `position: fixed; bottom: 16px;
        left: 16px; z-index: 10` itself, and adding a second/third
        bottom-anchored panel meant manually nudging each one's
        `bottom:` offset to make room — fragile and hard to keep in
        sync.  A flex column with `bottom: 16px` on the wrapper grows
        upward as children are added, so the panels stack naturally
        without per-panel coordinate math.

        Source order maps to vertical position: Navigation sits at the
        top of the stack, Stats hugs the viewport bottom, Settings is
        the visual anchor between them.
      */}
      <div className={appStyles.leftStack}>
        <NavigationPanel defaultOpen={initialPanelsOpen} isMobile={initialMobile} />
        {/*
          Settings panel — middle of the left stack.  All state lives here in
          App; the panel is purely presentational.  Interactions funnel through
          handleRef to avoid stale-closure issues (same pattern as the Esc key
          handler above).
        */}
        <SettingsPanel
        defaultOpen={initialPanelsOpen}
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
        milkyWayEnabled={milkyWayEnabled}
        onMilkyWayEnabledChange={(enabled) => {
          handleRef.current?.setMilkyWayEnabled?.(enabled);
        }}
        // Filaments toggle.  Unlike the milky-way / galaxy-thumbnails
        // toggles above, the engine does NOT fire an echo callback for
        // this field — App.tsx owns the React state directly.  So the
        // change handler updates state optimistically AND forwards to
        // the engine handle.  The `?.` chain on the setter covers the
        // case where the handle isn't constructed yet (early frames
        // before the async GPU init resolves).
        filamentsEnabled={filamentsEnabled}
        onFilamentsChange={(enabled) => {
          setFilamentsEnabled(enabled);
          handleRef.current?.setFilamentsEnabled?.(enabled);
        }}
        filamentIntensity={filamentIntensity}
        onFilamentIntensityChange={(value) => {
          setFilamentIntensity(value);
          handleRef.current?.setFilamentIntensity?.(value);
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
        depthFadeEnabled={depthFadeEnabled}
        onDepthFadeEnabledChange={(enabled) => {
          handleRef.current?.setDepthFadeEnabled?.(enabled);
        }}
        onResetCamera={() => handleRef.current?.focusOnHome()}
        // ── Data tier (small / medium / large) ──────────────────────────
        //
        // `currentTier` is the React mirror; the engine echoes its truth
        // through `onTierChange` (in the createEngine callbacks block
        // above).  Forwarding through `handleRef.current?.setTier` keeps
        // the tier swap inside the engine — it cancels in-flight loads,
        // re-fetches the new tier-suffixed bins, and re-uploads, then
        // fires the echo once `state.sources.tier` has mutated.  The
        // `?.` chain on setTier covers the unlikely case where the engine
        // build predates Phase 2 and lacks the method.
        tier={currentTier}
        onTierChange={(t) => handleRef.current?.setTier?.(t)}
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
        sourceCounts={sourceCounts}
        onToggleSource={(s, visible) => {
          // No optimistic local update — the engine fires `onSourceMaskChange`
          // synchronously inside `setSourceVisible`, which updates React state
          // before this handler returns.  Optimistic updates would race against
          // auto-LOD's mask, sometimes forcing the user to click twice.
          handleRef.current?.setSourceVisible?.(s, visible);
        }}
        // Auto-LOD UI is intentionally hidden — the toggle never improved
        // the user experience enough to justify the panel real estate, and
        // explaining "manual override" to anyone who clicks it costs more
        // than the feature is worth.  The engine itself still runs auto-LOD
        // internally (it drives the survey-mask gating at low zoom), so we
        // simply omit the `lodMode` / `onSetLodMode` props — SettingsPanel
        // gates the whole section on both being defined and elides it
        // automatically.  Re-expose by re-adding the two props here if the
        // user override is ever needed again.
        // ── SpaceMouse 6DOF input wiring (hidden) ────────────────────────
        //
        // The SpaceMouse panel is intentionally suppressed for now — the
        // feature still works at the engine layer (the WebHID glue lives
        // in services/input/ and stays callable), but the UI control was
        // confusing for the ~99 % of users without a 3DConnexion device.
        // SettingsPanel gates the whole section on `spaceMouseSupported`,
        // so passing `false` (regardless of the actual feature check) hides
        // it cleanly.  Re-expose by replacing this with `isWebHIDSupported()`
        // and re-adding the connected/sensitivity props alongside.
        spaceMouseSupported={false}
        // ── Density correction (Malmquist bias) ──────────────────────────
        //
        // Forward straight to the engine handle.  The engine fires its echo
        // callbacks (`onBiasModeChange` / `onAbsMagLimitChange`) synchronously
        // inside the setter, which calls `setBiasMode` / `setAbsMagLimit`
        // here — so we don't need optimistic local updates.  `?.` on the
        // handle methods covers the (unlikely) case where the engine build
        // predates Task 2 and lacks them; the EngineHandle type marks both
        // as optional for the same reason.
        biasMode={biasMode}
        onBiasModeChange={(m) => handleRef.current?.setBiasMode?.(m)}
        absMagLimit={absMagLimit}
        onAbsMagLimitChange={(M) => handleRef.current?.setAbsMagLimit?.(M)}
        // ── HDR tone-map curve ───────────────────────────────────────────
        //
        // Same forward-to-handle pattern as the bias controls above — the
        // engine fires its `onToneMapCurveChange` echo synchronously inside
        // `setToneMapCurve`, which lands here as `setToneMapCurve` (above
        // in the createEngine callbacks block).  No optimistic updates
        // needed.
        toneMapCurve={toneMapCurve}
        onToneMapCurveChange={(c) => handleRef.current?.setToneMapCurve?.(c)}
        // Exposure slider — drag pushes the value through the engine
        // handle, the engine clamps to [0.05, 16] and echoes the
        // clamped result back via `onExposureChange` (above), which
        // updates `exposure` state so the displayed number always
        // matches the shader's effective value.  Optimistic local
        // setExposure(value) is unnecessary because the engine echoes
        // synchronously inside its setter — same pattern as
        // tone-curve, brightness, and the bias-mode controls.
        exposure={exposure}
        onExposureChange={(value) => {
          setExposure(value);
          handleRef.current?.setExposure?.(value);
        }}
      />
        {/*
          Stats panel — read-only telemetry: rolling FPS, per-survey loaded
          counts, optional filaments-loaded row.  All four props are values
          App.tsx already tracks for other reasons, so wiring them here is
          essentially free.
        */}
        <StatsPanel
          defaultOpen={initialPanelsOpen}
          fps={fps}
          sourceCounts={sourceCounts}
          visibleSourceMask={visibleSourceMask}
          filamentsEnabled={filamentsEnabled}
          filamentCounts={filamentCounts}
        />
      </div>
      {/*
        Command palette — full-screen overlay for fuzzy-searching the
        famous-galaxy catalog.  Opened by Cmd+K / Ctrl+K / `/`; closed by
        Esc or clicking outside.  Selecting an entry calls
        `handle.selectFamous(id)`, which pins the galaxy and tweens the
        camera, exactly as if the user had clicked it directly on-screen.
      */}
      {/*
        Search-trigger pill — anchored top-center.  Always visible (the
        Cmd+K shortcut still works on top of it for power users).  Fades
        out via the `hidden` prop while the palette is open so the two
        don't visually fight; the open transition feels like the pill
        expanding into the palette.
      */}
      <SearchTrigger onClick={() => setPaletteOpen(true)} hidden={paletteOpen} />
      <CommandPalette
        entries={famousMeta}
        aliasIndex={aliasIndex ?? undefined}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => handleRef.current?.selectFamous?.(id)}
        onSelectAlias={(target) => handleRef.current?.selectByAlias?.(target)}
      />
    </>
  );
}
