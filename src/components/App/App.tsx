/**
 * App — the root React component for Skymap.
 *
 * Boundary between the imperative WebGPU engine and the React UI.  Its
 * job is wiring: pull state out of focused hooks in `src/hooks/`, hand
 * it to presentational children, and forward user input back into the
 * engine.  Hook order matters: `useEngineSettings` runs first so its
 * `engineCallbacks` exist when `useEngine` constructs the engine.
 *
 * `handleRef` is a ref, not state: many hooks call methods on the
 * engine, and putting the handle in state would re-render every
 * consumer when it starts up.  `useEngine` writes once, everyone reads.
 *
 * No `React.StrictMode`: the engine creates GPU resources, starts a
 * render loop, and attaches listeners — it isn't designed for the
 * synthetic double-mount.  `useEngine`'s cleanup still runs on real
 * unmounts.
 */

import { useCallback, useMemo, useState } from 'react';
import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { useStructureMemberCount } from '../../hooks/useStructureMemberCount';
import { useSplash } from '../../hooks/useSplash';
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
import Splash from '../Splash/Splash';
import AboutPill from '../Splash/AboutPill';
import { MILKY_WAY_ENTRY, MILKY_WAY_ID } from '../../data/milkyWayEntry';
import appStyles from './App.module.css';
import { useUrlSync } from '../../hooks/useUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEngineSettings } from '../../hooks/useEngineSettings';
import { useSpaceMouseDevicePresence } from '../../hooks/useSpaceMouseDevicePresence';
import { buildStaticAnchorStructures } from '../../data/buildStaticAnchorStructures';
import { DebugPanel } from '../DebugPanel/DebugPanel';
import { isWebHIDSupported } from '../../services/input/spaceMouse';

