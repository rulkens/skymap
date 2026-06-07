/**
 * Expand a Hubble-stage morphology code into a human-readable galaxy type.
 *
 * Curated famous-galaxy entries carry a terse morphological code in the
 * de Vaucouleurs / Hubble convention — 'SBb', 'E', 'S0-a' — which is precise
 * but cryptic to a lay reader.  We map the leading-letter family to a plain
 * English class and keep the original code in parentheses for the curious:
 *
 *   'SBb'   → 'Barred spiral (SBb)'
 *   'Sbc'   → 'Spiral (Sbc)'
 *   'E'     → 'Elliptical (E)'
 *   'S0'    → 'Lenticular (S0)'
 *   'I'     → 'Irregular (I)'
 *
 * The class is decided purely from the prefix, so finer stage suffixes
 * ('a'/'b'/'c'/'d', bar/ring qualifiers) ride along in the parenthetical
 * without needing an exhaustive lookup table.  Order matters: 'S0' and 'SB'
 * are tested before the generic 'S' so lenticulars and barred spirals don't
 * collapse into "Spiral".
 *
 * An unrecognised (or empty) code is returned untouched rather than
 * mislabelled — callers only invoke this with a curated, non-empty type, so
 * the pass-through is a defensive default, not a routine path.
 */
export function formatMorphology(code: string): string {
  const c = code.trim();
  const klass = morphologyClass(c);
  return klass ? `${klass} (${c})` : c;
}

function morphologyClass(c: string): string | null {
  if (c.startsWith('dSph')) return 'Dwarf spheroidal';
  if (c.startsWith('dE')) return 'Dwarf elliptical';
  if (c.startsWith('cD')) return 'cD galaxy';
  // 'E-S0' is a transition object catalogued as elliptical-leaning lenticular.
  if (c.startsWith('E')) return c.includes('S0') ? 'Elliptical/lenticular' : 'Elliptical';
  if (c.startsWith('S0')) return 'Lenticular';
  if (c.startsWith('SB')) return 'Barred spiral';
  // Catches SA / SAB (intermediate bars) and bare S?/Sa/Sb/Sc stages alike.
  if (c.startsWith('S')) return 'Spiral';
  if (c.startsWith('I')) return 'Irregular';
  return null;
}
