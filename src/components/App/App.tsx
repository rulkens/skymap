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
import { createEngine } from '../../services/engine';
import type {
  EngineHandle,
  EngineStatus,
  PointCloud,
  PointInfo,
  ScaleInfo,
} from '../../@types';
import type { LoadProgressState } from '../../@types/EngineCallbacks';
import type { LodMode } from '../../@types/LodMode';
import type { Tier } from '../../@types/Tier';
import { initialTierFromViewport } from '../../utils/initialTierFromViewport';
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
import { ALL_SOURCES, Source } from '../../data/sources';
import { BiasMode } from '../../data/biasMode';
import { ToneMapCurve } from '../../data/toneMapCurve';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_SPACE_MOUSE_SENSITIVITY,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
} from '../../data/defaults';
import { isWebHIDSupported } from '../../services/input/spaceMouse';
import {
  loadFamousSidecars,
  type FamousMetaEntry,
  type FamousXrefMap,
} from '../../services/engine/famousMetaLoader';
import {
  loadPgcAliases,
  type AliasIndexEntry,
} from '../../services/engine/pgcAliasLoader';
import { useFocusUrlSync } from '../../hooks/useFocusUrlSync';
import { resolveFocusTarget } from '../../services/engine/resolveFocusTarget';

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
  // Initial values seeded from `data/defaults.ts` — single source of
  // truth shared with the engine so the SettingsPanel doesn't briefly
  // flash a stale value before the engine's first echo callback fires.
  // See `data/defaults.ts` for per-default rationale.
  const [pointSize, setPointSize] = useState<number>(DEFAULT_POINT_SIZE_PX);
  const [brightness, setBrightness] = useState<number>(DEFAULT_BRIGHTNESS);
  const [autoRotate, setAutoRotate] = useState<boolean>(DEFAULT_AUTO_ROTATE);
  const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState<boolean>(
    DEFAULT_GALAXY_TEXTURES_ENABLED,
  );
  const [milkyWayEnabled, setMilkyWayEnabled] = useState<boolean>(DEFAULT_MILKY_WAY_ENABLED);
  // Cosmic-web filament-skeleton overlay toggle.  Defaults OFF
  // (`DEFAULT_FILAMENTS_ENABLED`) because the underlying `filaments.bin`
  // is an optional asset built by `npm run build-filaments` — fresh
  // clones won't have it and an on-by-default toggle would silently
  // do nothing.  Unlike `galaxyTexturesEnabled`/`milkyWayEnabled`, the
  // engine does NOT fire an echo callback for this field, so we update
  // React state optimistically inside the change handler below.
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(DEFAULT_FILAMENTS_ENABLED);
  const [filamentIntensity, setFilamentIntensity] = useState<number>(DEFAULT_FILAMENT_INTENSITY);
  // Strip + vertex counts from the optional cosmic-web `filaments.bin`.
  // Stays null until the engine fires `onFilamentsReady` (one-shot, after
  // the binary lands).  The StatsPanel uses both this value and
  // `filamentsEnabled` to decide whether to render the filaments row —
  // when the file isn't on disk (fresh clone before `npm run build-filaments`),
  // this stays null forever and the row stays hidden, which is the
  // visually-clean default.
  const [filamentCounts, setFilamentCounts] = useState<{
    stripCount: number;
    vertexCount: number;
  } | null>(null);
  const [highlightFallback, setHighlightFallback] = useState<boolean>(DEFAULT_HIGHLIGHT_FALLBACK);
  const [realOnlyMode, setRealOnlyMode] = useState<boolean>(DEFAULT_REAL_ONLY_MODE);
  const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(DEFAULT_DEPTH_FADE_ENABLED);

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
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(DEFAULT_VISIBLE_SOURCE_MASK);
  const [lodMode, setLodMode] = useState<LodMode>(DEFAULT_LOD_MODE);

  // ── Data tier (small / medium / large) ─────────────────────────────────
  //
  // Seeded from the viewport width at mount via `initialTierFromViewport`:
  //   < 768px → 'small'  (mobile)
  //   ≥ 768px → 'medium' (default)
  // 'large' is never auto-selected — opt-in only via the panel.
  //
  // Echoed by the engine via `onTierChange` so React mirrors engine truth
  // (same lifecycle pattern as `lodMode` and `visibleSourceMask`).
  // Lazy-init: `window` is only safe to read inside the initializer
  // callback, since SSR hosts (in unit tests) might not have it.  We do
  // NOT subscribe to resize events — the tier is a one-shot mount-time
  // decision; the user changes it explicitly via the segmented control.
  const [currentTier, setCurrentTier] = useState<Tier>(() =>
    typeof window !== 'undefined' ? initialTierFromViewport(window.innerWidth) : 'medium',
  );

  // ── Initial mobile signal (drives panel-collapse on first paint) ─────────
  //
  // Same 768-px breakpoint as `initialTierFromViewport` — small viewports
  // get the small data tier AND get the Navigation / Stats / Settings panels
  // collapsed by default so the canvas isn't covered on first paint.  One-
  // shot: read once at mount, no resize listener.  Re-orienting a phone in
  // the middle of a session shouldn't yank the user's expanded panels back
  // closed under them.
  //
  // SSR-safe: in unit tests where `window` is undefined we fall back to the
  // desktop default (panels open).
  const initialMobile =
    typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  const initialPanelsOpen = !initialMobile;

  // ── Rolling FPS readout ──────────────────────────────────────────────────
  //
  // Driven by the engine's `onFpsChange` callback, which fires only when
  // the rounded integer FPS value changes (see EngineCallbacks).  A 0
  // initial value is correct: the engine produces no readout until at
  // least 2 frames have elapsed, and a 0 in the status bar during that
  // sub-100 ms window is fine — by the time the user can read it, the
  // first real value has already overwritten it.
  const [fps, setFps] = useState<number>(0);

  // Per-source point counts, indexed by Source enum value. Populated as each
  // .bin file finishes loading via the engine's `onCloudReady` callback.
  // Surfaced in SettingsPanel so users see how many points each survey
  // contributes — a 220 k SDSS slice carries different visual weight than a
  // 5 M GLADE one, and the count makes that legible at a glance.
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<Source, number>>>({});

  // ── Loading-bar state ──────────────────────────────────────────────────────
  //
  // `null` when no fetches are in flight (the LoadingBar component fades
  // itself out when this becomes null).  The engine's aggregator owns the
  // truth and pushes a fresh snapshot through `onLoadProgress` whenever the
  // per-source progress map mutates — start, progress, finish events all
  // converge to a single React state update here.
  //
  // We don't memoise — React.setState is referential-equality safe for the
  // null transition, and the per-chunk update rate is bounded by network
  // cadence (tens per second on a fast link) which is fine for React's
  // reconciler.
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);

  // ── SpaceMouse state (optional, WebHID-only) ─────────────────────────────
  //
  // `spaceMouseConnected` mirrors the engine's view of pairing — flipped to
  // true only when `connectSpaceMouse()` resolves with `ok = true`, and back
  // to false on disconnect. `spaceMouseSensitivity` is the slider value;
  // 1.0 is the factory default and matches what the engine uses internally.
  const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);
  const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(
    DEFAULT_SPACE_MOUSE_SENSITIVITY,
  );

  // ── Density-correction state (Malmquist bias, Tasks 1–5) ─────────────────
  //
  // `biasMode` mirrors the engine's current correction strategy; `None` is
  // the safe default so first-time visitors see the raw catalog (and the
  // engine's init value matches, avoiding a flicker on first paint).
  // `absMagLimit` is the M_lim threshold used when `biasMode` is
  // `VolumeLimited`; default −19 mag is a conventional SDSS spec-sample
  // boundary (~M*+1).  Both are echoed by the engine's `onBiasModeChange` /
  // `onAbsMagLimitChange` callbacks so React state stays in sync if the
  // engine ever changes them on its own (e.g. a future preset loader).
  const [biasMode, setBiasMode] = useState<BiasMode>(DEFAULT_BIAS_MODE);
  const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);

  // ── HDR tone-map state ────────────────────────────────────────────────────
  //
  // `toneMapCurve` mirrors the engine's current HDR tone-map curve.  Default
  // matches the engine's init value (Reinhard) so the first paint of the
  // dropdown matches what the user sees on the canvas — no flicker.  The
  // engine echoes via `onToneMapCurveChange` at startup *and* on every
  // setToneMapCurve call, so React stays in sync.
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurve>(DEFAULT_TONE_MAP_CURVE);
  // `exposure` mirrors the engine's HDR pre-tone-map multiplier.  Default
  // 1.0 matches the engine's init value so the slider thumb starts in the
  // middle of its 0.1..4.0 range without flicker.  Echoed by the engine
  // via `onExposureChange` at startup *and* on every clamped setExposure
  // call, so the displayed value is always the effective one — even if a
  // devtools call passes a wild number that the engine clamps to 16.
  const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);

  // ── Command palette state ─────────────────────────────────────────────────
  //
  // `paletteOpen` controls the overlay visibility; `famousMeta` holds the
  // loaded famous-galaxy entries.  The meta is fetched once at mount (the
  // same data the engine loaded at startup) so the palette can filter and
  // display names without a second round-trip.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [famousMeta, setFamousMeta] = useState<FamousMetaEntry[]>([]);
  // Companion xrefs sidecar — paired with `famousMeta` so the deep-link
  // drain can hand both to `engine.selectByAlias` and dodge the engine's
  // internal sidecar-load race.  See the `selectByAlias` JSDoc for why
  // the override exists.
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});

  // ── Alias-search state ───────────────────────────────────────────────────
  //
  // The PGC->aliases JSON sidecar is ~1.7 MB and we don't pay that cost on
  // engine startup.  Instead, when the palette opens for the first time, we
  // kick off `loadPgcAliases()` and join the result against the GLADE and
  // 2MRS clouds' `objIDs` arrays to produce a single flat alias index the
  // palette can search.  Subsequent palette opens reuse the cached index.
  //
  // `aliasIndex === null` means "not loaded yet"; `[]` means "loaded but
  // empty" (sidecar absent, or join produced no hits).  The palette
  // accepts undefined/empty without complaint.
  const [aliasIndex, setAliasIndex] = useState<readonly AliasIndexEntry[] | null>(null);
  // Tracks whether we've already kicked off the lazy load — useEffect's
  // `paletteOpen` dependency would otherwise re-trigger on every open.
  const aliasLoadStarted = useRef(false);

  // Raw PGC->aliases Map.  Same lifecycle as `aliasIndex` (populated
  // inside the same `loadPgcAliases().then(...)` block), but kept as the
  // unflattened lookup table so the deep-link resolver can use it as the
  // "is this PGC a real galaxy in HyperLEDA?" oracle for the
  // tier-vs-unknown distinction.  Starts as an empty Map so the
  // resolver can call `aliasMap.has(...)` without a null guard; an
  // empty map just means we haven't loaded yet, in which case unknown
  // PGCs collapse to `unknown` instead of `tier`.  That trade-off is
  // documented in `resolveFocusTarget.ts`: a deep link to a PGC that's
  // only present in a larger tier silently fails on the very first
  // navigation if the user hasn't opened the palette yet.  The tier
  // banner does fire if the user retries after the palette warm-up
  // populates the map.
  const [aliasMap, setAliasMap] = useState<ReadonlyMap<bigint, readonly string[]>>(
    () => new Map(),
  );

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
      onMilkyWayEnabledChange: setMilkyWayEnabled,
      // Task 15 — orientation toggles echo back from the engine so React
      // state stays in sync if the engine ever flips them programmatically.
      onHighlightFallbackChange: setHighlightFallback,
      onRealOnlyModeChange: setRealOnlyMode,
      onDepthFadeEnabledChange: setDepthFadeEnabled,
      // LOD mode is seeded by the engine at init, then echoed back any time
      // `setLodMode` runs (or `setSourceVisible` flips us to manual).
      onLodModeChange: setLodMode,
      // Mirror the engine's source mask back into React.  Critical for fixing
      // the "first toggle is a no-op" bug: auto-LOD recomputes the engine mask
      // continuously, and without this echo React's checkbox state would drift
      // away from engine truth, making the first user toggle silently agree
      // with engine state instead of flipping it.
      onSourceMaskChange: setVisibleSourceMask,
      // Each .bin lands at its own pace; record the count so the SettingsPanel
      // can show "SDSS  220,453" alongside the toggle. Functional update so
      // multiple parallel arrivals don't clobber each other.
      onCloudReady: (source, count) => setSourceCounts((prev) => ({ ...prev, [source]: count })),
      // One-shot: fires after the optional cosmic-web filaments.bin lands.
      // The StatsPanel surfaces these counts ("Filaments · 3,845 strips,
      // 27,410 verts") whenever the user has the filaments overlay enabled.
      // No null-out path: the engine never reports filaments unloading
      // because the asset is loaded once and stays in GPU memory for the
      // session — the user toggles visibility, not lifecycle.
      onFilamentsReady: (stripCount, vertexCount) =>
        setFilamentCounts({ stripCount, vertexCount }),
      // Rolling FPS — engine throttles to integer-change events so this is a
      // cheap direct setState (no debounce / no useMemo needed).
      onFpsChange: setFps,
      // Density-correction echoes (Malmquist bias).  Engine fires these at
      // startup with its own defaults *and* every time `setBiasMode` /
      // `setAbsMagLimit` mutates them, so React's SettingsPanel always
      // reflects engine truth without optimistic local updates.
      onBiasModeChange: setBiasMode,
      onAbsMagLimitChange: setAbsMagLimit,
      // HDR tone-map echo — mirrors the bias-mode pattern.  Engine seeds
      // its default at init (Reinhard) and fires on every setToneMapCurve.
      onToneMapCurveChange: setToneMapCurve,
      // Exposure echo — same lifecycle as the tone-curve echo above.  The
      // engine seeds its default (1.0) at init and re-fires on every
      // clamped setExposure, so React's slider position always reflects
      // the effective value the shader is using.
      onExposureChange: setExposure,
      // SpaceMouse pairing state: `connect()`'s promise gives us the initial
      // success/failure, but only this callback covers spontaneous disconnects
      // (USB unplug, permission revocation).  Without it React's "Connected"
      // indicator could persist after the puck is gone.
      onSpaceMouseConnectedChange: setSpaceMouseConnected,
      // ── Data-tier wiring (Phase 3) ───────────────────────────────────────
      //
      // `initialTier` lets the engine pick the right `<source>-<tier>.bin`
      // files on first load; we read the viewport-derived value from the
      // React state (lazy-initialised above) so the engine and React agree
      // on the seed without a separate code path.  `onTierChange` echoes
      // back any tier mutation (including the engine's own seed) so React
      // state mirrors engine truth — same lifecycle as onLodModeChange.
      initialTier: currentTier,
      onTierChange: setCurrentTier,
      // Aggregated download-progress snapshot (or null when no fetches are
      // in flight).  Fires through the engine's `loadProgressAggregator`
      // for both the initial parallel `loadAllClouds` and every
      // `setTier`-triggered hot-swap.  The LoadingBar component fades
      // itself out when this becomes null.
      onLoadProgress: setLoadProgress,
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

  // ── Famous-galaxy meta loader ──────────────────────────────────────────────
  //
  // Load the famous sidecars once at mount so the CommandPalette has names +
  // descriptions to filter against.  The engine loads the same file internally,
  // but exposing it here avoids reaching into the engine's internal state.
  // Double-loading is cheap (the browser caches the JSON fetch).
  useEffect(() => {
    loadFamousSidecars().then((sc) => {
      setFamousMeta(sc.meta);
      setFamousXrefs(sc.xrefs);
    });
  }, []);

  // ── Alias index — lazy-built on first palette open ────────────────────────
  //
  // Two-phase pipeline:
  //
  //   1. Fetch `pgc_aliases.json` (the PGC -> human-name Map).
  //   2. Walk both GLADE and 2MRS objIDs, look up each non-zero PGC in
  //      that Map, emit one `AliasIndexEntry` per match.
  //
  // Both phases happen exactly once per session; the result is held in
  // `aliasIndex` state and reused on subsequent opens.  We trigger off
  // `paletteOpen` (rather than at engine-ready time) because most users
  // never hit Cmd+K — paying the 1.7 MB JSON download up front would be
  // wasteful for them.
  //
  // The `sourceCounts` dependency ensures the effect re-runs when each
  // cloud finishes loading; the `engine.getCloudObjIds()` calls inside
  // would return undefined before that.  We *also* require both 2MRS
  // and GLADE counts to be non-zero before kicking off so we don't
  // build a half-populated index from a mid-load engine state.
  useEffect(() => {
    if (!paletteOpen) return;
    if (aliasLoadStarted.current) return;
    const handle = handleRef.current;
    if (!handle?.getCloudObjIds) return;
    // Don't kick off until both GLADE and 2MRS have at least started loading.
    // Without this guard the join walks a missing array and emits no entries,
    // permanently caching an empty index.
    const gladeCount = sourceCounts[Source.Glade] ?? 0;
    const twoMrsCount = sourceCounts[Source.TwoMRS] ?? 0;
    if (gladeCount === 0 && twoMrsCount === 0) return;

    aliasLoadStarted.current = true;
    loadPgcAliases().then((loadedAliasMap) => {
      // Stash the raw Map for the deep-link resolver's tier-vs-unknown
      // oracle.  Done before the index build because the resolver only
      // needs `.has(pgc)`, not the per-source localIdx join — and a
      // future deep-link arrival should be able to consult the oracle
      // even before the (slower) index walk finishes if ever it grows
      // expensive.
      setAliasMap(loadedAliasMap);

      // Build the flat index — one entry per (cloud, localIdx) where the
      // PGC at that localIdx has at least one named alias.  Skip zero
      // PGCs (unmapped rows in the catalog cross-match).
      const out: AliasIndexEntry[] = [];
      for (const source of [Source.Glade, Source.TwoMRS] as const) {
        const objIds = handle.getCloudObjIds?.(source);
        if (!objIds) continue;
        for (let i = 0; i < objIds.length; i++) {
          const pgc = objIds[i]!;
          if (pgc === 0n) continue;
          const names = loadedAliasMap.get(pgc);
          if (!names || names.length === 0) continue;
          out.push({ pgc, names, source, localIdx: i });
        }
      }
      setAliasIndex(out);
    });
  }, [paletteOpen, sourceCounts]);

  // ── Deep-link focus URL sync ──────────────────────────────────────────────
  //
  // `useFocusUrlSync` does two things in one place:
  //
  //   1. On mount, parses any `#focus=…` from `window.location.hash`,
  //      surfaces it as `pendingTarget`, and scrubs the hash so a
  //      reload doesn't re-fire the same resolve forever.
  //   2. On every `selected` change, mirrors the selection back to the
  //      URL via `history.replaceState` (no new history entry per click).
  //
  // The drain effect below consumes `pendingTarget` once the engine and
  // the relevant clouds are ready.  See the hook's module header for
  // the full design rationale (replaceState vs pushState, mountedRef
  // guard for strict-mode double-mount, etc.).
  const { pendingTarget, clearPending } = useFocusUrlSync({ selected });

  // ── Drain the pending deep-link target once the engine is ready ──────────
  //
  // This effect re-runs whenever `pendingTarget`, `sourceCounts`,
  // `famousMeta`, or `aliasMap` change because each is a precondition
  // for at least one resolver branch:
  //
  //   - `pendingTarget`        — the thing we're trying to resolve.
  //   - `sourceCounts`         — proxy for "has at least one cloud landed?"
  //                              (`onCloudReady` is what grows this map).
  //   - `famousMeta`           — required for the `famous` branch.
  //   - `aliasMap`             — required for the `pgc` tier-vs-unknown
  //                              oracle.
  //
  // We don't try to be cleverer (e.g. only re-run when the *specific*
  // cloud the target needs has loaded).  The cost of an extra resolve
  // pass over a few-row cloud is sub-millisecond; the readability cost
  // of a finer-grained dependency array is far higher than the saving.
  useEffect(() => {
    if (!pendingTarget) return;
    // Wait for the engine to fully boot — `status.kind === 'ready'` is
    // the moment the render loop has started, which guarantees both the
    // first cloud upload AND `state.cam` are in place.  Resolving any
    // earlier means `selectByAlias` enters the tween dispatch with
    // `state.cam === null` and silently bails.
    if (status.kind !== 'ready') return;
    const handle = handleRef.current;
    if (!handle?.getCloud || !handle?.selectByAlias) return;

    // Build the resolver's `clouds` input from currently-loaded sources.
    // We skip Synthetic for two reasons: (1) the resolver excludes it
    // anyway because synthetic objIDs are sequential 0..N-1 and would
    // collide spuriously with low PGCs, and (2) keeping it out of the
    // input is tidier and saves a pass over the large `pos@` branch.
    const clouds: { source: Source; cloud: PointCloud }[] = [];
    for (const source of ALL_SOURCES) {
      if (source === Source.Synthetic) continue;
      const cloud = handle.getCloud(source);
      if (cloud) clouds.push({ source, cloud });
    }
    if (clouds.length === 0) return;

    const result = resolveFocusTarget({
      target: pendingTarget,
      clouds,
      famousMeta,
      aliasMap,
    });

    // Resolution during loading is monotonic: as more clouds, the
    // famousMeta sidecar, and the aliasMap arrive, the resolver's
    // answer can only promote `unknown → tier` or `unknown → resolved`,
    // never the other way.  So we MUST NOT collapse a transient
    // `unknown` into a permanent give-up here — doing so would lose
    // the deep link the moment the smallest cloud (typically Famous,
    // ~150 points) lands, before the actual survey catalogs arrive.
    //
    // Two definitive outcomes act here: `resolved` triggers the
    // selection (and the supersede effect below clears pending once
    // `selected` updates); `tier` leaves pending set so the eventual
    // banner can render off it.  `unknown` is just "not yet" — the
    // effect's `sourceCounts` / `famousMeta` / `aliasMap` deps will
    // re-fire it on the next data arrival.
    if (result.resolved) {
      // Pass App's own famousMeta + xrefs so `buildPointInfo` inside
      // `selectByAlias` doesn't read the engine's still-loading copy.
      // See the EngineHandle JSDoc for the race this avoids.
      handle.selectByAlias({
        source: result.source,
        localIdx: result.localIdx,
        famousMeta,
        famousXrefs,
      });
    }
  }, [pendingTarget, status, sourceCounts, famousMeta, famousXrefs, aliasMap]);

  // ── Selection supersedes pending deep-link ────────────────────────────────
  //
  // Once a selection exists — whether placed by `selectByAlias` from a
  // resolved deep link OR by a user click while we were still trying —
  // the original deep-link target stops being load-bearing.  Clearing
  // pending here is the single place we collapse the "we have a deep
  // link to honour" state, and it's idempotent: clearPending() on an
  // already-null target is a no-op.
  //
  // This is what makes "drain never clears on unknown" safe: if the
  // resolver eventually succeeds, this effect clears.  If the user
  // clicks something else first, this effect clears.  If the link is
  // truly unresolvable AND no user interaction occurs, pendingTarget
  // stays set — Task 5's banner will offer a manual escape.
  useEffect(() => {
    if (selected !== null && pendingTarget !== null) clearPending();
  }, [selected, pendingTarget, clearPending]);

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

      // ── Cmd+K / Ctrl+K / `/` opens the command palette ───────────────────
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === '/' && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
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
          handleRef.current?.focusOn([selected.x, selected.y, selected.z], selected.diameterKpc);
        }
        return;
      }

      // ── h: return to the home / Earth view ─────────────────────────────────
      if (e.key === 'h' || e.key === 'H') {
        handleRef.current?.focusOnHome();
        return;
      }

      // ── l: log the live camera state to console (debug aid) ────────────────
      // Prints target / distance / yaw / pitch / fovYRad in copy-paste-friendly
      // form so the developer can tune the initial framing + reset values
      // interactively.  Lower-case only — capital L is reserved for future
      // use; keep the dev hotkey unobtrusive.
      if (e.key === 'l') {
        handleRef.current?.logCameraState();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected, paletteOpen]); // re-bind when pin or palette state changes

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
        onFocus={(info) => handleRef.current?.focusOn([info.x, info.y, info.z], info.diameterKpc)}
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
