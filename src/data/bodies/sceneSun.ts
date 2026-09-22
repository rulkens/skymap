/**
 * sceneSun — the Sun's own one-row seed table (the `SEEDED_STAR_CATALOGS`
 * entry its registry row indexes into), generated from its own seed file
 * rather than merged into the famous-star table — sharing one table once
 * forced every gate it touched to carry an `id === 'sun'` exemption.
 * Position lives in `SCENE_ANCHORS` (heliocentric origin), not here.
 */

import { star } from './makers/star';
import { SUN_GENERATED } from './sun.generated';
import type { StarBody } from '../../@types/scene/StarBody';

export const SCENE_SUN: readonly StarBody[] = SUN_GENERATED.map(star);
