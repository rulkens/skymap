/**
 * satellitesSelectionRow — the `satellite` selection kind. The ref is the NORAD number, which
 * outlives any day's file; the pick index is the catalog index. Extracting is a pure read: the row
 * carries its SGP4 position at `simDays`, and `placedEachFrame` has core re-extract a selected or
 * focused one every frame and place it under `driver.poseId` (`placeLiveSelection`), which the
 * camera follows. With no catalog loaded there is no row: the satellites live only near Earth.
 */
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';
import { SATELLITE_FOCUS_GEOMETRY } from './data/satelliteFocusGeometry';
import { footprintRadiusMpc } from '../../../utils/selection/footprintRadiusMpc';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { DAY_MS } from '../../../data/time/dayMs';
import { catalogIndexOf } from '../catalog/subsystems/catalogIndexOf';
import { satellitePositionMpc } from '../sweep/subsystems/satellitePositionMpc';
import { satelliteTransientId } from './present/satelliteTransientId';
import { encodeSatelliteFocusId } from '../focus/present/encodeSatelliteFocusId';
import { SATELLITE_FOCUS_PREFIX } from '../focus/present/satelliteFocusPrefix';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SatelliteRef } from './@types/SatelliteRef';
import type { FocusResolution } from '../../../@types/engine/selection/FocusResolution';

const FOCUS_ID = /^satellite-(\d+)$/;

export function satellitesSelectionRow(runtime: SatellitesRuntime): SelectionKindRow<SatelliteRef> {
  const decode = (id: string): FocusResolution<SatelliteRef> => {
    const match = FOCUS_ID.exec(id);
    if (!match) return { kind: 'absent' };
    const catalog = runtime.propagator.catalog();
    if (catalog === null) return { kind: 'pending' };
    const noradId = Number(match[1]);
    return catalogIndexOf(catalog, noradId) < 0
      ? { kind: 'absent' }
      : { kind: 'hit', ref: { type: 'satellite', noradId } };
  };
  return {
    type: 'satellite',
    pickSources: [runtime.pickCode],
    resolvePick: (pick) => {
      const noradId = runtime.propagator.catalog()?.noradId[pick.localIdx];
      return noradId === undefined ? null : { type: 'satellite', noradId };
    },
    encodePick: (ref) => {
      const catalog = runtime.propagator.catalog();
      const k = catalog === null ? -1 : catalogIndexOf(catalog, ref.noradId);
      return k < 0 ? null : packSelection(runtime.pickCode, k + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays) => {
      const catalog = runtime.propagator.catalog();
      const k = catalog === null ? -1 : catalogIndexOf(catalog, ref.noradId);
      if (catalog === null || k < 0) return null;
      const id = satelliteTransientId(ref.noradId);
      const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!;
      const position = satellitePositionMpc(catalog, k, simDays, earth);
      if (position === null) return null;
      return {
        type: 'satellite',
        noradId: ref.noradId,
        label: catalog.names[k]!,
        cosparId: catalog.cosparIds[k]!,
        satelliteClass: SATELLITE_CLASSES[catalog.classCode[k]!] ?? 'other',
        positionMpc: [position[0], position[1], position[2]],
        altitudeKm:
          distanceMpc(position, earth.positionMpc) / SCALE_UNITS.KM_TO_MPC -
          SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_KM,
        periodMin: 1440 / catalog.meanMotion[k]!,
        inclinationDeg: catalog.inclinationDeg[k]!,
        epochMs: catalog.epochMs[k]!,
        fitAgeDays: (julianDaysToUnixMs(simDays) - catalog.epochMs[k]!) / DAY_MS,
        radiusMpc: footprintRadiusMpc(SATELLITE_FOCUS_GEOMETRY),
        driver: {
          poseId: id,
          ...SATELLITE_FOCUS_GEOMETRY,
          groundRadiusM: null,
          followsSimClock: true,
          placedEachFrame: true,
        },
      };
    },
    focusId: {
      claims: (id) => id.startsWith(SATELLITE_FOCUS_PREFIX),
      decode,
      encode: (ref) => encodeSatelliteFocusId(ref.noradId),
    },
  };
}
