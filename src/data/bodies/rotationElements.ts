/**
 * rotationElements — J2000 rotation elements for bodies with a modelled facing:
 * pole (α₀, δ₀), prime meridian W₀ and spin rate Ẇ, all degrees. `orbitalElements`
 * places a body; this aims it. A body with no row is rotation-invariant and
 * falls back to `IDENTITY_MAT3`. The rows live with their Layer's body rows (Archinal et al.
 * (2018), Cel. Mech. Dyn. Astron. 130:22, Tables 1 and 2/3; Earth's spin is the IERS one, see
 * its row); this table folds them through `LAYER_BODY_ROWS`.
 */

import type { RotationElements } from '../../@types/scene/RotationElements';
import { LAYER_BODY_ROWS } from './layerBodyRows';

export function rotationRowById(id: string): RotationElements | null {
  return ROTATION_ELEMENTS.find((el) => el.id === id) ?? null;
}

export const ROTATION_ELEMENTS: readonly RotationElements[] = LAYER_BODY_ROWS.flatMap((row) => row.rotation ?? []);
