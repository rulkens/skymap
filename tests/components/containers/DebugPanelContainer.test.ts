// @vitest-environment jsdom

/**
 * DebugPanelContainer — store-backed integration test.
 *
 * Verifies that the container:
 *   - reads `showPickBuffer` out of the store and reflects it on the matching checkbox;
 *   - dispatches `setShowPickBuffer` when the checkbox is toggled;
 *   - routes a RenderTogglesSection checkbox click through `onTogglePass` → `setPassDisabled`;
 *   - dispatches `setRealOnly` when the data-quality toggle fires.
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
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import DebugPanelContainer from '../../../src/components/containers/DebugPanelContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectShowPickBuffer,
  selectDisabledPasses,
  selectRealOnly,
} from '../../../src/state/settings/selectors';
import { setShowPickBuffer } from '../../../src/state/settings/settingsSlice';
import { startClip } from '../../../src/state/camera/clipActions';
import { startTour } from '../../../src/state/tour/tourActions';
import type { GpuTimingService } from '../../../src/@types/gpu/timing/GpuTimingService';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function renderContainer(store: ReturnType<typeof createAppStore>['store']) {
  return render(
    createElement(DebugPanelContainer, {
      slots: stubSlots,
      timingService: stubTimingService,
      passNames: PASS_NAMES,
    }),
    { wrapper: makeWrapper(store) },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DebugPanelContainer', () => {
  it('reflects showPickBuffer from the store', () => {
    const { store } = createAppStore();
    // Seed showPickBuffer=true by dispatching before render.
    store.dispatch(setShowPickBuffer(true));
    const { container } = renderContainer(store);
    // The "Show pick buffer" label contains a checkbox.
    const labels = Array.from(container.querySelectorAll('label'));
    const pickLabel = labels.find((l) => l.textContent?.includes('Show pick buffer'));
    expect(pickLabel).not.toBeUndefined();
    const box = pickLabel!.querySelector<HTMLInputElement>('input[type=checkbox]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(true);
  });

  it('dispatches setShowPickBuffer on checkbox toggle', () => {
    const { store } = createAppStore();
    // Default store has showPickBuffer=false.
    expect(selectShowPickBuffer(store.getState())).toBe(false);
    const { container } = renderContainer(store);
    const labels = Array.from(container.querySelectorAll('label'));
    const pickLabel = labels.find((l) => l.textContent?.includes('Show pick buffer'));
    const box = pickLabel!.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    fireEvent.click(box);
    expect(selectShowPickBuffer(store.getState())).toBe(true);
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

  it('dispatches setRealOnly on the data-quality toggle', () => {
    const { store } = createAppStore();
    expect(selectRealOnly(store.getState())).toBe(false);
    const { container } = renderContainer(store);
    // DataQualitySection renders a "Show only real" checkbox label.
    const labels = Array.from(container.querySelectorAll('label'));
    const realLabel = labels.find((l) => l.textContent?.includes('Show only real'));
    expect(realLabel).not.toBeUndefined();
    const box = realLabel!.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    fireEvent.click(box);
    expect(selectRealOnly(store.getState())).toBe(true);
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
