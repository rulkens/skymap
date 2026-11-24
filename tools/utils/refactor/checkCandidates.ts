/**
 * The files worth type checking after a run: every file it changed or created, and every
 * other TypeScript file that mentions one of the run's names as a whole word. A contract
 * change breaks its users, and a user names the property or function it uses; a whole
 * program check costs 11 to 14 s through the API (measured 2026-11-24), this a fraction.
 */
export function checkCandidates(input: {
  texts: ReadonlyMap<string, string>; // every project file, overlay applied, removed files gone
  changed: Iterable<string>;
  names: readonly string[];
}): readonly string[] {
  const { texts, names } = input;
  const found = new Set<string>();
  for (const file of input.changed) if (texts.has(file)) found.add(file);
  if (names.length === 0) return [...found];
  const alternatives = names.map((name) => name.replace(/[$]/g, '\\$&')).join('|');
  const mentions = new RegExp(`(?<![\\w$])(?:${alternatives})(?![\\w$])`);
  for (const [file, text] of texts) {
    if (/\.[cm]?tsx?$/.test(file) && mentions.test(text)) found.add(file);
  }
  return [...found];
}
