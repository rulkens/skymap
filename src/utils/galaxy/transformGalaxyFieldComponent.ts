/**
 * transformGalaxyFieldComponent — carries one analytic-field Gaussian from a
 * galaxy's own local space into world space, using EXACTLY the rigid
 * transform the sprite path bakes into generation: `applyExtraTransform` in
 * `milkyWay/sprites/generate.wesl` scales, then Y-spins (disk axis), then X-tilts
 * (inclination), then translates. Reusing that same composition (not a
 * generic rotation) is what keeps a background galaxy's analytic mixture
 * registered with its own sprites.
 *
 * Amplitude case found: `writeStar` bakes the transform onto a star record
 * as
 *   let pos = applyExtraTransform(rec.pos);
 *   ...
 *   outBuf[base + 6u] = rec.size * gen.extraScale;   // size scaled by s
 *   outBuf[base + 7u] = rec.brightness;              // brightness untouched
 * so a sprite's flux (quad area, hence size^2) scales as s^2 while nothing
 * scales brightness. Matching that against the mixture's amplitude — whose
 * total flux is its volume integral, scaling as sigma^3 i.e. s^3 once every
 * length is scaled by s — needs amplitude' = A * s^2 / s^3 = A / s.
 */
import type { GalaxyFieldComponent } from '../../@types/galaxy/GalaxyFieldComponent';
import type { ExtraGalaxySpec } from '../../@types/galaxy/ExtraGalaxySpec';

export function transformGalaxyFieldComponent(
  component: GalaxyFieldComponent,
  transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
): GalaxyFieldComponent {
  const { pos, scale: s, rotY, tiltX } = transform;
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);

  // Rotation-only R matching applyExtraTransform's Y-spin-then-X-tilt
  // composition (scale and translation are applied separately below); row i
  // holds output coordinate i's coefficients of (x, y, z).
  const r00 = cy;
  const r01 = 0;
  const r02 = -sy;
  const r10 = -sx * sy;
  const r11 = cx;
  const r12 = -sx * cy;
  const r20 = cx * sy;
  const r21 = sx;
  const r22 = cx * cy;

  const [cx0, cy0, cz0] = component.center;
  const center: readonly [number, number, number] = [
    s * (r00 * cx0 + r01 * cy0 + r02 * cz0) + pos[0],
    s * (r10 * cx0 + r11 * cy0 + r12 * cz0) + pos[1],
    s * (r20 * cx0 + r21 * cy0 + r22 * cz0) + pos[2],
  ];

  // M' = (1/s^2) * R * M * R^T. Expanded as a full 3x3 congruence (R has no
  // zero structure to shortcut, unlike galaxyFieldInverseCovariance's
  // tilt-plus-shear form) via an explicit RM then RM*R^T.
  const [m00, m11, m22] = component.invCovDiagonal;
  const [m01, m02, m12] = component.invCovOffDiagonal;
  const m = [
    [m00, m01, m02],
    [m01, m11, m12],
    [m02, m12, m22],
  ] as const;
  const r = [
    [r00, r01, r02],
    [r10, r11, r12],
    [r20, r21, r22],
  ] as const;

  const rm: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += r[i]![k]! * m[k]![j]!;
      rm[i]![j] = sum;
    }
  }
  const invS2 = 1 / (s * s);
  const mPrime = (i: number, j: number): number => {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += rm[i]![k]! * r[j]![k]!;
    return sum * invS2;
  };

  return {
    amplitude: component.amplitude / s,
    invCovDiagonal: [mPrime(0, 0), mPrime(1, 1), mPrime(2, 2)],
    invCovOffDiagonal: [mPrime(0, 1), mPrime(0, 2), mPrime(1, 2)],
    color: component.color,
    center,
    boundRadius: s * component.boundRadius,
  };
}
