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
import { isWebHIDSupported } from '../../services/input/spaceMouse';

export function App(): React.ReactElement {
  const {
    settings,
    engineCallbacks: settingsCallbacks,
    setFilamentsEnabled,
    setFilamentIntensity,
    setVolumesEnabled,
    setSpaceMouseSensitivity,
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
    visibleSourceMask,
    biasMode,
    absMagLimit,
    toneMapCurve,
    volumesEnabled,
    volumeFields,
    spaceMouseConnected,
    spaceMouseSensitivity,
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
    loadProgress,
    currentTier,
  } = useEngine({ extraCallbacks: settingsCallbacks });

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
  const [loadingDevPanelOpen, setLoadingDevPanelOpen] = useState(false);

  const { famousMeta, famousXrefs } = useFamousMeta();

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

  // Static POI table for the URL drain.  The engine owns the merged list
  // (static anchors + async famous-galaxy POIs), but threading that as a
  // reactive React slice would re-render App on every famous-meta load.
  // Deep-link arrivals only need the static subset (`#poi=cluster-…` /
  // `supercluster-…` / `void-…`).  `useMemo([])` so the drain effect
  // doesn't re-fire on every render.
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

  useKeyboardShortcuts({
    selected,
    paletteOpen,
    engineHandleRef: handleRef,
    setPaletteOpen,
    setUiHidden,
    setLoadingDevPanelOpen,
  });

  return (
    <>
      {/* The engine takes over this canvas's GPU context; React never
          writes to it after the initial render.  `id="c"` matches the
          fullscreen CSS rule in index.html. */}
      <canvas ref={canvasRef} id="c" />

      {/* HUD wrapper.  All overlay chrome lives inside this single
          `<div>` so `Tab` can fade the whole stack via one CSS
          opacity transition (see `.uiStack` / `.uiStackHidden`). */}
      <div className={cx(appStyles.uiStack, uiHidden && appStyles.uiStackHidden)}>
        {/* Mounted unconditionally; fades itself out when `loadProgress`
            goes null.  Keeps tier-swap first paints from flashing a
            visible mount frame. */}
        <LoadingBar progress={loadProgress} />

        <StatusBar status={status} />
        <InfoCard
          hovered={hovered}
          selected={selected}
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
            onPointSizeChange={(v) => handleRef.current?.points.setSize(v)}
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
            onTierChange={(t) => handleRef.current?.sources.setTier(t)}
            // `setSourceVisible` fires `onMaskChange` synchronously so
            // React state lands before this handler returns; no
            // optimistic update needed.  `setVisible` is async (drawMask
            // flips after the fade), hence fire-and-forget.
            visibleSourceMask={visibleSourceMask}
            sourceCounts={sourceCounts}
            onToggleSource={(s, visible) => {
              void handleRef.current?.sources.setVisible(s, visible);
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
            onBiasModeChange={(m) => handleRef.current?.bias.setMode(m)}
            absMagLimit={absMagLimit}
            onAbsMagLimitChange={(M) => handleRef.current?.bias.setAbsMagLimit(M)}
            toneMapCurve={toneMapCurve}
            onToneMapCurveChange={(c) => handleRef.current?.tonemap.setCurve(c)}
            // `volumesEnabled` is the master toggle — no engine echo,
            // owned in React state (same pattern as filamentsEnabled).
            // The per-field setters forward straight to the engine; the
            // engine fires `volumes.onFieldsChanged(snapshot)` after
            // every mutation, and `useEngineSettings` mirrors the
            // snapshot back into React.
            volumesEnabled={volumesEnabled}
            onVolumesEnabledChange={(v: boolean) => {
              setVolumesEnabled(v);
              handleRef.current?.volumes.setMasterEnabled(v);
            }}
            volumeFields={volumeFields}
            onVolumeFieldEnabledChange={(handle, enabled) =>
              handleRef.current?.volumes.setEnabled(handle, enabled)
            }
            onVolumeFieldIntensityChange={(handle, intensity) =>
              handleRef.current?.volumes.setIntensity(handle, intensity)
            }
            onVolumeFieldContrastChange={(handle, contrast) =>
              handleRef.current?.volumes.setContrast(handle, contrast)
            }
            onVolumeFieldDensityScaleChange={(handle, densityScale) =>
              handleRef.current?.volumes.setDensityScale(handle, densityScale)
            }
            onVolumeFieldTrimChange={(handle, trim) =>
              handleRef.current?.volumes.setTrim(handle, trim)
            }
            onVolumeFieldExposureChange={(handle, exposure) =>
              handleRef.current?.volumes.setExposure(handle, exposure)
            }
            onVolumeFieldPaletteChange={(handle, paletteId) =>
              handleRef.current?.volumes.setPalette(handle, paletteId)
            }
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
        {/* `assetSlots` is populated once `status.kind !== 'initializing'`;
            gating here keeps the panel's slot subscriptions from racing
            engine construction.  `timingService` is read through the
            `debug` sub-handle so the live value lands when `?gpuTimings`
            + adapter feature line up. */}
        {loadingDevPanelOpen &&
          status.kind !== 'initializing' &&
          handleRef.current?.assetSlots && (
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
            />
          )}
      </div>
    </>
  );
}
