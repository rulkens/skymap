/**
 * starWikipediaTitle — resolve a famous star's Wikipedia article title from its
 * primary catalogue name (`names[0]`).
 *
 * For the overwhelming majority of famous stars the proper name IS the article
 * slug (Sirius, Betelgeuse, Vega), and Wikipedia's redirects absorb the rest
 * (Suhail → Lambda Velorum, Larawag → Epsilon Scorpii) — so the default is just
 * the name itself. This is deliberately NOT `famousWikipediaTitle`, whose
 * NGC-first heuristic is galaxy-flavoured.
 *
 * The override map holds only the handful whose plain name lands on a
 * disambiguation page or a different primary topic, where a bare link would 404
 * or mislead:
 *   - Pollux / Castor — the mythological twins own the plain slug.
 *   - Peacock — the bird owns it; the star's article is 'Alpha Pavonis'.
 *   - Mimosa — the plant owns it; the article is 'Mimosa (star)'.
 *   - Sadr — Sadr City and others; the article is 'Sadr (star)'.
 *   - Naos — a Greek-temple term owns the disambiguation; the article is
 *     'Zeta Puppis'.
 */

const STAR_WIKI_OVERRIDES: Readonly<Record<string, string>> = {
  Pollux: 'Pollux (star)',
  Castor: 'Castor (star)',
  Peacock: 'Alpha Pavonis',
  Mimosa: 'Mimosa (star)',
  Sadr: 'Sadr (star)',
  Naos: 'Zeta Puppis',
};

export function starWikipediaTitle(primaryName: string): string {
  return STAR_WIKI_OVERRIDES[primaryName] ?? primaryName;
}
