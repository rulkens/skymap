/**
 * App — the root React component for Skymap.
 *
 * ### Architecture overview
 *
 * This component is the boundary between the imperative WebGPU engine and the
 * React UI.  Its job is wiring: pull state out of focused hooks, hand it to
 * presentational children, and forward user input back into the engine.  All
 * substantive logic lives in five custom hooks under `src/hooks/`:
 *
 *   1. `useEngineSettings` — owns the ~17 settings useStates (point size,
 *      brightness, tone curve, …) and the `EngineCallbacks` echo slice that
 *      keeps them in sync with engine truth.
 *   2. `useEngine` — owns `canvasRef`, `handleRef`, the one-shot
 *      `createEngine` startup `useEffect`, and the engine-driven session
 *      state (`status`, `hovered`, `selected`, `focused`, `scale`, `fps`,
 *      `sourceCounts`, `loadProgress`, `currentTier`).  Accepts the settings
 *      hook's callbacks as `extraCallbacks` so the two interlock cleanly.
 *   3. `useFamousMeta` — loads `famous_meta.json` + `famous_xrefs.json` once
 *      at mount; consumed by the CommandPalette and the deep-link drain.
 *   4. `useAliasIndex` — lazy two-phase pipeline that builds the PGC alias
 *      index on the first palette open, returning `{ aliasIndex, aliasMap }`.
 *   5. `useFocusUrlSync` — owns the entire `#focus=…` URL lifecycle.
 *   6. `useKeyboardShortcuts` — global keydown listener for Cmd+K / Esc /
 *      f / h / l, plus the form-field guard.
 *
 * The hook order at the call site is dictated by data flow: settings runs
 * first so its `engineCallbacks` exist; engine runs next so other hooks can
 * read `handleRef`; the rest follow in any order.
 *
 * ### Why useRef for the canvas (returned from useEngine)?
 *
 * `useRef` gives us a stable container whose `.current` property points to the
 * DOM node after the component mounts. Unlike `useState`, updating a ref does
 * NOT trigger a re-render — exactly what we want for the canvas, which the
 * engine takes over and React never touches again.
 *
 * ### Why no React.StrictMode?
 *
 * StrictMode in development double-mounts every component (mount → unmount →
 * mount again) to help detect effects that don't clean up properly. Our engine
 * creates GPU resources, starts a render loop, and attaches event listeners —
 * it's not designed for this double-mount pattern. Rather than paper over the
 * issue with guards, we simply don't wrap the app in StrictMode. The cleanup
 * function inside `useEngine` is still correct and runs on hot-reload unmounts.
 *
 * ### Why is `handleRef` a ref, not state?
 *
 * Multiple hooks need to call methods on the engine (`focusOn`, `clearSelection`,
 * `selectByAlias`).  Putting the handle in state would force every consumer
 * to re-render when the engine starts up.  A ref is a stable box: `useEngine`
 * writes the handle in once, every other hook reads it out, no re-renders.
 */

import { useMemo, useState } from 'react';
import cx from 'classnames';
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
import { MILKY_WAY_ENTRY, MILKY_WAY_ID } from '../../data/milkyWayEntry';
import appStyles from './App.module.css';
import { useFocusUrlSync } from '../../hooks/useFocusUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEngineSettings } from '../../hooks/useEngineSettings';
import { LoadingDevPanel } from '../LoadingDevPanel/LoadingDevPanel';

