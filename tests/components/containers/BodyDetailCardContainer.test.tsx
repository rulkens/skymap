// @vitest-environment jsdom
//
// BodyDetailCardContainer — store-boundary coverage for the focused-body card's
// live distance row.
//
// The container's whole job is to read the throttled `engineBodyDistanceReported`
// pub and hand it to the pure card as the `distanceMpc` prop. These tests drive a
// real store (createAppStore + <Provider>), dispatch `engineBodyDistanceReported`,
// and assert the rendered distance row tracks the pub while the identity rows
// (Radius, label) stay put. Asserting on rendered text keeps the contract stable
// against CSS-modules class mangling.
//
// No sidecar stubbing is needed: the container selects `famousStarsMeta` off the
// engine slice, which a fresh store initialises empty, and Jupiter's id misses
// FAMOUS_STAR_IDS anyway. The card takes the planet branch either way.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import BodyDetailCardContainer from '../../../src/components/containers/BodyDetailCardContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { engineBodyDistanceReported } from '../../../src/state/engine/engineSlice';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { formatDistance } from '../../../src/utils/format/formatDistance';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';

// Render probe: wrap the real BodyDetailCard so we can count how many times the
// container actually renders it. The wrapper renders the genuine component (so the
// text assertions below still see real output); it just increments a counter each
// time the container hands it fresh props. A same-distance pub tick must leave the
// counter untouched — that's the memo/selector suppression, proven by mechanism
// rather than by output stability alone. The `mock` prefix lets vitest's hoisted
// factory reference the counter.
const mockCardRenderProbe = { count: 0 };
vi.mock('../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard')
  >('../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard');
  return {
    ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => {
      mockCardRenderProbe.count += 1;
      return createElement(actual.default, props);
    },
  };
});

const jupiter: BodyInfo = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [0, 0, 0],
  radiusKm: 69911,
};

const NEAR_DISTANCE_MPC = 3 * SCALE_UNITS.AU_TO_MPC;
const FAR_DISTANCE_MPC = 7 * SCALE_UNITS.AU_TO_MPC;

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('BodyDetailCardContainer', () => {
  it('distance row updates from the body-distance pub', () => {
    const { store } = createAppStore();
    store.dispatch(engineBodyDistanceReported(NEAR_DISTANCE_MPC));

    render(createElement(BodyDetailCardContainer, { target: jupiter, pinned: true }), {
      wrapper: makeWrapper(store),
    });

    expect(screen.getByText(formatDistance(NEAR_DISTANCE_MPC))).toBeInTheDocument();

    // A fresh pub with the body now farther away: the distance row tracks it, the
    // old value is gone, and the identity rows are untouched. `act` flushes the
    // react-redux useSyncExternalStore subscription the post-mount dispatch fires.
    act(() => {
      store.dispatch(engineBodyDistanceReported(FAR_DISTANCE_MPC));
    });

    expect(screen.getByText(formatDistance(FAR_DISTANCE_MPC))).toBeInTheDocument();
    expect(screen.queryByText(formatDistance(NEAR_DISTANCE_MPC))).not.toBeInTheDocument();
    expect(screen.getByText('Jupiter')).toBeInTheDocument();
    expect(screen.getByText('69,911 km')).toBeInTheDocument();
  });

  it('identity rows do not change when the pub ticks without moving the body', () => {
    const { store } = createAppStore();
    store.dispatch(engineBodyDistanceReported(NEAR_DISTANCE_MPC));

    render(createElement(BodyDetailCardContainer, { target: jupiter, pinned: true }), {
      wrapper: makeWrapper(store),
    });

    const rendersBeforeTick = mockCardRenderProbe.count;

    // A republished pub with the same distance. The selector reads a primitive, so
    // react-redux bails the container out — the card is never re-rendered and the
    // identity rows stay exactly as they were.
    act(() => {
      store.dispatch(engineBodyDistanceReported(NEAR_DISTANCE_MPC));
    });

    expect(mockCardRenderProbe.count).toBe(rendersBeforeTick);
    expect(screen.getByText('Jupiter')).toBeInTheDocument();
    expect(screen.getByText('69,911 km')).toBeInTheDocument();
    expect(screen.getByText(formatDistance(NEAR_DISTANCE_MPC))).toBeInTheDocument();
  });

  it('drops the distance row when no body distance is published', () => {
    const { store } = createAppStore();
    // Initial store report has focusedBodyDistanceMpc = null (no focus yet).
    render(createElement(BodyDetailCardContainer, { target: jupiter, pinned: true }), {
      wrapper: makeWrapper(store),
    });

    expect(screen.getByText('69,911 km')).toBeInTheDocument();
    // The live camera-distance row is labelled exactly 'Distance' (the facts card's
    // 'Distance from Sun' is a different row and must NOT satisfy this guard). With a
    // null pub the live row is dropped, so an exact-match query finds nothing.
    expect(screen.queryByText('Distance')).toBeNull();
  });
});
