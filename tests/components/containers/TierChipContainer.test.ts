// @vitest-environment jsdom

/**
 * TierChipContainer — verify the container reads `tier` from the store and
 * dispatches `requestTier` when the user picks a new tier.
 *
 * Pattern: store-backed via `createAppStore(preloadedState)` + `<Provider>`,
 * `createElement` (no JSX — matches `vitest.config.ts` `include` glob
 * `tests/**\/*.test.ts`), and a `makeWrapper(store)` helper mirroring the
 * AutoRotateToggleContainer test.
 *
 * ### Why the dispatch-spy approach for the second test
 *
 * `requestTier` is a COMMAND action with no reducer: dispatching it changes
 * nothing in the store immediately. The tier saga (which runs after the bins
 * land) is what eventually writes `setTier`. Asserting on `selectTier` after
 * firing the `<select>` change would always see the seeded value (the saga is
 * async and needs the engine runner registered via `setSagaContext`), so a
 * plain `selectTier` assertion cannot distinguish "dispatched and saga is
 * pending" from "did not dispatch". Instead, we use `vi.spyOn(store, 'dispatch')`
 * before rendering — this wraps the real method in-place, preserving its type,
 * and records calls — fire the change, then assert the spy was called with
 * `requestTier('small')`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import TierChipContainer from '../../../src/components/containers/TierChipContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { requestTier } from '../../../src/state/tier/requestTier';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('TierChipContainer', () => {
  it('reflects the seeded tier in the select value', () => {
    // Seed with `large` — the chip's <select> should reflect committed truth
    // from the store, not its own local state.
    const { store } = createAppStore({ tier: 'large' });
    const { container } = render(createElement(TierChipContainer, null), {
      wrapper: makeWrapper(store),
    });
    const select = container.querySelector('select');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('large');
  });

  it('dispatches requestTier when a new tier is picked', () => {
    // Default store: tier='medium'. We spy on dispatch to observe the command
    // action without needing the tier saga or engine runner to be wired up.
    const { store } = createAppStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const { container } = render(createElement(TierChipContainer, null), {
      wrapper: makeWrapper(store),
    });
    const select = container.querySelector('select')!;
    fireEvent.change(select, { target: { value: 'small' } });

    expect(dispatchSpy).toHaveBeenCalledWith(requestTier('small'));
  });
});
