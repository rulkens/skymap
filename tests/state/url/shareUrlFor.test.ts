/**
 * shareUrlFor — the composer both the `l`-key log and the DebugPanel's
 * copy-URL button call. Covers: `t` comes from the rendered simDays (not the
 * clock anchor), `pose` is appended, and an existing hash row (`orientation`)
 * survives the override.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { shareUrlFor } from '../../../src/state/url/shareUrlFor';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import { enterManualPausedAt } from '../../../src/state/time/enterManualPausedAt';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';

const FRAMED = absoluteArm({ target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5 });
const SIM_DAYS = 2461304.571778822;
const BASE = { origin: 'https://skymap.test', pathname: '/' };

describe('shareUrlFor', () => {
  it('composes origin + pathname + hash, with `t` from the given simDays and `pose` appended', () => {
    const store = configureStore({ reducer: rootReducer });

    const url = shareUrlFor(store.getState(), FRAMED, SIM_DAYS, BASE);

    expect(url.startsWith('https://skymap.test/#')).toBe(true);
    const params = parseHashParams(url.slice(url.indexOf('#') + 1));
    expect(params.get('t')).toBe(new Date(julianDaysToUnixMs(SIM_DAYS)).toISOString());
    expect(params.get('pose')).toBe(encodeFramedPose(FRAMED));
  });

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

    const params = parseHashParams(url.slice(url.indexOf('#') + 1));
    expect(params.get('orientation')).toBe('galactic');
    expect(params.get('t')).toBe(new Date(julianDaysToUnixMs(SIM_DAYS)).toISOString());
    expect(params.get('pose')).toBe(encodeFramedPose(FRAMED));
  });
});
