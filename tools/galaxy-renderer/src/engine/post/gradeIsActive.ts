/**
 * gradeIsActive — is the tool-only grade trailer doing anything? At its
 * identity defaults it is not, and the whole pass is then skipped so the chain
 * is the app's chain exactly: one composite from HDR straight to the
 * destination, no LDR intermediate.
 */
import type { GradeUniformsInput } from './packGradeUniforms';

export function gradeIsActive({ saturation, vignette, gammaEncode }: GradeUniformsInput): boolean {
  return saturation !== 1 || vignette !== 0 || gammaEncode;
}
