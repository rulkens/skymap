// @vitest-environment jsdom

/**
 * DebugPanel — store-backed integration test. Stub engine props (a `new Map()`
 * for `slots`, a no-op `timingService`) satisfy EngineHandle's prop types
 * without a live GPU context.
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
import { EMPTY_EARTH_TILE_DEBUG_SNAPSHOT } from '../../../src/services/engine/subsystems/earthTileSubsystem';
import { QUIET_CAMERA_DEBUG_SNAPSHOT } from '../../fixtures/camera/quietCameraDebugSnapshot';

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

// Only `debug.earthTiles` and `debug.cameraDebug` are reached — `flyToLonLat`
// dispatches a store action rather than reading the handle — so the rest of
// EngineHandle is unused here and it's cast rather than fully stubbed.
const stubEngineHandleRef = createRef<EngineHandle | null>();
stubEngineHandleRef.current = {
  debug: {
    earthTiles: () => EMPTY_EARTH_TILE_DEBUG_SNAPSHOT,
    cameraDebug: () => QUIET_CAMERA_DEBUG_SNAPSHOT,
  },
} as unknown as EngineHandle;

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

describe('DebugPanel', () => {
  it('reflects the pick-buffer overlay from the store', () => {
    const { store } = createAppStore();
    store.dispatch(setDebugOverlay({ key: 'pick-buffer', enabled: true }));
    const { container } = renderContainer(store);
    const labels = Array.from(container.querySelectorAll('label'));
    const pickLabel = labels.find((l) => l.textContent?.includes('Show pick buffer'));
    expect(pickLabel).not.toBeUndefined();
    const box = pickLabel!.querySelector<HTMLInputElement>('input[type=checkbox]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(true);
  });

  it('dispatches setDebugOverlay on checkbox toggle', () => {
    const { store } = createAppStore();
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
