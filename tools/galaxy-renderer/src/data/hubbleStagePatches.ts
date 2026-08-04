/**
 * hubbleTypePatch — port of the spike's `onType` handler
 * (`Galaxy Renderer.dc.html`): picking a Hubble type in the UI
 * doesn't just set `type`, it also nudges a handful of correlated params
 * toward what that morphology actually looks like (ellipticals have no
 * dust, later-stage spirals have looser arms and more star formation, …).
 *
 * Category comes from `classifyHubbleType` (plan 01's single source of
 * truth) rather than the spike's duplicate `CAT` function.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import { classifyHubbleType } from '../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';

export function hubbleTypePatch(type: string): Partial<GalaxyParams> {
  const category = classifyHubbleType(type);

  if (category === 'lenticular') return { type, spriteDust: 0.15 };
  if (category === 'elliptical') return { type, spriteDust: 0 };
  if (category === 'irregular') return { type, hii: 0.1 };

  if (category === 'spiral' || category === 'barred') {
    // Hubble stage a→c: bulge shrinks, arms loosen, star formation rises.
    const stage = type[type.length - 1];
    if (stage === 'a')
      return {
        type,
        bulgeSize: 1.1,
        armWinding: 0.24,
        armStrength: 0.9,
        hii: 0.7,
        youngStars: 0.4,
      };
    if (stage === 'b')
      return { type, bulgeSize: 0.7, armWinding: 0.5, armStrength: 1.1, hii: 1.1, youngStars: 0.6 };
    if (stage === 'c')
      return {
        type,
        bulgeSize: 0.42,
        armWinding: 0.78,
        armStrength: 1.2,
        hii: 1.5,
        youngStars: 0.75,
      };
  }

  return { type };
}
