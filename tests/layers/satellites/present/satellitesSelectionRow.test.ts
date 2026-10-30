import { describe, expect, it } from 'vitest';
import { satellitesSelectionRow } from '../../../../src/layers/satellites/present/satellitesSelectionRow';
import { satelliteTransientId } from '../../../../src/layers/satellites/present/satelliteTransientId';
import { createSatelliteSweeper } from '../../../../src/layers/satellites/load/createSatelliteSweeper';
import { composeTemeToWorld } from '../../../../src/layers/satellites/subsystems/composeTemeToWorld';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import { ISS, GOES_18 } from '../fixtures/celestrakRecords';

const { catalog } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [GOES_18, ISS] }],
  0,
);
const runtime = { propagator: { catalog: () => catalog } } as unknown as SatellitesRuntime;
const row = satellitesSelectionRow(runtime);
const AT_MS = Date.parse('2026-10-28T12:00:00Z');
const AT = unixMsToJulianDays(AT_MS);
const ISS_REF = { type: 'satellite', noradId: 25544 } as const;

describe('satellitesSelectionRow', () => {
  it('round-trips a focus id and claims nothing else', () => {
    expect(row.focusId!.decode('satellite-25544')).toEqual(ISS_REF);
    expect(row.focusId!.encode(ISS_REF)).toBe('satellite-25544');
    expect(row.focusId!.decode('satellite-')).toBeNull();
    expect(row.focusId!.claims('body-earth')).toBe(false);
  });

  it('encodes a pick word that resolves back to the same satellite', () => {
    const word = row.encodePick(ISS_REF)!;
    const pick = unpackPick(word)!;
    expect(pick.sourceCode).toBe(Source.Satellite);
    expect(row.resolvePick(undefined as never, pick)).toEqual(ISS_REF);
  });

  it('puts the ISS about 400 km up, posed from the id the camera follows', () => {
    const extracted = row.extractRow(ISS_REF, AT) as Extract<SelectionRow, { type: 'satellite' }>;
    expect(extracted.label).toBe('ISS (ZARYA)');
    expect(extracted.altitudeKm).toBeGreaterThan(380);
    expect(extracted.altitudeKm).toBeLessThan(440);
    expect(extracted.periodMin).toBeCloseTo(92.96, 1);
    expect(extracted.driver.poseId).toBe(satelliteTransientId(25544));
    expect(extracted.driver.followsSimClock).toBe(true);
  });

  it('follows the same point the dot is drawn at, to under a metre', () => {
    const extracted = row.extractRow(ISS_REF, AT) as Extract<SelectionRow, { type: 'satellite' }>;
    const k = catalog.noradId.indexOf(25544);
    const { posKm } = createSatelliteSweeper(catalog).sweep(AT_MS);
    const earth = deriveBodyStates(AT).get(SCENE_EARTH.id)!;
    const m = composeTemeToWorld(earth.orientation, AT);
    const [x, y, z] = [posKm[3 * k]!, posKm[3 * k + 1]!, posKm[3 * k + 2]!];
    const dot = [0, 1, 2].map(
      (i) =>
        earth.positionMpc[i]! + (m[i]! * x + m[3 + i]! * y + m[6 + i]! * z) * SCALE_UNITS.KM_TO_MPC,
    );
    const gapM =
      (Math.hypot(...[0, 1, 2].map((i) => dot[i]! - extracted.positionMpc[i]!)) /
        SCALE_UNITS.KM_TO_MPC) *
      1000;
    expect(gapM).toBeLessThan(1);
  });

  it('has no row before the catalog has loaded', () => {
    const none = satellitesSelectionRow({
      propagator: { catalog: () => null },
    } as unknown as SatellitesRuntime);
    expect(none.extractRow(ISS_REF, AT)).toBeNull();
  });
});
