/**
 * createGalaxyFieldHost — the v2 field behind the narrow `GalaxyFieldHost`
 * contract the app and the tool share: the renderer, the ISM readback that
 * sets `youngStars.invMeanNorm`, and the frame-lane derivation. The renderer
 * and the readbacks come back as `debug` for the tool's diagnostics.
 */
import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { FieldHostTuning } from '../@types/FieldHostTuning';
import type { GalaxyFieldHost } from '../@types/GalaxyFieldHost';
import type { GalaxyFieldHostDebug } from '../@types/GalaxyFieldHostDebug';
import type { GalaxyFieldHostDeps } from '../@types/GalaxyFieldHostDeps';
import type { GalaxyIsmMap } from '../../../../../@types/galaxy/GalaxyIsmMap';
import type { YoungStarsLanes } from '../../header/@types/YoungStarsLanes';

import { areaWeightedMeanIsmMapChannel } from '../../ismMap/utils/areaWeightedMeanIsmMapChannel';
import { createGalaxyFieldRenderer } from '../../render/createGalaxyFieldRenderer';
import { createIsmMapReadbacks } from '../render/createIsmMapReadbacks';
import { deriveFieldFrameLanes } from '../utils/deriveFieldFrameLanes';
import { ismMapGridRadius } from '../../ismMap/utils/ismMapGridRadius';
import { planFieldFrame } from '../utils/planFieldFrame';

const EMPTY_PLAN: FieldFramePlan = { encodes: [], composites: [] };

export function createGalaxyFieldHost(
  device: GPUDevice,
  deps: GalaxyFieldHostDeps,
): { host: GalaxyFieldHost; debug: GalaxyFieldHostDebug } {
  // The hook fires only from a rebuild inside `setMixture`/`stepIsmMap`, never
  // during construction, so `readbacks` is initialised by the time it runs.
  const renderer = createGalaxyFieldRenderer(device, {
    makeShader: deps.makeShader,
    hdrFormat: deps.hdrFormat,
    dustMapFormat: deps.dustMapFormat,
    // The landing is the map `invMeanNorm` is computed from, which the shader
    // reads; until the first landing that lane is 1.
    onIsmMapRebuilt: (grid) => readbacks.requestIsmMap(grid, deps.onIsmMapLanded),
    onOrientationRebuilt: deps.onOrientationRebuilt,
  });
  const readbacks = createIsmMapReadbacks({
    device,
    ismMapGenerator: renderer.ismMapGenerator,
    orientation: renderer.ismMapOrientation,
  });

  // One value gates both encode and composites: untuned, the plan is empty
  // and `encode` returns, so no stale or unbuilt target is ever drawn.
  let tuning: FieldHostTuning | null = null;
  // Keyed on (map identity, gamma) rather than computed at the landing: gamma
  // is a live knob that can move on its own between landings.
  let youngStarsMeanCache: {
    readonly map: GalaxyIsmMap | null;
    readonly gamma: number;
    readonly invMeanNorm: number;
  } | null = null;

  /**
   * `1 / (area-weighted mean of pow(stars, gamma))`. No map yet, or a shaped
   * mean of 0 (quiet disc, cleared tracer), gives 1: the identity multiplier,
   * which youngFragment.wesl only reaches behind a component's `starsWeight > 0`.
   */
  function invMeanNormFor(map: GalaxyIsmMap | null, gamma: number): number {
    const cached = youngStarsMeanCache;
    if (cached && Object.is(cached.map, map) && cached.gamma === gamma) return cached.invMeanNorm;
    const shapedMean = map
      ? areaWeightedMeanIsmMapChannel(map, (texel) => Math.pow(Math.max(texel.stars, 0), gamma))
      : 0;
    const invMeanNorm = shapedMean > 0 ? 1 / shapedMean : 1;
    youngStarsMeanCache = { map, gamma, invMeanNorm };
    return invMeanNorm;
  }

  function youngStars(current: FieldHostTuning): YoungStarsLanes {
    // `?? 1`: a preset saved before `youngStars.contrast` existed has no such
    // key, and 1 is gamma's identity.
    const gamma = current.field.hii.youngStars?.contrast ?? 1;
    return { contrastGamma: gamma, invMeanNorm: invMeanNormFor(readbacks.ismMapData, gamma) };
  }

  const host: GalaxyFieldHost = {
    ensureFresh(): void {
      renderer.stepIsmMap();
    },

    plan: () => (tuning ? planFieldFrame(renderer.hiiSegments) : EMPTY_PLAN),

    encode(encoder, plan, camera, exposure, targets, timestampWrites): void {
      if (!tuning) return;
      const { render } = tuning;
      renderer.encode(encoder, plan, targets, {
        camera,
        view: deriveFieldFrameLanes({
          camera,
          exposure,
          dustReachR: renderer.dustHeaderLanes.reachR,
          render,
        }),
        render,
        ismMapSeeding: render.ismMapSeeding,
        youngStars: youngStars(tuning),
        timestampWrites,
      });
    },

    setTuning(next): void {
      // Only a moved grid invalidates a cached map: content one rebuild stale
      // over the same grid is kept (see `dropIfGridMoved`).
      if (next.geometry !== tuning?.geometry) {
        readbacks.dropIfGridMoved(ismMapGridRadius(next.geometry));
      }
      tuning = next;
      renderer.setMixture({
        geometry: next.geometry,
        fieldTuning: next.field,
        seed: next.seed,
        extras: next.extras,
        sigmaDerivTexels: next.render.orientationSigmaDerivTexels,
        sigmaIntegTexels: next.render.orientationSigmaIntegTexels,
        orientationViewWanted: next.render.debugViews.orientation > 0,
      });
    },

    destroy(): void {
      renderer.dispose();
    },
  };

  return { host, debug: { renderer, readbacks } };
}
