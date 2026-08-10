/**
 * ReferenceGalaxy — one entry of the spike's REFS gallery
 * (`Galaxy Renderer.dc.html`): prose + a param preset + a camera pose for a
 * real named galaxy the generator can be dialled toward.
 *
 * The spike's object literal declared `view` twice — a display string, then
 * a few lines later the `{ az, el, dist }` pose — so the second key silently
 * won and the string never reached the UI; split here into `viewLabel`
 * (string) and `view` (pose). No `cat` field: morphological category is
 * `classifyHubbleType(params.type)`, derived on demand rather than duplicated.
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
