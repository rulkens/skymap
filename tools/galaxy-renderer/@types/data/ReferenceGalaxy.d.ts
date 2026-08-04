/**
 * ReferenceGalaxy — one entry of the spike's REFS gallery
 * (`Galaxy Renderer.dc.html`): prose + a param preset + a camera
 * pose for a real named galaxy the generator can be dialled toward.
 *
 * The spike's object literal declares `view` twice — once as a display
 * string ('Face-on', 'Edge-on (6°)', …) and again a few lines later as the
 * `{ az, el, dist }` pose. In plain JS the second key silently overwrites
 * the first, so the display string never actually reached the UI. That's a
 * duplicate-key bug, not a real union — this type un-braids it into two
 * named fields (`viewLabel` for the string, `view` for the pose) so both
 * survive.
 *
 * The spike also carried a `cat` field per entry, but morphological
 * category is a pure function of `params.type` (`classifyHubbleType`), so
 * duplicating it here would just be a second source of truth that could
 * drift from the type string. Dropped; callers derive it on demand.
 */
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { ViewPose } from '../engine/ViewPose';

export type ReferenceGalaxy = {
  readonly id: string;
  readonly short: string; // chip label
  readonly name: string;
  readonly hubbleType: string; // display string, e.g. 'SAB(s)bc — spiral'
  readonly dist: string;
  readonly diam: string;
  readonly arms: string;
  readonly viewLabel: string; // 'Face-on', 'Edge-on (6°)', …
  readonly notable: string;
  readonly credit: string;
  readonly img: string | null; // '/images/famous-curated/<id>/starless.webp'; null for the Milky Way
  readonly params: Partial<GalaxyParams>;
  readonly view: ViewPose;
};
