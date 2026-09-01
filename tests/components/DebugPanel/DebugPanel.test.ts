// @vitest-environment jsdom

/**
 * DebugPanel — store-backed integration test.
 *
 * Verifies that the sections DebugPanel mounts (each via its own container)
 * round-trip through the store:
 *   - reads the `pick-buffer` overlay out of the store and reflects it on the matching checkbox;
 *   - dispatches `setDebugOverlay({ key: 'pick-buffer', enabled })` when the checkbox is toggled;
 *   - routes a RenderTogglesSection checkbox click through `onTogglePass` → `setPassDisabled`;
 *   - routes the galaxy-provenance table's highlight checkbox and cull `<select>`
 *     through `setProvenanceHighlight` / `setProvenanceFilter`.
 *
 * Stub engine props — a `new Map()` for `slots`, a minimal `timingService` stub
 * (enabled=false, all methods are no-ops), and a `passNames` array — satisfy the
 * engine-prop types without needing a live GPU context.
 *
 * Pattern mirrors `AutoRotateToggleContainer.test.ts`: `createAppStore()` +
 * `<Provider>` wrapper + `createElement` (no JSX).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode, createRef } from 'react';
import { Provider } from 'react-redux';
import DebugPanel from '../../../src/components/DebugPanel/DebugPanel';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import {
  selectDebugOverlays,
  selectDisabledPasses,
  selectGalaxyProvenance,
} from '../../../src/state/settings/selectors';
import { setDebugOverlay } from '../../../src/state/settings/settingsSlice';
import { startClip } from '../../../src/state/camera/clipActions';
import { startTour } from '../../../src/state/tour/tourActions';
import type { GpuTimingService } from '../../../src/@types/gpu/timing/GpuTimingService';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';
import type { CameraDebugSnapshot } from '../../../src/@types/camera/CameraDebugSnapshot';
import { EMPTY_EARTH_TILE_DEBUG_SNAPSHOT } from '../../../src/services/engine/subsystems/earthTileSubsystem';

// ---------------------------------------------------------------------------
// Stub engine props
// ---------------------------------------------------------------------------

const PASS_NAMES = ['point-sprites', 'textured-quads'];

/** No-op timing service that satisfies the GpuTimingService type. */
const stubTimingService: GpuTimingService = {
  enabled: false,
  beginFrame: () => ({ frameIndex: 0, stagingSlot: 0 }),
  descriptorFor: () => undefined,
  endFrame: () => undefined,
  subscribe: () => () => undefined,
  destroy: () => undefined,
};

const stubSlots = new Map();

/** A quiet, self-consistent stub — armMismatch/epochMismatch both false. */
const EMPTY_CAMERA_DEBUG_SNAPSHOT: CameraDebugSnapshot = {
  storedFrame: 'absolute',
  renderedFrame: 'absolute',
  armMismatch: false,
  engagedBodyId: null,
  hOverR: null,
  altitudeKm: null,
  lastRenderedSimDays: 0,
  liveSimDays: 0,
  epochDeltaDays: 0,
  epochMismatch: false,
  anchorLocalKm: null,
  eyeRelAnchorMagM: null,
  activeDriverId: 'resting',
};

