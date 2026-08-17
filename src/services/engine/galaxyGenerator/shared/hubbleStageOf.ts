/**
 * hubbleStageOf — `GalaxyParams.type` to an RC3 numerical stage T, the axis
 * every published morphology-binned quantity is tabulated against (de
 * Vaucouleurs et al. 1991). `classifyHubbleType` answers "what does the
 * generator SHAPE for this", which is five families; this answers "where on
 * the sequence is it", which is a number a literature table can be read at.
 *
 * Bar-ness is not part of T: 'Sb' and 'SBb' are both stage 3, and which of the
 * two gets a bar is `classifyHubbleType`'s call.
 */

/** Suffix after the leading S / SB, lower-cased, to RC3 T. */
const STAGE_BY_SUFFIX: Readonly<Record<string, number>> = {
  a: 1,
  ab: 2,
  b: 3,
  bc: 4,
  c: 5,
  cd: 6,
  d: 7,
  dm: 8,
  m: 9,
};

/**
 * Sb, the best-sampled stage on both source tables. Reached only by a type
 * string neither this nor `classifyHubbleType` recognises, and that one falls
 * back to 'spiral' — which takes no bar lane, so the fallback can never land
 * on the weak Sbc bar cell.
 */
const FALLBACK_STAGE = 3;

export function hubbleStageOf(type: string): number {
  if (type[0] === 'E') return -5; // E0..E7 — RC3 does not resolve the subtype
  if (type === 'S0') return -2;
  if (type === 'Irr' || type === 'Im') return 10;
  if (type[0] !== 'S') return FALLBACK_STAGE;
  const suffix = (type[1] === 'B' ? type.slice(2) : type.slice(1)).toLowerCase();
  return STAGE_BY_SUFFIX[suffix] ?? FALLBACK_STAGE;
}
