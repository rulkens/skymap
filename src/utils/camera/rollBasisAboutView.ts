import type { Mat3 } from '../../@types/math/Mat3';

/**
 * Rolls a right | up | forward basis about its forward column, in
 * `imagePlaneBasis`'s handedness for `right = forward × up`, so a positive
 * angle reads as the same image roll the world arm's `roll` gives. A rotation
 * within the right–up plane, so the basis stays orthonormal.
 */
export function rollBasisAboutView(basis: Readonly<Mat3>, rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const [rx, ry, rz, ux, uy, uz, fx, fy, fz] = basis;
  return [
    rx * c + ux * s,
    ry * c + uy * s,
    rz * c + uz * s,
    ux * c - rx * s,
    uy * c - ry * s,
    uz * c - rz * s,
    fx,
    fy,
    fz,
  ] as Mat3;
}
