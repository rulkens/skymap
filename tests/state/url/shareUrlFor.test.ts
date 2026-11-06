/**
 * shareUrlFor — the composer both the `l`-key log and the DebugPanel's
 * copy-URL button call. Covers: `t` comes from the rendered simDays (not the
 * clock anchor), `pose` is appended, an existing hash row (`orientation`)
 * survives the override, and `layers` carries the switches set since boot.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { shareUrlFor } from '../../../src/state/url/shareUrlFor';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { enterManualPausedAt } from '../../../src/state/time/enterManualPausedAt';
import { absoluteArm } from '../../../src/utils/camera/arms/absoluteArm';
import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';

const FRAMED = absoluteArm({ target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5 });
const SIM_DAYS = 2461304.571778822;
const BASE = { origin: 'https://skymap.test', pathname: '/', search: '' };

describe('shareUrlFor', () => {
  it('overrides `t` from simDays rather than the clock anchor, even in manual mode', () => {
    const store = configureStore({ reducer: rootReducer });
    // A paused manual clock would otherwise write its OWN anchor into `t` via
    // `hashBodyFor`; the rendered frame's instant must win regardless.
    const anchorInstant = new Date(julianDaysToUnixMs(SIM_DAYS) + 30 * 86_400_000);
    enterManualPausedAt(store.dispatch, anchorInstant);

    const url = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, BASE);

    const params = parseHashParams(url.slice(url.indexOf('#') + 1));
    expect(params.get('t')).toBe(new Date(julianDaysToUnixMs(SIM_DAYS)).toISOString());
    expect(params.get('t')).not.toBe(anchorInstant.toISOString());
  });

  it('preserves an existing hash row (orientation) alongside the overridden t and pose', () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(setOrientation('galactic'));

    const url = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, BASE);

    expect(url.startsWith('https://skymap.test/#')).toBe(true);
    const params = parseHashParams(url.slice(url.indexOf('#') + 1));
    expect(params.get('orientation')).toBe('galactic');
    expect(params.get('t')).toBe(new Date(julianDaysToUnixMs(SIM_DAYS)).toISOString());
    expect(params.get('pose')).toBe(encodeFramedPose(FRAMED));
  });

  it('share URL carries the switches that differ from boot, and none on a default view', () => {
    const store = configureStore({ reducer: rootReducer });
    const bare = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, BASE);
    expect(parseHashParams(bare.slice(bare.indexOf('#') + 1)).has('layers')).toBe(false);

    store.dispatch(setVisibility({ cluster: 'cosmicWebFilaments', field: 'enabled', on: true }));
    store.dispatch(setVisibility({ cluster: 'starCatalogs', field: 'enabled', on: false }));
    const url = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, BASE);

    // The section switch, not one token per star catalogue; registry order, not click order.
    expect(url).toContain('layers=-starCatalog,cosmicWebFilaments');
  });

  it('keeps the `?` gates (?tour, ?perf, …) alive, as writeHashBody does', () => {
    // `writeHashBody` rebuilds its base from `pathname + search` so a tour or
    // perf gate survives a hash write; a share link composed without it would
    // silently drop whichever gate the visitor was under.
    const store = configureStore({ reducer: rootReducer });
    const base = { ...BASE, search: '?tour=x' };

    const url = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, base);

    expect(url.startsWith('https://skymap.test/?tour=x#')).toBe(true);
  });
});
