/**
 * asteroidsSelectionRow — the `asteroid` selection kind. The ref is the MPC number and the pick index
 * is the row, number − 1. Extracting is a pure read of the CPU Kepler mirror at `simDays`, and
 * `placedEachFrame` has core re-extract a selected or focused one every frame and place it under
 * `driver.poseId`, which the camera follows. The meshed numbers are never claimed (their bodies own
 * them), and with no catalog loaded there is no row.
 */
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { ASTEROID_FOCUS_GEOMETRY } from './data/asteroidFocusGeometry';
import { ASTEROID_HIDDEN_FLAG } from '../catalog/data/asteroidHiddenFlag';
import { MESH_ASTEROID_NUMBERS } from '../catalog/data/meshAsteroidNumbers';
import { footprintRadiusMpc } from '../../../utils/selection/footprintRadiusMpc';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { asteroidHelioAu } from '../kepler/utils/asteroidHelioAu';
import { asteroidWindowFade } from '../kepler/utils/asteroidWindowFade';
import { asteroidAbsoluteMagnitude } from '../catalog/utils/asteroidAbsoluteMagnitude';
import { asteroidNameOf } from '../catalog/utils/asteroidNameOf';
import { asteroidClassOf } from '../catalog/utils/asteroidClassOf';
import { asteroidNowAt } from './utils/asteroidNowAt';
import { asteroidTransientId } from './present/asteroidTransientId';
import { asteroidLabel } from './present/asteroidLabel';
import { encodeAsteroidFocusId } from '../focus/present/encodeAsteroidFocusId';
import type { AsteroidsRuntime } from '../@types/AsteroidsRuntime';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { AsteroidRef } from './@types/AsteroidRef';
import type { AsteroidSelectionRow } from './@types/AsteroidSelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

const FOCUS_ID = /^asteroid-(\d+)$/;
const RAD_TO_DEG = 180 / Math.PI;
const DAYS_PER_YEAR = 365.25;

export function asteroidsSelectionRow(runtime: AsteroidsRuntime): SelectionKindRow<AsteroidRef> {
  const decode = (id: string): AsteroidRef | null => {
    const match = FOCUS_ID.exec(id);
    const number = match ? Number(match[1]) : 0;
    return number >= 1 && !MESH_ASTEROID_NUMBERS.includes(number)
      ? { type: 'asteroid', number }
      : null;
  };
  /** The ref's row in the loaded catalog, or -1 (also for a hidden row: ABSENT or drawn as a mesh). */
  const rowOf = (number: number): number => {
    const catalog = runtime.slot.current()?.catalog;
    if (catalog === undefined || number < 1 || number > catalog.count) return -1;
    return catalog.flags[number - 1]! & ASTEROID_HIDDEN_FLAG ? -1 : number - 1;
  };
  return {
    type: 'asteroid',
    pickSources: [runtime.pickCode],
    resolvePick: (pick) => ({ type: 'asteroid', number: pick.localIdx + 1 }),
    encodePick: (ref) => {
      const k = rowOf(ref.number);
      return k < 0 ? null : packSelection(runtime.pickCode, k + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays): AsteroidSelectionRow | null => {
      const loaded = runtime.slot.current();
      const k = rowOf(ref.number);
      if (loaded === null || k < 0) return null;
      const { catalog, names } = loaded;
      const helio = asteroidHelioAu(catalog, k, simDays);
      const au = SCALE_UNITS.AU_TO_MPC;
      const positionMpc: Vec3 = [
        RENDER_ORIGIN_MPC[0] + helio[0] * au,
        RENDER_ORIGIN_MPC[1] + helio[1] * au,
        RENDER_ORIGIN_MPC[2] + helio[2] * au,
      ];
      const earthMpc = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
      const earthHelioAu: Vec3 = [
        (earthMpc[0] - RENDER_ORIGIN_MPC[0]) / au,
        (earthMpc[1] - RENDER_ORIGIN_MPC[1]) / au,
        (earthMpc[2] - RENDER_ORIGIN_MPC[2]) / au,
      ];
      const name = asteroidNameOf(names, ref.number);
      return {
        type: 'asteroid',
        number: ref.number,
        name,
        label: asteroidLabel(ref.number, name),
        asteroidClass: asteroidClassOf(catalog, k),
        positionMpc,
        semiMajorAu: catalog.a[k]!,
        eccentricity: catalog.e[k]!,
        inclinationDeg: catalog.i[k]! * RAD_TO_DEG,
        periodYears: (2 * Math.PI) / catalog.elementsB[4 * k + 3]! / DAYS_PER_YEAR,
        absoluteMagnitude: asteroidAbsoluteMagnitude(catalog, k),
        epochJd: catalog.epochJd,
        now:
          asteroidWindowFade(simDays) > 0 ? asteroidNowAt(catalog, k, helio, earthHelioAu) : null,
        radiusMpc: footprintRadiusMpc(ASTEROID_FOCUS_GEOMETRY),
        driver: {
          poseId: asteroidTransientId(ref.number),
          ...ASTEROID_FOCUS_GEOMETRY,
          groundRadiusM: null,
          followsSimClock: true,
          placedEachFrame: true,
        },
      };
    },
    focusId: {
      claims: (id) => decode(id) !== null,
      decode,
      encode: (ref) => encodeAsteroidFocusId(ref.number),
    },
  };
}