export function App(): React.ReactElement {
  const {
    settings,
    engineCallbacks: settingsCallbacks,
    setFilamentsEnabled,
    setFilamentIntensity,
    setVolumesEnabled,
    setSpaceMouseSensitivity,
    setFlowEnabled,
    setFlowMode,
    setFlowIntensity,
    setFlowCount,
    setFlowTrail,
    setFlowSpeed,
    setFlowDensityBias,
    setFlowWander,
  } = useEngineSettings();

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
    showPickBuffer,
    showDiskRadiusRing,
    visibleSourceMask,
    biasMode,
    absMagLimit,
    toneMapCurve,
    volumesEnabled,
    volumeFields,
    spaceMouseConnected,
    spaceMouseSensitivity,
    flowEnabled,
    flowMode,
    flowIntensity,
    flowCount,
    flowTrail,
    flowSpeed,
    flowDensityBias,
    flowWander,
  } = settings;

  // SettingsPanel's SpaceMouse section appears only when WebHID is
  // available AND a previously-authorised puck is attached.  The other
  // 99 % of users see no clutter; the 1 % who own one find the controls
  // automatically with no reload.
  const spaceMouseDevicePresent = useSpaceMouseDevicePresence();
  const spaceMouseSectionVisible = isWebHIDSupported() && spaceMouseDevicePresent;

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
    structureCounts,
    loadProgress,
    currentTier,
  } = useEngine({ extraCallbacks: settingsCallbacks });

  // Live "N galaxies" figure for a pinned cluster/SC/void card.  Recomputes
  // on selection / tier swap / catalog landing (`sourceCounts`) / survey
  // toggle — null for galaxy selections and famous-galaxy POIs.
  const selectedMemberCount = useStructureMemberCount({
    selected,
    engineHandleRef: handleRef,
    tier: currentTier,
    sourceCounts,
    visibleSourceMask,
  });

  // Mobile gets the left-stack panels collapsed on first paint.  Lazy
  // initializer reads `window.innerWidth` exactly once at mount and the
  // setter is intentionally dropped — re-orienting mid-session shouldn't
  // yank the user's expanded panels back closed under them.  SSR-safe
  // fallback: desktop default when `window` is undefined.
  const [initialMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const initialPanelsOpen = !initialMobile;

  const [paletteOpen, setPaletteOpen] = useState(false);

  // Stable handlers for the `React.memo`'d SearchTrigger — a fresh
  // inline arrow each render would defeat the memo.
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // `Tab` fades the whole HUD via a single CSS opacity transition on
  // the `.uiStack` wrapper — for screenshots, recordings, or unobstructed
  // orbiting.
  const [uiHidden, setUiHidden] = useState(false);

  // `d` toggles the debug panel.
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  const { famousMeta, ready: famousMetaReady } = useFamousMeta();

  // Splash hook owns visibility, readiness gate (engine + famous-meta),
  // localStorage versioning, deep-link bypass, 8 s Continue-anyway timer,
  // and dismiss/reopen.  See `useSplash.ts` for rationale.
  const splash = useSplash({ status, loadProgress, famousMetaReady });

  // Milky Way isn't in any catalog .bin (procedural backdrop), but users
  // expect to find it in the palette.  Sentinel-id entry prepended so the
  // palette searches it like any other galaxy; `onSelect` intercepts the
  // id and routes to `focusOnMilkyWay`.  `useMemo` because CommandPalette's
  // scoring depends on `entries` reference identity.
  const paletteEntries = useMemo(() => [MILKY_WAY_ENTRY, ...famousMeta], [famousMeta]);

  const { aliasIndex, aliasMap } = useAliasIndex({
    paletteOpen,
    sourceCounts,
    engineHandleRef: handleRef,
  });

  // Static structure table for the URL drain.  The engine owns the merged
  // list (static anchors + the async bulk cluster catalog), but threading
  // that as a reactive React slice would re-render App on every catalog load.
  // Deep-link arrivals only need the static subset (`#poi=cluster-…` /
  // `supercluster-…` / `void-…`).  `useMemo([])` so the drain effect
  // doesn't re-fire on every render.
  const staticStructures = useMemo(() => buildStaticAnchorStructures(), []);
  useUrlSync({
    focused,
    status,
    sourceCounts,
    famousMeta,
    aliasMap,
    ready: status.kind === 'ready',
    pois: staticStructures,
    engineHandleRef: handleRef,
  });

  useKeyboardShortcuts({
    selected,
    paletteOpen,
    engineHandleRef: handleRef,
    setPaletteOpen,
    setUiHidden,
    setDebugPanelOpen,
  });

  return (
    <>
      {/* The engine takes over this canvas's GPU context; React never
          writes to it after the initial render.  `id="c"` matches the
          fullscreen CSS rule in index.html. */}
      <canvas ref={canvasRef} id="c" aria-hidden={splash.splashVisible || undefined} />

      {/* HUD wrapper.  All overlay chrome lives inside this single
          `<div>` so `Tab` can fade the whole stack via one CSS
          opacity transition.  Splash also forces the HUD hidden. */}
      <div
        className={cx(
          appStyles.uiStack,
          (uiHidden || splash.splashVisible) && appStyles.uiStackHidden,
        )}
      >
        {/* Mounted unconditionally; fades itself out when `loadProgress`
            goes null.  Keeps tier-swap first paints from flashing a
            visible mount frame. */}
        <LoadingBar progress={loadProgress} />

        <StatusBar status={status} />
        <InfoCard
          hovered={hovered}
          selected={selected}
          selectedMemberCount={selectedMemberCount}
          onFocus={(target) => handleRef.current?.camera.focusOn(target)}
          onClose={() => handleRef.current?.selection.clear()}
        />
        <ScaleBar scale={scale} />
        {/* Flex column anchored bottom-left.  Children stack upward as
            they're added, so we don't need per-panel `bottom:` math. */}
        <div className={appStyles.leftStack}>
          <NavigationPanel defaultOpen={initialPanelsOpen} isMobile={initialMobile} />
          <SettingsPanel
            defaultOpen={initialPanelsOpen}
            pointSize={pointSize}
            onPointSizeChange={(size) => handleRef.current?.points.setSize(size)}
            labelCategoryVisibility={labelCategoryVisibility}
            markerCategoryVisibility={markerCategoryVisibility}
            onSetMarkerCategoryVisibility={(category, visible) => {
              handleRef.current?.labels.setCategoryMarkerVisible(category, visible);
            }}
            onSetLabelCategoryVisibility={(category, visible) => {
              handleRef.current?.labels.setCategoryLabelVisible(category, visible);
            }}
            // Filaments has no engine echo — React owns the state, so
            // the handler updates locally AND forwards to the engine.
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
            depthFadeEnabled={depthFadeEnabled}
            onDepthFadeEnabledChange={(enabled) => {
              handleRef.current?.points.setDepthFade(enabled);
            }}
            onResetCamera={() => handleRef.current?.camera.focusOnHome()}
            // Tier swap is owned end-to-end by the engine: it cancels
            // in-flight loads, re-fetches tier-suffixed bins, re-uploads,
            // then echoes the new tier back through `onTierChange`.
            tier={currentTier}
            onTierChange={(tier) => handleRef.current?.sources.setTier(tier)}
            // `setSourceVisible` fires `onMaskChange` synchronously so
            // React state lands before this handler returns; no
            // optimistic update needed.  `setVisible` is async (drawMask
            // flips after the fade), hence fire-and-forget.
            visibleSourceMask={visibleSourceMask}
            sourceCounts={sourceCounts}
            structureCounts={structureCounts}
            onToggleSource={(source, visible) => {
              void handleRef.current?.sources.setVisible(source, visible);
            }}
            spaceMouseSupported={spaceMouseSectionVisible}
            spaceMouseConnected={spaceMouseConnected}
            onConnectSpaceMouse={() => {
              // `connect()` returns a promise; fire-and-forget.  The
              // subsystem's `onConnectedChange` echo drives the
              // "connected" indicator on success.
              void handleRef.current?.input.spaceMouse.connect();
            }}
            spaceMouseSensitivity={spaceMouseSensitivity}
            onSpaceMouseSensitivityChange={(value) => {
              // No engine echo — React owns the truth, same as the
              // filament / volume master toggles.
              setSpaceMouseSensitivity(value);
              handleRef.current?.input.spaceMouse.setSensitivity(value);
            }}
            // Bias and tone-map setters echo synchronously — `setBiasMode`
            // / `setAbsMagLimit` / `setToneMapCurve` all fire their echo
            // callback inside the call, so no optimistic update needed.
            biasMode={biasMode}
            onBiasModeChange={(mode) => handleRef.current?.bias.setMode(mode)}
            absMagLimit={absMagLimit}
            // `M` is the conventional astronomy symbol for absolute magnitude.
            onAbsMagLimitChange={(M) => handleRef.current?.bias.setAbsMagLimit(M)}
            toneMapCurve={toneMapCurve}
            onToneMapCurveChange={(curve) => handleRef.current?.tonemap.setCurve(curve)}
            // `volumesEnabled` is the master toggle — no engine echo,
            // owned in React state (same pattern as filamentsEnabled).
            // The per-field setters forward straight to the engine; the
            // engine fires `volumes.onFieldsChanged(snapshot)` after
            // every mutation, and `useEngineSettings` mirrors the
            // snapshot back into React.
            volumesEnabled={volumesEnabled}
            onVolumesEnabledChange={(enabled) => {
              setVolumesEnabled(enabled);
              handleRef.current?.volumes.setMasterEnabled(enabled);
            }}
            volumeFields={volumeFields}
            onVolumeFieldEnabledChange={(fieldId, enabled) =>
              handleRef.current?.volumes.setEnabled(fieldId, enabled)
            }
            onVolumeFieldIntensityChange={(fieldId, intensity) =>
              handleRef.current?.volumes.setIntensity(fieldId, intensity)
            }
            onVolumeFieldContrastChange={(fieldId, contrast) =>
              handleRef.current?.volumes.setContrast(fieldId, contrast)
            }
            onVolumeFieldDensityScaleChange={(fieldId, densityScale) =>
              handleRef.current?.volumes.setDensityScale(fieldId, densityScale)
            }
            onVolumeFieldTrimChange={(fieldId, trim) =>
              handleRef.current?.volumes.setTrim(fieldId, trim)
            }
            onVolumeFieldExposureChange={(fieldId, exposure) =>
              handleRef.current?.volumes.setExposure(fieldId, exposure)
            }
            onVolumeFieldPaletteChange={(fieldId, paletteId) =>
              handleRef.current?.volumes.setPalette(fieldId, paletteId)
            }
            // Flow has no engine echo — React owns the state, so each
            // handler updates the optimistic mirror AND forwards to the
            // engine handle (same pattern as filaments).
            flowEnabled={flowEnabled}
            flowMode={flowMode}
            flowIntensity={flowIntensity}
            onFlowEnabledChange={(enabled) => {
              setFlowEnabled(enabled);
              handleRef.current?.flow.setEnabled(enabled);
            }}
            onFlowModeChange={(mode) => {
              setFlowMode(mode);
              handleRef.current?.flow.setMode(mode);
            }}
            onFlowIntensityChange={(value) => {
              setFlowIntensity(value);
              handleRef.current?.flow.setIntensity(value);
            }}
          />
          <StatsPanel
            defaultOpen={false}
            fps={fps}
            sourceCounts={sourceCounts}
            visibleSourceMask={visibleSourceMask}
            filamentsEnabled={filamentsEnabled}
            filamentCounts={filamentCounts}
          />
        </div>
        {/* Top-center pill row.  SearchTrigger + AutoRotateToggle share
            a flex wrapper so they fade together when the palette opens. */}
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen || splash.splashVisible} />
          <AutoRotateToggle
            playing={autoRotate}
            onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
            hidden={paletteOpen || splash.splashVisible}
          />
          <AboutPill onClick={splash.reopen} hidden={paletteOpen || splash.splashVisible} />
        </div>
        <CommandPalette
          entries={paletteEntries}
          aliasIndex={aliasIndex ?? undefined}
          open={paletteOpen}
          onClose={closePalette}
          onSelect={(id) => {
            // Milky Way is a procedural backdrop, not a catalog object —
            // route the sentinel id to the dedicated focus method.  See
            // `data/milkyWayEntry.ts` for the impostor visibility band
            // (`focusOnHome` sits past the fade-out).
            if (id === MILKY_WAY_ID) {
              handleRef.current?.camera.focusOnMilkyWay();
              return;
            }
            handleRef.current?.selection.selectFamous(id);
          }}
          onSelectAlias={(target) => handleRef.current?.selection.selectByAlias(target)}
        />
        {/* `handleRef.current` set means the engine finished constructing,
            so the panel can subscribe to slots without racing. */}
        {debugPanelOpen && handleRef.current && (
          <DebugPanel
            slots={handleRef.current.assetSlots}
            timingService={handleRef.current.debug.timingService}
            passOverrides={handleRef.current.debug.passOverrides}
            // Orientation-fallback diagnostic toggles — `points`
            // setters echo synchronously, so React mirrors engine
            // truth without an optimistic update.
            highlightFallback={highlightFallback}
            realOnlyMode={realOnlyMode}
            onHighlightFallbackChange={(enabled) => {
              handleRef.current?.points.setHighlightFallback(enabled);
            }}
            onRealOnlyModeChange={(enabled) => {
              handleRef.current?.points.setRealOnly(enabled);
            }}
            showPickBuffer={showPickBuffer}
            onShowPickBufferChange={(enabled) => {
              handleRef.current?.debug.setShowPickBuffer(enabled);
            }}
            showDiskRadiusRing={showDiskRadiusRing}
            onShowDiskRadiusRingChange={(enabled) => {
              handleRef.current?.debug.setShowDiskRadiusRing(enabled);
            }}
            // Flow motion tunables — no engine echo, so each handler
            // updates the optimistic mirror AND forwards to the handle
            // (same pattern as the SettingsPanel flow look controls).
            flowCount={flowCount}
            flowTrail={flowTrail}
            flowSpeed={flowSpeed}
            flowDensityBias={flowDensityBias}
            flowWander={flowWander}
            onFlowCountChange={(v) => {
              setFlowCount(v);
              handleRef.current?.flow.setCount(v);
            }}
            onFlowTrailChange={(v) => {
              setFlowTrail(v);
              handleRef.current?.flow.setTrail(v);
            }}
            onFlowSpeedChange={(v) => {
              setFlowSpeed(v);
              handleRef.current?.flow.setFlowSpeed(v);
            }}
            onFlowDensityBiasChange={(v) => {
              setFlowDensityBias(v);
              handleRef.current?.flow.setDensityBias(v);
            }}
            onFlowWanderChange={(v) => {
              setFlowWander(v);
              handleRef.current?.flow.setWander(v);
            }}
          />
        )}
      </div>
      {splash.splashVisible && (
        <Splash
          blocked={splash.blocked}
          canContinueAnyway={splash.canContinueAnyway}
          loadProgress={loadProgress}
          error={splash.error}
          onExplore={splash.dismissExplore}
          // Plan 2 (stub tour) replaces this with the real tour wiring.
          // For now Tour just dismisses like Explore — the splash work
          // ships independently of the tour itinerary.
          onTour={splash.dismissTour}
          onContinueAnyway={splash.dismissExplore}
          onReload={() => window.location.reload()}
        />
      )}
    </>
  );
}
