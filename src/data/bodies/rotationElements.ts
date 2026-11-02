/**
 * rotationElements — J2000 rotation elements for bodies with a modelled facing:
 * pole (α₀, δ₀), prime meridian W₀ and spin rate Ẇ, all degrees. A body with no row
 * falls back to `IDENTITY_MAT3`. Rows live with their Layer's body rows (Archinal et al.
 * (2018), Cel. Mech. Dyn. Astron. 130:22, Tables 1 and 2/3; Earth's spin is IERS).
 */

import type { RotationElements } from '../../@types/scene/RotationElements';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';

export function rotationRowById(id: string): RotationElements | null {
  return ROTATION_ELEMENTS.find((el) => el.id === id) ?? null;
}

export const ROTATION_ELEMENTS: readonly RotationElements[] = APP_BODY_REGISTRY.flatMap((row) => row.rotation ?? []);
