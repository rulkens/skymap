/**
 * addVec3 — component-wise sum of two or more Vec3s.
 *
 * The body-seed and orbit-conic sites repeatedly fold a focus back into a
 * relative offset (`origin + offset`), and each open-coded the three-component
 * addition with a "there is no vec3-add helper" apology. The second such site
 * is the trigger: the sum earns one home. Variadic because the moon seeds add
 * three vectors at once (render origin + parent offset + moon offset), so a
 * strict binary `add(a, b)` would force a nested call at exactly the site that
 * motivated the helper.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function addVec3(...vecs: readonly Readonly<Vec3>[]): Vec3 {
  const sum: Vec3 = [0, 0, 0];
  for (const v of vecs) {
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }
  return sum;
}
