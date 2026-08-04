/**
 * buildExtraSpecs — port of the spike's `applyExtras` method
 * (`Galaxy Renderer.dc.html`): the multi-galaxy perf-test scatter.
 * Each spec gets a full random parameter set, a lighter star count than a
 * hero galaxy (40k-200k, so N of them stays affordable), a random distance
 * in the near-field shell, a random spherical placement flattened on Y to
 * keep the scatter disk-like rather than a sphere, and a random scale +
 * orientation.
 *
 * The spike's `params.background = false` line is dead code — `GalaxyParams`
 * dropped the `background` field entirely (see its module header) because
 * `galaxy-model.js` hardcoded that field to 0 regardless of the param —
 * so it isn't ported.
 */

import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { randomGalaxyParams } from './randomGalaxyParams';

export function buildExtraSpecs(count: number, rng: () => number): ExtraGalaxySpec[] {
  const specs: ExtraGalaxySpec[] = [];

  for (let i = 0; i < count; i++) {
    const params = {
      ...randomGalaxyParams(rng, { includeSize: true }),
      starCount: (40 + ((rng() * 160) | 0)) * 1000,
    };

    const dist = 26 + rng() * 70;
    const az = rng() * Math.PI * 2;
    const el = (rng() - 0.5) * 1.3;
    const pos: Vec3 = [
      dist * Math.cos(el) * Math.cos(az),
      dist * Math.sin(el) * 0.6,
      dist * Math.cos(el) * Math.sin(az),
    ];

    specs.push({
      params,
      pos,
      scale: 0.12 + rng() * 0.3,
      rotY: rng() * Math.PI * 2,
      tiltX: rng() * Math.PI,
    });
  }

  return specs;
}
