import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { engineSourceCountReported } from '../../../src/state/engine/engineSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { selectPendingFocusId } from '../../../src/state/selection/selectors';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { selectionRoute } from '../../../src/store/constants';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { pause, setSimDays } from '../../../src/state/time/timeSlice';
import { selectTimeState } from '../../../src/state/time/selectors';
import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import { sampledTracksSettled } from '../../../src/services/bodies/sampledTracksSettled';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { isoToJulianDays } from '../../../src/utils/time/isoToJulianDays';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';

const flush = () => new Promise((r) => setTimeout(r, 0));
const MARS = { type: 'body', id: 'mars' };

// One-row SDSS cloud whose objID matches the sdss-<id> deep link below.
// objIDs is BigUint64Array (unsigned) — NOT BigInt64Array.
function makeCloud(objId: bigint): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array([1, 0, 0]),
    spectroscopicZ: new Float32Array([0.01]),
    magU: new Float32Array([18]),
    magG: new Float32Array([17]),
    magR: new Float32Array([16]),
    magI: new Float32Array([16]),
    magZ: new Float32Array([16]),
    objIDs: new BigUint64Array([objId]),
    diameterKpc: new Float32Array([30]),
    axisRatio: new Float32Array([1]),
  });
}

describe('watchRequestFocusSaga', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the SDSS cloud is absent at first (deep link before load), then arrives.
  let cloudPresent = false;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    // The galaxyCatalog Layer's slice of the composed resolver, read LIVE so
    // the deferral cases can land the cloud mid-test.
    const galaxies = {
      get catalogs() {
        return cloudPresent ? new Map([['sdss', makeCloud(1237668393006604288n)]]) : new Map();
      },
    } as unknown as GalaxyRowFixture;
    const structures: StructureRowFixture = { byId: () => null, byCategory: () => [] };
    mw.run(watchRequestFocusSaga);
    mw.setContext({ selection: selectionResolverOver(structures, galaxies) });
    return s;
  }
  beforeEach(() => {
    cloudPresent = true;
    store = build();
  });

  it('resolves a structure id immediately (prefix-only, no cloud needed)', async () => {
    store.dispatch(requestFocus({ id: 'galaxy-cluster-virgo', transition: 'fly' }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({
      type: 'structure',
      id: 'galaxy-cluster-virgo',
    });
  });

  it('resolves a body deep link immediately, with no catalog cloud in the path', async () => {
    // Ruling 4: a static (body/star/structure) focus id resolves off its table
    // through the composed resolver's static rows — no `engineSourceCountReported`
    // pulse required, even with the cloud absent.
    cloudPresent = false;
    store.dispatch(requestFocus({ id: 'body-mars', transition: 'fly' }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: 'mars' });
  });

  it('defers an unresolvable galaxy id, then resolves on the catalog-landed count pulse', async () => {
    cloudPresent = false;
    store.dispatch(requestFocus({ id: 'sdss-1237668393006604288', transition: 'fly' }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toBeNull();

    cloudPresent = true;
    store.dispatch(engineSourceCountReported({ source: 'sdss', count: 1 }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({
      type: 'galaxyCatalog',
      source: 'sdss',
      index: 0,
    });
  });

  describe('a body focused while absent', () => {
    // A window the track covers; only `tDays` decides presence.
    const QQ8_TRACK: SampledTrack = {
      id: '2026-qq8',
      tDays: Float64Array.from([
        isoToJulianDays('2026-02-01T00:00:00Z'),
        isoToJulianDays('2027-03-31T00:00:00Z'),
      ]),
      posKm: new Float64Array(6),
      velKmS: new Float32Array(6),
    };
    const simDaysNow = () => deriveSimDays(selectTimeState(store.getState()), performance.now());
    const setClock = (iso: string) =>
      store.dispatch(setSimDays({ simDays: isoToJulianDays(iso), nowMs: performance.now() }));
    afterEach(() => vi.restoreAllMocks());

    it('moves the clock to its focus instant, keeping the clock paused, and focuses it', async () => {
      trajectoryRegistry.set(QQ8_TRACK);
      setClock('2027-06-01T00:00:00Z');
      store.dispatch(pause({ nowMs: performance.now() }));
      store.dispatch(requestFocus({ id: 'body-2026-qq8', transition: 'fly' }));
      await flush();
      expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: '2026-qq8' });
      expect(simDaysNow()).toBeCloseTo(isoToJulianDays('2026-08-19T00:00:00Z'), 6);
      expect(selectTimeState(store.getState()).paused).toBe(true);
    });

    it('leaves the clock alone while the body is present', async () => {
      trajectoryRegistry.set(QQ8_TRACK);
      setClock('2026-09-01T00:00:00Z');
      store.dispatch(pause({ nowMs: performance.now() }));
      store.dispatch(requestFocus({ id: 'body-2026-qq8', transition: 'fly' }));
      await flush();
      expect(simDaysNow()).toBeCloseTo(isoToJulianDays('2026-09-01T00:00:00Z'), 6);
    });

    it('judges presence on the loaded track, not on a track still loading', async () => {
      const get = vi.spyOn(trajectoryRegistry, 'get').mockReturnValue(undefined);
      setClock('2026-09-01T00:00:00Z');
      store.dispatch(pause({ nowMs: performance.now() }));
      store.dispatch(requestFocus({ id: 'body-2026-qq8', transition: 'cut' }));
      await flush();
      expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: '2026-qq8' });
      get.mockRestore();
      trajectoryRegistry.set(QQ8_TRACK);
      store.dispatch(sampledTracksSettled({ ids: [asSceneBodyId('2026-qq8')] }));
      await flush();
      expect(simDaysNow()).toBeCloseTo(isoToJulianDays('2026-09-01T00:00:00Z'), 6);
    });

    it('moves the clock once a still-loading track lands outside the instant', async () => {
      const get = vi.spyOn(trajectoryRegistry, 'get').mockReturnValue(undefined);
      setClock('2027-06-01T00:00:00Z');
      store.dispatch(pause({ nowMs: performance.now() }));
      store.dispatch(requestFocus({ id: 'body-2026-qq8', transition: 'cut' }));
      await flush();
      expect(simDaysNow()).toBeCloseTo(isoToJulianDays('2027-06-01T00:00:00Z'), 6);
      get.mockRestore();
      trajectoryRegistry.set(QQ8_TRACK);
      store.dispatch(sampledTracksSettled({ ids: [asSceneBodyId('2026-qq8')] }));
      await flush();
      expect(simDaysNow()).toBeCloseTo(isoToJulianDays('2026-08-19T00:00:00Z'), 6);
    });
  });

  it('an absent id clears the pending focus', async () => {
    store.dispatch(updateSelectionFocus(MARS));
    store.dispatch(requestFocus({ id: 'body-krypton', transition: 'fly' }));
    await flush();
    expect(selectPendingFocusId(store.getState())).toBeNull();
    expect(store.getState()[selectionRoute].focus).toEqual(MARS);
  });
});
