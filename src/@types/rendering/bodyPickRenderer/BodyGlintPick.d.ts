import type { BodyPointPick } from './BodyPointPick';

/**
 * One GLINT point: a `BodyPointPick` plus the REQUIRED glint priority CLASS
 * (`0` earth, `1` planet, `2` moon — see `glintBandClass.ts`). Read by the
 * `'glint'` variant (the 20-byte instance stride), where `vsGlint` maps it to
 * its own pick-depth band so importance, not nearness, orders overlapping glints.
 *
 * `bandClass` is REQUIRED, not optional: the scene-star and glint point sets are
 * distinguished at the TYPE level by whether they carry it, so a glint caller
 * cannot silently omit it and fall to a runtime default band (class 0 is the
 * strongest — the Earth band — so a forgotten class would tie Earth at forced-
 * equal depth and reintroduce the ulp-jitter roulette the class bands exist to
 * eliminate). Making illegal states unrepresentable is why there is no `?? …`
 * default on the packing side.
 */
export type BodyGlintPick = BodyPointPick & {
  readonly bandClass: number;
};
