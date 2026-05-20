/**
 * App — the root React component for Skymap.
 *
 * Boundary between the imperative WebGPU engine and the React UI.  Its
 * job is wiring: pull state out of focused hooks in `src/hooks/`, hand
 * it to presentational children, and forward user input back into the
 * engine.  Hook order is dictated by data flow — settings first so its
 * `engineCallbacks` exist, engine next so other hooks can read
 * `handleRef`, the rest follow in any order.
 *
 * ### Why `handleRef` is a ref, not state
 *
 * Multiple hooks call methods on the engine (`focusOn`, `clearSelection`,
 * `selectByAlias`).  Putting the handle in state would force every
 * consumer to re-render when the engine starts up.  A ref is a stable
 * box: `useEngine` writes once, everyone else reads.
 *
 * ### Why no React.StrictMode
 *
 * StrictMode double-mounts every component in dev to surface effects
 * that don't clean up properly.  The engine creates GPU resources,
 * starts a render loop, and attaches event listeners — it isn't
 * designed for double-mount.  Skipping StrictMode is cheaper than
 * guarding every resource against a synthetic re-mount; the cleanup
 * inside `useEngine` still runs on real unmounts (hot-reload, route
 * changes).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { StatusBar } from '../StatusBar/StatusBar';
import { LoadingBar } from '../LoadingBar/LoadingBar';
import { InfoCard } from '../InfoCard/InfoCard';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import NavigationPanel from '../NavigationPanel/NavigationPanel';
import StatsPanel from '../StatsPanel/StatsPanel';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import SearchTrigger from '../SearchTrigger/SearchTrigger';
import AutoRotateToggle from '../AutoRotateToggle/AutoRotateToggle';
import { MILKY_WAY_ENTRY, MILKY_WAY_ID } from '../../data/milkyWayEntry';
import appStyles from './App.module.css';
import { useUrlSync } from '../../hooks/useUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEngineSettings } from '../../hooks/useEngineSettings';
import { useSpaceMouseDevicePresence } from '../../hooks/useSpaceMouseDevicePresence';
import { buildStaticAnchorPois } from '../../data/buildStaticAnchorPois';
import { DebugPanel } from '../DebugPanel/DebugPanel';
import type { ScalarFieldPaletteId } from '../../@types/data/ScalarFieldPaletteId';
import { isWebHIDSupported } from '../../services/input/spaceMouse';

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
    setVolumesEnabled,
    setVolumeFields,
    setSpaceMouseSensitivity,
  } = useEngineSettings();

  // ── Stable volume-fields refresh callback ─────────────────────────────
  //
  // The engine fires `onVolumeFieldsChanged` whenever a field is added or
  // removed.  The handler needs to call `handleRef.current.volumes.getState()`
  // — but `handleRef` is returned by `useEngine` (below), which runs AFTER
  // this block.  We break the timing dependency with a stable indirection:
  //
  //   1. `_onVolumeFieldsChangedTarget` is a mutable ref holding the real
  //      callback.  It starts as a no-op; App fills it in once `handleRef`
  //      is available (the assignment below runs every render, which is
  //      fine — it's a ref write, not state).
  //
  //   2. `_onVolumeFieldsChangedStable` is a stable function (captured once
  //      via `.current`) that dispatches to whatever the target ref holds.
  //      Because it's stable, passing it in `extraCallbacks` doesn't
  //      interfere with useEngine's "capture once at startup" contract.
  //
  // When `onVolumeFieldsChanged` fires inside the engine (after `addVolumeField`
  // / `removeVolumeField`), `handleRef.current` is guaranteed to be set
  // because the engine calls the callback only after construction, so
  // `getVolumeFieldsState()` is safe to call.
  const _onVolumeFieldsChangedTarget = useRef<() => void>(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const _onVolumeFieldsChangedStable = useRef(() => _onVolumeFieldsChangedTarget.current()).current;

  const {
    pointSize,
    autoRotate,
    labelCategoryVisibility,
    markerCategoryVisibility,
    filamentsEnabled,
    filamentIntensity,
    filamentCounts,
    highlightFallback,
    realOnlyMode,
    depthFadeEnabled,
    visibleSourceMask,
    biasMode,
    absMagLimit,
    toneMapCurve,
    volumesEnabled,
    volumeFields,
    spaceMouseConnected,
    spaceMouseSensitivity,
  } = settings;

  // ── SpaceMouse device-presence gate (audit Q16f) ────────────────────────
  //
  // Reactive predicate that flips to true when the user has previously
  // authorised a 3Dconnexion SpaceMouse on this origin AND the device
  // is currently attached.  The SettingsPanel's SpaceMouse section is
  // gated on this so the section is invisible to the 99 % of users
  // without a puck, but appears automatically (no reload) for the 1 %
  // who own one and have paired once.  See
  // `docs/grill-sessions/settings-panel-audit-2026-05-19.md` (Q16f)
  // for the rationale.  First-time pairing currently happens via the
  // engine handle's `connect()` method (e.g. from a dev console) — see
  // the `useSpaceMouseDevicePresence` module header for the trade-off.
  const spaceMouseDevicePresent = useSpaceMouseDevicePresence();
  const spaceMouseSectionVisible = isWebHIDSupported() && spaceMouseDevicePresent;

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
  } = useEngine({
    extraCallbacks: {
      ...settingsCallbacks,
      // Volume-fields changed: rebuild the per-field row data.  Uses
      // the stable dispatch ref so the engine captures only one stable
      // function pointer (not a new lambda on every render).  See the
      // `_onVolumeFieldsChangedStable` comment block above for the
      // full rationale.  H5 task 11 dropped the flat `onVolumeFieldsChanged`
      // alias; only the nested `volumes.onFieldsChanged` address remains.
      volumes: {
        onFieldsChanged: _onVolumeFieldsChangedStable,
      },
    },
  });

  // Wire the real volume-fields refresh now that handleRef is available.
  // This assignment runs every render (a stable ref write — no cost), and
  // the closure always reflects the latest `setVolumeFields` and `handleRef`.
  // The callback just mirrors the engine's current field list into React
  // state — no persistence, no restoration.
  _onVolumeFieldsChangedTarget.current = () => {
    const handle = handleRef.current;
    if (!handle) return;
    setVolumeFields(handle.volumes.getState());
  };

  // ── Volume-fields UI filter ──────────────────────────────────────────────
  //
  // The engine registers synthetic-fixture fields (handles prefixed
  // `debug-`) for axis/scale smoke tests, but they're not user-facing —
  // surface only the real science volumes in the Volumes panel.  The
  // engine still owns the full registry, so the hidden fields remain
  // enableable programmatically (and re-emerge if the prefix changes
  // or this filter is removed).  Filtering at the App boundary rather
  // than in `wireSlots` keeps the engine handle's `getVolumeFieldsState`
  // a faithful mirror of what's registered, which the dev panel and any
  // future tooling can still rely on.
  const visibleVolumeFields = useMemo(
    () => volumeFields.filter((f) => !f.handle.startsWith('debug-')),
    [volumeFields],
  );

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
  // mount and shared with the deep-link drain via `useUrlSync`.
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Stable handlers for the SearchTrigger pill.  The trigger is wrapped
  // in `React.memo`, so handing it a new inline `() => setPaletteOpen(true)`
  // each render would defeat the memo.  `setPaletteOpen` from React is
  // already stable; wrapping in `useCallback([])` gives us a stable
  // arrow that closes over the stable setter.
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // ── "Hide UI" mode (Tab keyboard shortcut) ───────────────────────────────
  //
  // Single boolean toggled by `Tab` (see useKeyboardShortcuts) for "give me a
  // clean look at the data" moments — screenshots, screen recordings, or
  // just orbiting without HUD chrome in the way.  Applied as a `data-hidden`
  // attribute on the `.uiStack` wrapper so a single CSS opacity transition
  // (in App.module.css) fades every overlay in lockstep.
  const [uiHidden, setUiHidden] = useState(false);

  // ── Debug panel visibility (`d` keyboard shortcut) ─────────────────────────
  //
  // Default-hidden so the panel doesn't clutter the screen; `d` toggles
  // it on/off (see useKeyboardShortcuts).
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

  // ── Unified deep-link URL sync ────────────────────────────────────────────
  //
  // One owner of `window.location.hash` handles both `#focus=<galaxyId>`
  // and `#poi=<poiId>` schemes.  The merge eliminates the segment-prefix
  // coordination that two independent hooks needed (each guarded against
  // clobbering the other's hash body).  See `useUrlSync.ts` for the full
  // rationale and the five-effect breakdown.
  //
  // Why a hard-coded static POI table instead of reading from the engine?
  // The engine's POI subsystem owns the merged list (static anchors +
  // asynchronously-loaded famous-galaxy POIs), but exposing it as a
  // reactive React slice would mean threading another callback through
  // EngineCallbacks and re-rendering App on every famous-meta load.  For
  // deep-link arrivals the static subset is sufficient — `#poi=cluster-…`
  // / `#poi=supercluster-…` / `#poi=void-…` all live in this table.
  //
  // `buildStaticAnchorPois` is the same helper the engine's wireSlots
  // phase calls when seeding `state.subsystems.pois.setPois(...)`, so
  // the id-slug + worldPos this hook hands `focusOn` is guaranteed to
  // match what the renderer is drawing.  `useMemo([])` because the helper
  // output is referentially-stable per call and we don't want to rebuild
  // a fresh array on every render — that would re-fire the drain effect
  // needlessly.  Famous-galaxy POIs (`#poi=famous-…`) are a future
  // extension; the drain holds the pending id until a future "famous POIs
  // ready" subscriber resolves it.
  const staticPois = useMemo(() => buildStaticAnchorPois(), []);
  useUrlSync({
    focused,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    ready: status.kind === 'ready',
    pois: staticPois,
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
          onFocus={(target) => handleRef.current?.camera.focusOn(target)}
          onClose={() => handleRef.current?.selection.clear()}
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
            onPointSizeChange={(v) => handleRef.current?.points.setSize(v)}
            // Brightness, auto-rotate, galaxy thumbnails, and Milky Way
            // toggles were all evicted from the panel by the 2026-05-19
            // UX audit (Q6 / Q12 / Q11 / Q16d).  Their engine plumbing
            // remains (callable via handleRef in the console), only the
            // user-facing surface is gone.  Auto-rotate still has a
            // dedicated top-bar Play button (AutoRotateToggle below).
            labelCategoryVisibility={labelCategoryVisibility}
            markerCategoryVisibility={markerCategoryVisibility}
            onSetMarkerCategoryVisibility={(category, visible) => {
              // Marker-axis ONLY — the label for the same category stays
              // untouched.  Routes to the marker-specific setter added in
              // PR #160 / audit Q11 alongside the label-axis split.
              handleRef.current?.labels.setCategoryMarkerVisible(category, visible);
            }}
            onSetLabelCategoryVisibility={(category, visible) => {
              // Label-axis ONLY — the marker (ring + halo) for the same
              // category stays untouched.  Pre-2026-05-19 this prop
              // accidentally hid both via the single `setCategoryVisible`
              // setter; the audit (Q11) split the axis so this checkbox
              // now does what its name says.
              handleRef.current?.labels.setCategoryLabelVisible(category, visible);
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
              handleRef.current?.filaments.setEnabled(enabled);
            }}
            filamentIntensity={filamentIntensity}
            onFilamentIntensityChange={(value) => {
              setFilamentIntensity(value);
              handleRef.current?.filaments.setIntensity(value);
            }}
            // (Orientation-fallback toggles moved to the DebugPanel's
            // DataQualitySection per the 2026-05-19 SettingsPanel UX audit
            // — see Q16g.  They're catalog-audit diagnostics, not user-
            // facing settings.)
            depthFadeEnabled={depthFadeEnabled}
            onDepthFadeEnabledChange={(enabled) => {
              handleRef.current?.points.setDepthFade(enabled);
            }}
            onResetCamera={() => handleRef.current?.camera.focusOnHome()}
            // ── Data tier (small / medium / large) ──────────────────────────
            //
            // `currentTier` is the React mirror; the engine echoes its truth
            // through `onTierChange` (in the createEngine callbacks block
            // above).  Forwarding through `handleRef.current?.sources.setTier` keeps
            // the tier swap inside the engine — it cancels in-flight loads,
            // re-fetches the new tier-suffixed bins, and re-uploads, then
            // fires the echo once `state.sources.tier` has mutated.
            tier={currentTier}
            onTierChange={(t) => handleRef.current?.sources.setTier(t)}
            // ── Multi-survey toggles (rev-2) ─────────────────────────────────
            //
            // These mirror what the engine knows. The engine accepts a single
            // `setSourceVisible(s, visible)` call which flips the survey bit
            // (with a fade animation). React state is updated by the engine's
            // synchronous `onMaskChange` echo, so we don't need an optimistic
            // local update here.
            visibleSourceMask={visibleSourceMask}
            sourceCounts={sourceCounts}
            onToggleSource={(s, visible) => {
              // No optimistic local update — the engine fires `onMaskChange`
              // synchronously inside `setSourceVisible` (pickMask flip), which
              // updates React state before this handler returns.  setVisible
              // is async (drawMask flips after the fade settles), so
              // fire-and-forget here.
              void handleRef.current?.sources.setVisible(s, visible);
            }}
            // ── SpaceMouse 6DOF input wiring (audit Q16f) ────────────────────
            //
            // Section visibility is gated on `isWebHIDSupported() && device
            // present` (see `spaceMouseSectionVisible` near the top of this
            // component for the predicate).  Firefox / Safari users never see
            // the section (no WebHID), and Chromium users without a paired
            // 3Dconnexion device also see nothing — auto-detection means the
            // SpaceMouse-owning ~1 % find the controls right where they
            // expect, and the other 99 % see no clutter.  See
            // `docs/grill-sessions/settings-panel-audit-2026-05-19.md` (Q16f)
            // for the design rationale.  First-time pairing happens through
            // `handleRef.current.input.spaceMouse.connect()` (currently
            // surfaced only via the dev console — a future iteration can add
            // a URL-gated first-time pair affordance).
            spaceMouseSupported={spaceMouseSectionVisible}
            spaceMouseConnected={spaceMouseConnected}
            onConnectSpaceMouse={() => {
              // `connect()` returns a promise but the SettingsPanel callback
              // is sync — fire-and-forget.  The engine fires
              // `onConnectedChange` from inside the subsystem on success,
              // which lands as `setSpaceMouseConnected(true)` in
              // useEngineSettings; the React state flip is the source of
              // truth for the "connected" indicator.
              void handleRef.current?.input.spaceMouse.connect();
            }}
            spaceMouseSensitivity={spaceMouseSensitivity}
            onSpaceMouseSensitivityChange={(value) => {
              // No engine echo for sensitivity, so update React state
              // optimistically AND forward to the engine in the same
              // handler.  Same pattern as filaments / volumes master
              // toggles where React owns the truth.
              setSpaceMouseSensitivity(value);
              handleRef.current?.input.spaceMouse.setSensitivity(value);
            }}
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
            onBiasModeChange={(m) => handleRef.current?.bias.setMode(m)}
            absMagLimit={absMagLimit}
            onAbsMagLimitChange={(M) => handleRef.current?.bias.setAbsMagLimit(M)}
            // ── HDR tone-map curve ───────────────────────────────────────────
            //
            // Same forward-to-handle pattern as the bias controls above — the
            // engine fires its `onToneMapCurveChange` echo synchronously inside
            // `setToneMapCurve`, which lands here as `setToneMapCurve` (above
            // in the createEngine callbacks block).  No optimistic updates
            // needed.
            toneMapCurve={toneMapCurve}
            onToneMapCurveChange={(c) => handleRef.current?.tonemap.setCurve(c)}
            // Exposure slider was evicted with brightness (audit Q6 —
            // explorer surface has zero luminance knobs; the tone-map
            // curve handles HDR shaping).  The engine method
            // `handleRef.current?.tonemap.setExposure(...)` is still
            // callable via the dev console if a power-user wants to
            // override.
            // ── Scalar-volume overlay ─────────────────────────────────────
            //
            // `volumesEnabled` is the master toggle — no engine echo, owned
            // optimistically in React state (same pattern as filamentsEnabled).
            // The change handler updates React state first, then forwards to
            // the engine handle so the render pass knows to skip all fields.
            //
            // `volumeFields` is rebuilt by `_onVolumeFieldsChangedTarget` whenever
            // the engine fires `onVolumeFieldsChanged` (add / remove).  Individual
            // setters (`setVolumeFieldEnabled` / `setVolumeFieldIntensity`) do NOT
            // fire `onVolumeFieldsChanged`; the SettingsPanel updates its per-field
            // checkbox / slider through normal React onChange (optimistic — the
            // engine mutates its internal settings bag but doesn't echo back).
            // Volumes — always wired.  Per-field defaults (CF-4 off,
            // MCPM on, synthetic fixtures off + DEV-only) decide what
            // the user sees on first paint.
            volumesEnabled={volumesEnabled}
            onVolumesEnabledChange={(v: boolean) => {
              setVolumesEnabled(v);
              handleRef.current?.volumes.setMasterEnabled(v);
            }}
            volumeFields={visibleVolumeFields}
            onVolumeFieldEnabledChange={(handle: string, enabled: boolean) => {
              // Optimistic React-state update — the engine setter does NOT
              // fire onVolumeFieldsChanged for tunable mutations (only for
              // add/remove), so the controlled-input value would otherwise
              // snap back on the next render.  We update local state first
              // so the UI stays responsive, then forward to the engine.
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, enabled } : f)),
              );
              handleRef.current?.volumes.setEnabled(handle, enabled);
            }}
            onVolumeFieldIntensityChange={(handle: string, intensity: number) => {
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, intensity } : f)),
              );
              handleRef.current?.volumes.setIntensity(handle, intensity);
            }}
            onVolumeFieldContrastChange={(handle: string, contrast: number) => {
              // Same optimistic-update pattern as intensity: local
              // React state for input responsiveness, then forward to
              // the engine.  The engine setter is the source of truth
              // for the shader uniform; React state mirrors what the
              // user just dragged.
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, contrast } : f)),
              );
              handleRef.current?.volumes.setContrast(handle, contrast);
            }}
            onVolumeFieldDensityScaleChange={(handle: string, densityScale: number) => {
              // Same shape as the intensity / contrast handlers.  The
              // engine's `setVolumeFieldDensityScale` also mirrors the
              // value into `state.settings.volumeFields[handle]` so
              // both layers agree.
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, densityScale } : f)),
              );
              handleRef.current?.volumes.setDensityScale(handle, densityScale);
            }}
            onVolumeFieldTrimChange={(handle: string, trim: number) => {
              // Same optimistic-update pattern as the contrast / density
              // handlers above: local React state first for input
              // responsiveness, then forward to the engine which mirrors
              // the value into state.settings.volumes.fields[handle].trim
              // and writes the per-cube uniform.
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, trim } : f)),
              );
              handleRef.current?.volumes.setTrim(handle, trim);
            }}
            onVolumeFieldExposureChange={(handle: string, exposure: number) => {
              // Same optimistic-update pattern as the trim handler
              // above: local React state first for input responsiveness,
              // then forward to the engine which mirrors the value into
              // state.settings.volumes.fields[handle].exposure and writes
              // the per-cube uniform.
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, exposure } : f)),
              );
              handleRef.current?.volumes.setExposure(handle, exposure);
            }}
            onVolumeFieldPaletteChange={(handle: string, paletteId: ScalarFieldPaletteId) => {
              setVolumeFields(
                volumeFields.map((f) => (f.handle === handle ? { ...f, paletteId } : f)),
              );
              handleRef.current?.volumes.setPalette(handle, paletteId);
            }}
          />
          {/*
          Stats panel — read-only telemetry: rolling FPS, per-survey loaded
          counts, optional filaments-loaded row.  All four props are values
          App.tsx already tracks for other reasons, so wiring them here is
          essentially free.
        */}
          <StatsPanel
            defaultOpen={false}
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
        {/*
        Top-center pill row.  SearchTrigger and AutoRotateToggle share
        a single flex wrapper so they stay coordinated when the palette
        opens (both fade together) and so the layout has a single
        source of truth for placement.  See `.topBar` in App.module.css.
      */}
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen} />
          <AutoRotateToggle
            playing={autoRotate}
            onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
            hidden={paletteOpen}
          />
        </div>
        <CommandPalette
          entries={paletteEntries}
          aliasIndex={aliasIndex ?? undefined}
          open={paletteOpen}
          onClose={closePalette}
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
              handleRef.current?.camera.focusOnMilkyWay();
              return;
            }
            handleRef.current?.selection.selectFamous(id);
          }}
          onSelectAlias={(target) => handleRef.current?.selection.selectByAlias(target)}
        />
        {/*
        Debug panel.  Toggled by `d`.  Gated on `status.kind !== 'initializing'`
        so `handleRef.current.assetSlots` is populated before the panel
        subscribes to each slot.  `timingService` reads through the
        engine's `debug` sub-handle getter so the panel sees the live
        value once `?gpuTimings` + the adapter feature line up.
      */}
        {loadingDevPanelOpen &&
          status.kind !== 'initializing' &&
          handleRef.current?.assetSlots && (
            <DebugPanel
              slots={handleRef.current.assetSlots}
              timingService={handleRef.current.debug.timingService}
              passOverrides={handleRef.current.debug.passOverrides}
              // Orientation-fallback diagnostic toggles — moved out of
              // SettingsPanel per the 2026-05-19 UX audit (Q16g).  Same
              // forward-only flow as the engine handle's other points
              // setters: the setter fires its echo callback synchronously,
              // so React state mirrors engine truth without an optimistic
              // local update here.
              highlightFallback={highlightFallback}
              realOnlyMode={realOnlyMode}
              onHighlightFallbackChange={(enabled) => {
                handleRef.current?.points.setHighlightFallback(enabled);
              }}
              onRealOnlyModeChange={(enabled) => {
                handleRef.current?.points.setRealOnly(enabled);
              }}
            />
          )}
      </div>
    </>
  );
}
