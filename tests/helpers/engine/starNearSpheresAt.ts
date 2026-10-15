/**
 * starNearSpheresAt — a `ReadyFrameContext.nearSpheres` for FrameView fixtures
 * that never run `deriveFrameContext`: the star Layer's source bound to the
 * J2000-style body sample at `simDays` and the given settings, as core binds it.
 */

import type { NearSphereProvider } from '../../../src/@types/engine/frame/NearSphereProvider';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import { starNearSpheres } from '../../../src/layers/starCatalog/present/starNearSpheres';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';

export function starNearSpheresAt(
  settings: EngineSettingsState,
  simDays: number,
): NearSphereProvider {
  return (camPosMpc, pxPerRad) =>
    starNearSpheres.spheres({
      bodyStates: deriveBodyStates(simDays),
      settings,
      camPosMpc,
      pxPerRad,
    });
}