// ── Dev-panel availability gate ────────────────────────────────────────────
//
// Whether the `d` keyboard shortcut should be wired up at all.  In dev
// builds we always wire it; in production it's only wired when
// `?debug=loading` is in the URL — same escape-hatch contract the panel
// had before, just gated on actual key presses now (default-hidden) so
// it doesn't clutter the UI for everyone running a dev server.
//
// `import.meta.env.DEV` is statically replaced by Vite at build time, so
// the production bundle sees `false` here and Rollup tree-shakes the
// `LoadingDevPanel` import + JSX away entirely whenever the URL flag
// isn't present.
//
// SSR-safe: `typeof window` guard so unit tests that render `<App />`
// without a DOM (jsdom does have `window`, but be defensive) don't blow
// up.  In a real browser the second branch always runs.
function isLoadingDevPanelAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === 'loading';
}

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

  // ── "Hide UI" mode (Tab keyboard shortcut) ───────────────────────────────
  //
  // Single boolean toggled by `Tab` (see useKeyboardShortcuts) for "give me a
  // clean look at the data" moments — screenshots, screen recordings, or
  // just orbiting without HUD chrome in the way.  Applied as a `data-hidden`
  // attribute on the `.uiStack` wrapper so a single CSS opacity transition
  // (in App.module.css) fades every overlay in lockstep.
  const [uiHidden, setUiHidden] = useState(false);

  // ── Asset-loading dev panel visibility (`d` keyboard shortcut) ─────────────
  //
  // Default false so the panel doesn't clutter the screen during normal
  // dev work.  `d` toggles it on/off (see useKeyboardShortcuts).  The
  // panel itself is gated on `isLoadingDevPanelAvailable()` further down,
  // so this state is harmless in production builds where the gate is
  // false and the panel JSX never renders.
  const [loadingDevPanelOpen, setLoadingDevPanelOpen] = useState(false);

  // ── Famous-galaxy sidecars (CommandPalette + deep-link drain) ────────────
  const { famousMeta, famousXrefs } = useFamousMeta();

  // ── Palette entries — famous catalog + Milky Way pseudo-entry ────────────
  //
  // The Milky Way isn't in any catalog .bin (it's a procedural backdrop, not
  // a per-galaxy record), but users reasonably expect to find it when typing
  // "milky way" in the command palette.  We prepend a sentinel-id entry to
  // the famous list so the palette searches it like any other galaxy; the
  // onSelect handler intercepts the sentinel id and routes to focusOnHome
  // (see milkyWayEntry.ts for the rationale).  useMemo because CommandPalette's
  // scoring useMemo depends on `entries` reference identity — a fresh array
  // each render would re-score the full ~75-entry catalog on every parent re-
  // render for no gain.
  const paletteEntries = useMemo(() => [MILKY_WAY_ENTRY, ...famousMeta], [famousMeta]);

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
  //
  // Void return: the hook does also expose `pendingTarget` for a future
  // tier-mismatch banner, but no consumer uses it today.  Destructuring
  // it here would imply a downstream prop chain that doesn't exist;
  // skipping the destructure makes the dead binding non-misleading and
  // keeps the lint clean.
  useFocusUrlSync({
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
    setUiHidden,
    setLoadingDevPanelOpen,
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
        UI overlay wrapper.  All HUD chrome (loading bar, status,
        InfoCard, scale, left-stack panels, search trigger, command
        palette) lives inside this single `<div>` so the `Tab`
        keyboard shortcut can fade the whole HUD in/out via one CSS
        transition.  See `.uiStack` / `.uiStackHidden` rules in
        `App.module.css` for the opacity + pointer-events handling.

        Modifier class via `cx`: `uiStackHidden` is appended only
        when `uiHidden` is true.  The transition lives on the base
        class so the fade animates in BOTH directions (opacity 1 → 0
        on hide, 0 → 1 on show).
      */}
      <div className={cx(appStyles.uiStack, uiHidden && appStyles.uiStackHidden)}>
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
        // clamped result back via `onExposureChange`, which updates
        // `exposure` state so the displayed number always matches
        // the shader's effective value when the engine clamps.
        //
        // The optimistic local `setExposure(value)` IS needed for
        // snappy slider thumb tracking — without it the slider visibly
        // lags by one frame.  The engine echo lands shortly after and
        // overwrites with the clamped value, which is what we want for
        // out-of-range inputs.  Differs from the tone-curve / bias
        // controls above: those are discrete dropdowns where a one-
        // frame lag isn't perceptible, so they don't need the optimistic
        // local update.
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
        entries={paletteEntries}
        aliasIndex={aliasIndex ?? undefined}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => {
          // Sentinel id from the Milky Way pseudo-entry.  See
          // `data/milkyWayEntry.ts` for why the Milky Way needs special
          // routing (no per-galaxy localIdx because the impostor isn't a
          // catalog object).  `focusOnMilkyWay` (not `focusOnHome`)
          // tweens to a viewpoint inside the impostor's full-visibility
          // band — home is at hundreds of Mpc, well past the impostor's
          // 50 Mpc fade-out, so home doesn't actually show the Milky
          // Way as the subject.
          if (id === MILKY_WAY_ID) {
            handleRef.current?.focusOnMilkyWay?.();
            return;
          }
          handleRef.current?.selectFamous?.(id);
        }}
        onSelectAlias={(target) => handleRef.current?.selectByAlias?.(target)}
      />
      {/*
        Loading dev panel (Task 13).  Mounted only in dev builds or when
        `?debug=loading` is present in the URL.  Gated on
        `status.kind !== 'initializing'` because the engine populates its
        asset-slot registry inside the async GPU init IIFE — once the
        engine has transitioned out of `initializing`, every slot exists
        on `handleRef.current.assetSlots`, so the panel's first render is
        guaranteed to see the full slot set and subscribe to each one.
      */}
      {isLoadingDevPanelAvailable() &&
        loadingDevPanelOpen &&
        status.kind !== 'initializing' &&
        handleRef.current?.assetSlots && (
          <LoadingDevPanel slots={handleRef.current.assetSlots} />
        )}
      </div>
    </>
  );
}
