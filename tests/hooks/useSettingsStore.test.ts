// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';

import { useSettingsStore } from '../../src/hooks/useSettingsStore';
import { createSettingsStore } from '../../src/services/engine/settingsStore/createSettingsStore';
import { selectBrightness } from '../../src/services/engine/settingsStore/selectors/selectBrightness';
import { setBrightnessAction } from '../../src/services/engine/settingsStore/actions/setBrightnessAction';
import { makeSettingsFixture } from '../services/engine/settingsStore/makeSettingsFixture';
import type { EngineHandle } from '../../src/@types/engine/EngineHandle';

// The hook only ever touches `handle.settingsStore`, so a partial handle
// carrying just that field is a faithful stand-in for the full GPU handle.
function handleWith(store: ReturnType<typeof createSettingsStore>): EngineHandle {
  return { settingsStore: store } as unknown as EngineHandle;
}

describe('useSettingsStore', () => {
  it('returns the fallback while the handle ref is null', () => {
    const ref: RefObject<EngineHandle | null> = { current: null };

    const { result } = renderHook(() => useSettingsStore(ref, selectBrightness, 1.5));

    expect(result.current).toBe(1.5);
  });

  it('returns the live store value once a store is supplied', () => {
    const store = createSettingsStore(
      makeSettingsFixture({ surveys: { ...makeSettingsFixture().surveys, brightness: 2 } }),
    );
    const ref: RefObject<EngineHandle | null> = { current: handleWith(store) };

    const { result } = renderHook(() => useSettingsStore(ref, selectBrightness, 1.5));

    // Reflects the store's seeded value, not the fallback.
    expect(result.current).toBe(2);
  });

  it('re-renders with the new value when the store changes', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const ref: RefObject<EngineHandle | null> = { current: handleWith(store) };

    const { result } = renderHook(() => useSettingsStore(ref, selectBrightness, 1.5));

    act(() => {
      setBrightnessAction(store, 9);
    });

    expect(result.current).toBe(9);
  });
});
