/**
 * composeControlSchemes — the control-scheme registry, built once at `startLoop`: core's rows
 * plus one row per exhibit section kind that carries a camera driver. Core owns that row's
 * activity: it is on while an exhibit carrying the kind runs, and its `pose` gets that
 * exhibit's section data. A scheme is a key, not a branch in the frame loop: openspace swaps `orbitDrag` for the navigator's rows.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { ControlScheme } from '../../../@types/engine/camera/ControlScheme';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import type { ExhibitCameraDriver } from '../../../@types/engine/camera/ExhibitCameraDriver';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import type { RootState } from '../../../store/types';
import { selectTakeoverSource } from '../../../state/takeover/selectors';
import { CAMERA_DRIVERS, OPENSPACE_DRIVERS } from './cameraDrivers';

function liftExhibitDriver(
  driver: ExhibitCameraDriver<unknown>,
  dataById: ReadonlyMap<string, unknown>,
): CameraDriver {
  const activeId = (s: RootState): string | null => {
    const source = selectTakeoverSource(s);
    return source?.kind === 'exhibit' && dataById.has(source.id) ? source.id : null;
  };
  return {
    ...driver,
    ridesExhibit: true,
    isActive: (s) => activeId(s) !== null,
    pose: (ctx, mem, own) => driver.pose(ctx, mem, own, dataById.get(activeId(ctx.state)!)),
  };
}

export function composeControlSchemes(
  exhibits: readonly Exhibit[],
): Readonly<Record<ControlSchemeId, ControlScheme>> {
  const byDriver = new Map<ExhibitCameraDriver<unknown>, Map<string, unknown>>();
  for (const exhibit of exhibits) {
    for (const { kind, data } of exhibit.body) {
      if (kind.cameraDriver === undefined) continue;
      const dataById = byDriver.get(kind.cameraDriver) ?? new Map<string, unknown>();
      byDriver.set(kind.cameraDriver, dataById.set(exhibit.id, data));
    }
  }
  const lifted = [...byDriver].map(([driver, dataById]) => liftExhibitDriver(driver, dataById));
  return {
    skymap: { drivers: [...CAMERA_DRIVERS, ...lifted] },
    openspace: { drivers: [...OPENSPACE_DRIVERS, ...lifted] },
  };
}
