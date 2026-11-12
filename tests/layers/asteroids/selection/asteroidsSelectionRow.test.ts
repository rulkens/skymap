import { describe, expect, it } from 'vitest';
import { asteroidsSelectionRow } from '../../../../src/layers/asteroids/selection/asteroidsSelectionRow';
import { asteroidTransientId } from '../../../../src/layers/asteroids/selection/present/asteroidTransientId';
import { asteroidHelioAu } from '../../../../src/layers/asteroids/kepler/utils/asteroidHelioAu';
import { ASTEROID_WINDOW } from '../../../../src/layers/asteroids/kepler/data/asteroidWindow';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import type { AsteroidsRuntime } from '../../../../src/layers/asteroids/@types/AsteroidsRuntime';
import type { AsteroidCatalog } from '../../../../src/layers/asteroids/catalog/@types/AsteroidCatalog';
import type { LoadedAsteroids } from '../../../../src/layers/asteroids/catalog/@types/LoadedAsteroids';
import type { AsteroidSelectionRow } from '../../../../src/layers/asteroids/selection/@types/AsteroidSelectionRow';
import { FIXTURE_EPOCH_JD, loadedAsteroids } from '../fixtures/loadedAsteroids';
import { relErr } from '../../../support/relErr';

// Not a catalog value: the row must pack the code its runtime holds.
const PICK_CODE = 41;
const runtimeOver = (loaded: LoadedAsteroids | null) =>
  ({ slot: { current: () => loaded }, pickCode: PICK_CODE }) as unknown as AsteroidsRuntime;
const LOADED = loadedAsteroids();
const row = asteroidsSelectionRow(runtimeOver(LOADED));
const ASTRAEA = { type: 'asteroid', number: 5 } as const;

describe('asteroidsSelectionRow', () => {
  it('pick round-trips row 432 to Eros’s ref and back', () => {
    const big = { catalog: { count: 1000 } as AsteroidCatalog } as LoadedAsteroids;
    const eros = asteroidsSelectionRow(runtimeOver(big));
    const pick = { sourceCode: PICK_CODE, localIdx: 432 };
    expect(eros.resolvePick(pick)).toEqual({ type: 'asteroid', number: 433 });
    expect(unpackPick(eros.encodePick({ type: 'asteroid', number: 433 })!)).toEqual(pick);
  });

  it('focus id asteroid-433 decodes to number 433; asteroid-4 is not claimed', () => {
    expect(row.focusId!.decode('asteroid-433')).toEqual({ type: 'asteroid', number: 433 });
    expect(row.focusId!.encode({ type: 'asteroid', number: 433 })).toBe('asteroid-433');
    for (const meshed of [1, 4, 101955, 134340]) {
      expect(row.focusId!.claims(`asteroid-${meshed}`)).toBe(false);
    }
  });

  it('claims rejects asteroid-x and asteroid-', () => {
    for (const id of ['asteroid-x', 'asteroid-', 'asteroid-0', 'asteroid-12a', 'satellite-433']) {
      expect(row.focusId!.claims(id)).toBe(false);
    }
  });

  it('extractRow places the asteroid where asteroidHelioAu says, in world Mpc', () => {
    const at = FIXTURE_EPOCH_JD + 1234.5;
    const extracted = row.extractRow(ASTRAEA, at) as AsteroidSelectionRow;
    const helio = asteroidHelioAu(LOADED.catalog, 4, at);
    // The Sun sits at the render origin.
    helio.forEach((au, axis) =>
      expect(relErr(extracted.positionMpc[axis]!, au * SCALE_UNITS.AU_TO_MPC)).toBeLessThan(1e-12),
    );
    expect(extracted.label).toBe('(5) Astraea');
    expect(extracted.driver.poseId).toBe(asteroidTransientId(5));
    expect(extracted.driver.placedEachFrame).toBe(true);
    expect(extracted.driver.followsSimClock).toBe(true);
  });

  it('has no row before the catalog loads, or past its last number', () => {
    expect(
      asteroidsSelectionRow(runtimeOver(null)).extractRow(ASTRAEA, FIXTURE_EPOCH_JD),
    ).toBeNull();
    expect(row.extractRow({ type: 'asteroid', number: 6 }, FIXTURE_EPOCH_JD)).toBeNull();
  });

  it('card fields: H unknown for a row with no H, and no now values outside the window', () => {
    const unnamed = row.extractRow({ type: 'asteroid', number: 3 }, FIXTURE_EPOCH_JD)!;
    expect(unnamed).toMatchObject({ label: '(3)', name: null, absoluteMagnitude: null });
    expect((unnamed as AsteroidSelectionRow).now!.magnitude).toBeNull();
    const inside = row.extractRow(ASTRAEA, FIXTURE_EPOCH_JD) as AsteroidSelectionRow;
    expect(Number.isFinite(inside.now!.magnitude)).toBe(true);
    const after = row.extractRow(ASTRAEA, ASTEROID_WINDOW.endJd + 1) as AsteroidSelectionRow;
    expect(after.now).toBeNull();
    expect(after.semiMajorAu).toBeCloseTo(3, 5);
  });
});