// `debug.earthTiles` (via EarthTileAtlasSectionContainer) and
// `debug.cameraDebug` (via CameraStateSectionContainer) are the only fields
// reached — `flyToLonLat` now dispatches a store action rather than reading
// the handle — the rest of EngineHandle is unused by DebugPanel's tree, so
// it's cast rather than fully stubbed.
const stubEngineHandleRef = createRef<EngineHandle | null>();
stubEngineHandleRef.current = {
  debug: {
    earthTiles: () => EMPTY_EARTH_TILE_DEBUG_SNAPSHOT,
    cameraDebug: () => EMPTY_CAMERA_DEBUG_SNAPSHOT,
  },
} as unknown as EngineHandle;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function renderContainer(store: ReturnType<typeof createAppStore>['store']) {
  return render(
    createElement(DebugPanel, {
      slots: stubSlots,
      timingService: stubTimingService,
      frameStats: () => ({ fps: 0, cpuMs: 0, idle: true }),
      passNames: PASS_NAMES,
      assetPriorities: () => new Map<string, number>(),
      engineHandleRef: stubEngineHandleRef,
    }),
    { wrapper: makeWrapper(store) },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DebugPanel', () => {
  it('reflects the pick-buffer overlay from the store', () => {
    const { store } = createAppStore();
    // Seed pick-buffer=true by dispatching before render.
    store.dispatch(setDebugOverlay({ key: 'pick-buffer', enabled: true }));
    const { container } = renderContainer(store);
    // The "Show pick buffer" label contains a checkbox.
    const labels = Array.from(container.querySelectorAll('label'));
    const pickLabel = labels.find((l) => l.textContent?.includes('Show pick buffer'));
    expect(pickLabel).not.toBeUndefined();
    const box = pickLabel!.querySelector<HTMLInputElement>('input[type=checkbox]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(true);
  });

  it('dispatches setDebugOverlay on checkbox toggle', () => {
    const { store } = createAppStore();
    // Default store has pick-buffer=false.
    expect(selectDebugOverlays(store.getState())['pick-buffer']).toBe(false);
    const { container } = renderContainer(store);
    const labels = Array.from(container.querySelectorAll('label'));
    const pickLabel = labels.find((l) => l.textContent?.includes('Show pick buffer'));
    const box = pickLabel!.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    fireEvent.click(box);
    expect(selectDebugOverlays(store.getState())['pick-buffer']).toBe(true);
  });

  it('dispatches setPassDisabled(true) when a renderer-toggle box is unchecked', () => {
    const { store } = createAppStore();
    const { container } = renderContainer(store);
    // Locate the RenderTogglesSection's <details> by its summary text — there are
    // multiple <details> elements in the panel (AssetLoading, GpuTimings, etc.).
    const summaries = Array.from(container.querySelectorAll('details summary'));
    const togglesSummary = summaries.find((s) => s.textContent?.includes('Renderer Toggles'));
    expect(togglesSummary).not.toBeUndefined();
    const details = togglesSummary!.closest('details')!;
    // All passes start enabled (no disabledPasses entries).
    const boxes = details.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes.length).toBeGreaterThan(0);
    // Click the first box ('point-sprites') to disable it.
    fireEvent.click(boxes[0]!);
    expect(selectDisabledPasses(store.getState())['point-sprites']).toBe(true);
  });

  it('dispatches setProvenanceFilter and setProvenanceHighlight from the provenance table', () => {
    const { store } = createAppStore();
    expect(selectGalaxyProvenance(store.getState()).orientation.filter).toBe('all');
    expect(selectGalaxyProvenance(store.getState()).orientation.highlight).toBe(false);
    const { container } = renderContainer(store);

    // GalaxyProvenanceSection renders the tri-state cull as a <select>, named by
    // its aria-label rather than the row's index — the table is built by
    // iterating PROVENANCE_AXES, so index is an accident of registry order.
    const cullSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Show by orientation provenance"]',
    );
    expect(cullSelect).not.toBeNull();
    fireEvent.change(cullSelect!, { target: { value: 'measured' } });
    expect(selectGalaxyProvenance(store.getState()).orientation.filter).toBe('measured');

    const highlightBox = container.querySelector<HTMLInputElement>(
      '#provenance-highlight-orientation',
    );
    expect(highlightBox).not.toBeNull();
    fireEvent.click(highlightBox!);
    expect(selectGalaxyProvenance(store.getState()).orientation.highlight).toBe(true);
  });

  it('dispatches startClip with the clip id on a clip-play button click', () => {
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    const buttons = Array.from(container.querySelectorAll('button'));
    const playButton = buttons.find((b) => b.textContent?.includes('Cosmic Flows'));
    expect(playButton).not.toBeUndefined();
    fireEvent.click(playButton!);
    const playAction = dispatchSpy.mock.calls.map((c) => c[0]).find(startClip.match);
    expect(playAction).not.toBeUndefined();
    // The button names the registered clip; the action carries its id.
    expect(playAction!.payload).toBe('cosmicFlows');
  });

  it('dispatches startTour with the tour id on a tour button click', () => {
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    const buttons = Array.from(container.querySelectorAll('button'));
    const tourButton = buttons.find((b) => b.textContent?.includes('Demo Tour'));
    expect(tourButton).not.toBeUndefined();
    fireEvent.click(tourButton!);
    const tourAction = dispatchSpy.mock.calls.map((c) => c[0]).find(startTour.match);
    expect(tourAction).not.toBeUndefined();
    // The button names the registered tour; the action carries its id.
    expect(tourAction!.payload.id).toBe('demo');
  });
});
