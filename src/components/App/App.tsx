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
 *   5. `useUrlSync` — owns the entire `window.location.hash` lifecycle for
 *      both `#focus=<galaxyId>` and `#poi=<poiId>` schemes in one place.
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
import { hasUrlGate } from '../../utils/url/urlGate';
import { isWebHIDSupported } from '../../services/input/spaceMouse';

// ── Dev-panel availability gate ────────────────────────────────────────────
//
// Whether the `d` keyboard shortcut should be wired up at all.  In dev
// builds we always wire it; in production it's only wired when
// `?debug` is in the URL — same escape-hatch contract the panel had
// before, just gated on actual key presses now (default-hidden) so it
// doesn't clutter the UI for everyone running a dev server.  The bare-
// flag form matches every other dev gate (`?volumes`, `?anchors`).
//
// `import.meta.env.DEV` is statically replaced by Vite at build time
// (true in dev, false in prod).  Rollup CAN'T tree-shake the
// DebugPanel because the second predicate (`hasUrlGate('debug')`)
// is a runtime call — the DebugPanel module ships in the production
// bundle, but the JSX simply never renders unless the user adds
// `?debug` to the URL.  Runtime cost in production is one boolean
// check per render and a single un-loaded React component reference,
// which is acceptable for a debug-only feature with an explicit
// activation gesture.
//
// SSR-safety lives inside `hasUrlGate` (see `utils/url/urlGate.ts`):
// a `typeof window` guard plus a try/catch around `URLSearchParams`
// so unit tests rendering `<App />` without a DOM don't blow up.
function isDebugPanelAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  return hasUrlGate('debug');
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

  // ── Focused-POI React mirror (drives the #poi=… URL hash) ─────────────
  //
  // The engine fires `onPoiFocusChange(poiId | null)` whenever the user
  // clicks a POI ring (or commits via a deep-link drain).  We mirror
  // that into React state so `useUrlSync` can write the hash, and
  // future presentation chrome (POI InfoCard body in Task 14) can
  // branch on it.  React's `useState` setter is stable, so it's safe
  // to pass through `extraCallbacks` — which useEngine captures once
  // at first render and never re-binds.
  //
  // Declared BEFORE the useEngine call so the setter is in scope for
  // the callbacks block below.  Parallel to the existing `focused`
  // (galaxy) state useEngine itself owns; we keep the POI mirror
  // App-side because the cluster-viz feature work landed after the
  // useEngine extraction, and adding another engine-owned slice would
  // bloat that hook for a single feature.
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null);

  // ── Hovered-POI React mirror (drives the InfoCard hover preview) ──────
  //
  // Parallel to `focusedPoiId` above, but for the hover surface rather
  // than the pinned-focus surface.  The engine fires
  // `onPoiHoverChange(poiId | null)` whenever the cursor moves on / off
  // a cluster / supercluster / void ring.  We mirror that into local
  // state so `<InfoCard>` can render the slim `CompactPoiCard` preview.
  //
  // No URL sync (unlike focusedPoi) — hover state is ephemeral and
  // syncing it to the hash would pollute browser history with one
  // entry per ring the user mouses over.
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const {
    pointSize,
    brightness,
    autoRotate,
    galaxyTexturesEnabled,
    labelCategoryVisibility,
    milkyWayEnabled,
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
    exposure,
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
      // POI focus echo — engine fires this on POI-ring click / palette
      // pick / deep-link drain.  Mirrors into `focusedPoiId` so
      // `useUrlSync` can keep `#poi=<id>` in lock-step with the
      // selection.  Merge with `settingsCallbacks.camera` so the
      // settings-hook's `onAutoRotateChange` echo survives — a bare
      // `camera: { ... }` here would overwrite the whole sub-bag and
      // silently drop sibling echoes from the spread above.
      // `setFocusedPoiId` is a stable React setter so useEngine's
      // "capture once" contract holds.
      camera: {
        ...settingsCallbacks.camera,
        onPoiFocusChange: setFocusedPoiId,
      },
      // POI hover echo — engine fires this on cursor enter/leave for
      // any cluster / supercluster / void ring.  Mirrors into
      // `hoveredPoiId` so `<InfoCard>` can render the hover preview.
      // Sister wiring to `camera.onPoiFocusChange` above; sits in the
      // `selection` bag because hover is a selection-class concept
      // (mirrors the existing `selection.onHoverChange` for galaxies).
      // `setHoveredPoiId` is a stable React setter — useEngine's
      // "capture once" contract holds the same way as for the focus
      // pair.
      selection: {
        onPoiHoverChange: setHoveredPoiId,
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

  // ── Volumes-section visibility gate ──────────────────────────────────────
  //
  // The Volumes UI (master toggle + per-field rows + palette dropdown) is
  // a developer / power-user surface — currently it's only useful in
  // combination with the synthetic test fixtures auto-loaded under
  // `import.meta.env.DEV`.  In production builds the section would be
  // empty (no fixtures load) but still take up panel space; gating it
  // keeps the production UI focused on shipped features.
  //
  // Two ways to opt in:
  //   - Dev builds (`npm run dev`) → always visible, no opt-in needed.
  //   - Production builds → append `?volumes=1` to the URL to enable
  //     both the UI section AND (when wired in `wireSlots`) the
  //     synthetic-fixture bootstrap.
  //
  // The flag is computed once at component construction.  Toggling
  // mid-session via History API is a future extension; for now a reload
  // is the way to flip it.
  const volumesUiEnabled = useMemo<boolean>(() => {
    if (import.meta.env.DEV) return true;
    return hasUrlGate('volumes');
  }, []);

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
  // Default false so the panel doesn't clutter the screen during normal
  // dev work.  `d` toggles it on/off (see useKeyboardShortcuts).  The
  // panel itself is gated on `isDebugPanelAvailable()` further down,
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
    focusedPoiId,
    ready: status.kind === 'ready',
    pois: staticPois,
    engineHandleRef: handleRef,
  });

  // ── Resolved focused POI (drives the InfoCard POI body) ──────────────────
  //
  // The engine emits the focused POI as an id (string).  The InfoCard
  // needs the full `PointOfInterest` to render name / category / radius /
  // distance.  We resolve the id → POI here (rather than tracking a
  // parallel `focusedPoi` state) so the static-anchor table remains the
  // single source of truth: a tier swap that replaces the table would
  // automatically invalidate a stranded focus by `find` returning
  // undefined.
  //
  // useMemo because InfoCard is wrapped in React.memo (via its prop
  // identity) and we don't want a fresh PointOfInterest reference each
  // render to defeat that.  Cost is one O(~50) array scan when either
  // dependency changes; both change very rarely (focusedPoiId only on
  // user POI click or deep-link, staticPois exactly once at mount).
  //
  // Famous-galaxy POIs (`focusedPoiId` starting with `famous-…`) won't
  // resolve here — they're not in `staticPois`.  The fallback is null,
  // which renders no POI body; the famous-galaxy InfoCard flow goes
  // through the galaxy-selection path instead, so this isn't a
  // regression.
  const focusedPoi = useMemo(
    () => (focusedPoiId ? (staticPois.find((p) => p.id === focusedPoiId) ?? null) : null),
    [focusedPoiId, staticPois],
  );

  // ── Resolved hovered POI (drives the InfoCard hover preview) ──────────
  //
  // Same shape as `focusedPoi` above — id-from-engine + lookup into
  // `staticPois` — but for the hover surface.  Same memoization
  // rationale: InfoCard's prop identity feeds React's reconciliation,
  // and a fresh PointOfInterest reference per render would defeat
  // shallow-equality checks downstream.  Cost is one O(~50) array
  // scan whenever `hoveredPoiId` changes; `staticPois` is built once
  // at mount so it doesn't drive re-runs.
  //
  // Tier-swap defence: if the static POI table is rebuilt mid-hover
  // and the hovered id is no longer present, `find` returns undefined
  // → `?? null` → the preview disappears.  Same belt-and-braces story
  // as the focused-POI resolver above.
  const hoveredPoi = useMemo(
    () => (hoveredPoiId ? (staticPois.find((p) => p.id === hoveredPoiId) ?? null) : null),
    [hoveredPoiId, staticPois],
  );

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
          hovered={hoveredPoi ?? hovered}
          selected={focusedPoi ?? selected}
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
            brightness={brightness}
            autoRotate={autoRotate}
            onPointSizeChange={(v) => handleRef.current?.points.setSize(v)}
            onBrightnessChange={(v) => handleRef.current?.points.setBrightness(v)}
            onAutoRotateChange={(v) => handleRef.current?.camera.setAutoRotate(v)}
            // Galaxy-thumbnail toggle: forward straight to the engine handle. The
            // engine fires `onGalaxyTexturesEnabledChange` synchronously, which
            // updates `galaxyTexturesEnabled` — so we don't need an optimistic
            // local `setGalaxyTexturesEnabled(v)` here. The `?.` on the setter
            // covers the (unlikely) case where the handle is missing the method;
            // the EngineHandle type marks `setGalaxyTexturesEnabled` as optional.
            galaxyTexturesEnabled={galaxyTexturesEnabled}
            onGalaxyTexturesChange={(enabled) => {
              handleRef.current?.thumbnails.setEnabled(enabled);
            }}
            milkyWayEnabled={milkyWayEnabled}
            onMilkyWayEnabledChange={(enabled) => {
              handleRef.current?.milkyWay.setEnabled(enabled);
            }}
            labelCategoryVisibility={labelCategoryVisibility}
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
              handleRef.current?.tonemap.setExposure(value);
            }}
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
            // Volumes section is gated on `volumesUiEnabled` (dev build OR
            // `?volumes=1` in the URL).  When the gate is closed, every volume
            // prop is omitted; the SettingsPanel's `showVolumesSection`
            // requires all five to be present, so the section disappears
            // entirely — both the master toggle and the per-field rows.
            {...(volumesUiEnabled
              ? {
                  volumesEnabled,
                  onVolumesEnabledChange: (v: boolean) => {
                    setVolumesEnabled(v);
                    handleRef.current?.volumes.setMasterEnabled(v);
                  },
                  volumeFields: visibleVolumeFields,
                  onVolumeFieldEnabledChange: (handle: string, enabled: boolean) => {
                    // Optimistic React-state update — the engine setter does NOT
                    // fire onVolumeFieldsChanged for tunable mutations (only for
                    // add/remove), so the controlled-input value would otherwise
                    // snap back on the next render.  We update local state first
                    // so the UI stays responsive, then forward to the engine.
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, enabled } : f)),
                    );
                    handleRef.current?.volumes.setEnabled(handle, enabled);
                  },
                  onVolumeFieldIntensityChange: (handle: string, intensity: number) => {
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, intensity } : f)),
                    );
                    handleRef.current?.volumes.setIntensity(handle, intensity);
                  },
                  onVolumeFieldContrastChange: (handle: string, contrast: number) => {
                    // Same optimistic-update pattern as intensity: local
                    // React state for input responsiveness, then forward to
                    // the engine.  The engine setter is the source of truth
                    // for the shader uniform; React state mirrors what the
                    // user just dragged.
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, contrast } : f)),
                    );
                    handleRef.current?.volumes.setContrast(handle, contrast);
                  },
                  onVolumeFieldDensityScaleChange: (handle: string, densityScale: number) => {
                    // Same shape as the intensity / contrast handlers.  The
                    // engine's `setVolumeFieldDensityScale` also mirrors the
                    // value into `state.settings.volumeFields[handle]` so
                    // both layers agree.
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, densityScale } : f)),
                    );
                    handleRef.current?.volumes.setDensityScale(handle, densityScale);
                  },
                  onVolumeFieldTrimChange: (handle: string, trim: number) => {
                    // Same optimistic-update pattern as the contrast / density
                    // handlers above: local React state first for input
                    // responsiveness, then forward to the engine which mirrors
                    // the value into state.settings.volumes.fields[handle].trim
                    // and writes the per-cube uniform.
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, trim } : f)),
                    );
                    handleRef.current?.volumes.setTrim(handle, trim);
                  },
                  onVolumeFieldExposureChange: (handle: string, exposure: number) => {
                    // Same optimistic-update pattern as the trim handler
                    // above: local React state first for input responsiveness,
                    // then forward to the engine which mirrors the value into
                    // state.settings.volumes.fields[handle].exposure and writes
                    // the per-cube uniform.
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, exposure } : f)),
                    );
                    handleRef.current?.volumes.setExposure(handle, exposure);
                  },
                  onVolumeFieldPaletteChange: (handle: string, paletteId: ScalarFieldPaletteId) => {
                    setVolumeFields(
                      volumeFields.map((f) => (f.handle === handle ? { ...f, paletteId } : f)),
                    );
                    handleRef.current?.volumes.setPalette(handle, paletteId);
                  },
                }
              : {})}
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
        Debug panel.  Mounted only in dev builds or when `?debug` is
        present in the URL.  Gated on `status.kind !== 'initializing'`
        because the engine populates its asset-slot registry inside
        the async GPU init IIFE — once the engine has transitioned
        out of `initializing`, every slot exists on
        `handleRef.current.assetSlots`, so the panel's first render
        is guaranteed to see the full slot set and subscribe to each
        one.  The `timingService` prop reads through the engine's
        `debug` sub-handle getter so it reflects the live value
        assigned by the async GPU init IIFE (initially `null`, then
        the constructed service once `?gpuTimings` and the adapter
        feature both line up).
      */}
        {isDebugPanelAvailable() &&
          loadingDevPanelOpen &&
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
