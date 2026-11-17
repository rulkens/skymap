/**
 * blackHoleLabelSource — one NEAR0 caption per hole, at its place. Inside the lens band, where
 * the marker has faded, the caption is what marks the hole, and its click target.
 */

import type { BlackHolesRuntime } from '../../@types/BlackHolesRuntime';
import type { Vec4 } from '../../../../@types/math/Vec4';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { BLACK_HOLES } from '../data/blackHoles';
import { BLACK_HOLE_CAPTION_PRIORITY } from '../data/blackHoleCaptionPriority';
import { BLACK_HOLE_SOURCE_ROWS } from '../../sources/blackHoleSourceRows';
import { blackHoleAnchorId } from './blackHoleAnchorId';

/**
 * A hole has no light to take a colour from, so the tint is authored: a warm accretion amber,
 * distinct from every blue-to-white star tint so the Galactic Centre reads as a landmark.
 */
const BLACK_HOLE_CAPTION_TINT: Readonly<Vec4> = [1, 0.66, 0.32, 1];

export function blackHoleLabelSource(runtime: Pick<BlackHolesRuntime, 'pickCode'>) {
  return labelSource({
    slab: NEAR0,
    toggle: 'blackHole',
    style: 'caption',
    items: () => BLACK_HOLES,
    describe: (row, i) => ({
      text: findByIdOrThrow(BLACK_HOLE_SOURCE_ROWS, row.id, 'blackHoleLabelSource').label,
      position: { anchorId: blackHoleAnchorId(row) },
      subjectRadiusMpc: schwarzschildRadiusM(row.massSolar) * SCALE_UNITS.M_TO_MPC,
      color: [...BLACK_HOLE_CAPTION_TINT],
      priority: BLACK_HOLE_CAPTION_PRIORITY,
      pick: { code: runtime.pickCode, index: i },
      fadeKey: row.id,
    }),
  });
}
