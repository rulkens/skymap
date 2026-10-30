/**
 * satellitesSelectionRow — the `satellite` selection kind. The ref is the NORAD number, which
 * outlives any day's file; the pick index is the catalog index. Extracting is a pure read: the row
 * carries its SGP4 position at `simDays`, and `followsSimClock` has core re-extract a selected or
 * focused one every frame and place it under `driver.poseId` (`placeLiveSelection`), which the
 * camera follows. With no catalog loaded there is no row: the satellites live only near Earth.
 */
import { Source } from '../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';
import { SATELLITE_FOCUS_GEOMETRY } from '../../../data/satellites/satelliteFocusGeometry';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { catalogIndexOf } from '../subsystems/catalogIndexOf';
import { satellitePositioner } from '../subsystems/satellitePositioner';
import { satelliteTransientId } from './satelliteTransientId';
import { encodeSatelliteFocusId } from './encodeSatelliteFocusId';
import { SATELLITE_FOCUS_PREFIX } from './satelliteFocusPrefix';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

const FOCUS_ID = /^satellite-(\d+)$/;

export function satellitesSelectionRow(
  runtime: SatellitesRuntime,
): SelectionKindRow<Extract<SelectionRef, { type: 'satellite' }>> {
  const decode = (id: string): Extract<SelectionRef, { type: 'satellite' }> | null => {
    const match = FOCUS_ID.exec(id);
    return match ? { type: 'satellite', noradId: Number(match[1]) } : null;
  };
  return {
    type: 'satellite',
    pickSources: [Source.Satellite],
    resolvePick: (_entry, pick) => {
      const noradId = runtime.propagator.catalog()?.noradId[pick.localIdx];
      return noradId === undefined ? null : { type: 'satellite', noradId };
    },
    encodePick: (ref) => {
      const catalog = runtime.propagator.catalog();
      const k = catalog === null ? -1 : catalogIndexOf(catalog, ref.noradId);
      return k < 0 ? null : packSelection(Source.Satellite, k + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays) => {
      const catalog = runtime.propagator.catalog();
      const k = catalog === null ? -1 : catalogIndexOf(catalog, ref.noradId);
      if (catalog === null || k < 0) return null;
      const id = satelliteTransientId(ref.noradId);
      const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
      const position = satellitePositioner(catalog, k, simDays, earth);
      if (position === null) return null;
      return {
        type: 'satellite',
        noradId: ref.noradId,
        label: catalog.names[k]!,
        cosparId: catalog.cosparIds[k]!,
        satelliteClass: SATELLITE_CLASSES[catalog.classCode[k]!] ?? 'other',
        positionMpc: [position[0], position[1], position[2]],
        altitudeKm:
          distanceMpc(position, earth) / SCALE_UNITS.KM_TO_MPC -
          SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_KM,
        periodMin: 1440 / catalog.meanMotion[k]!,
        inclinationDeg: catalog.inclinationDeg[k]!,
        epochMs: catalog.epochMs[k]!,
        driver: {
          poseId: id,
          ...SATELLITE_FOCUS_GEOMETRY,
          groundRadiusM: null,
          followsSimClock: true,
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
