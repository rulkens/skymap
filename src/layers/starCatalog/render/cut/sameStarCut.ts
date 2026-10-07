import type { StarCutSpec } from '../../@types/StarCutSpec';
import { EYE_SLACK_MPC, PLANE_SLACK } from '../../../../data/starNodeFade';

/**
 * Whether two cut specs ask the GPU for the same cut. Eye and frustum planes
 * match within a slack (a camera riding a moving body never repeats them
 * exactly); every other field must match exactly, including ones added later.
 */
export function sameStarCut(a: StarCutSpec, b: StarCutSpec): boolean {
  const { originMpc: eyeA, planes: planesA, ...restA } = a;
  const { originMpc: eyeB, planes: planesB, ...restB } = b;
  return (
    Math.hypot(eyeA[0] - eyeB[0], eyeA[1] - eyeB[1], eyeA[2] - eyeB[2]) <= EYE_SLACK_MPC &&
    planesA.length === planesB.length &&
    planesA.every((v, i) => Math.abs(v - planesB[i]!) <= PLANE_SLACK) &&
    // Whatever fields the spec has, so a later one is covered; the rest is four scalars and source rows.
    JSON.stringify(restA) === JSON.stringify(restB)
  );
}
