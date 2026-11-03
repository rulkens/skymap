// Catalogue sizes whose noun only says how the source is stored, not what it holds.
const GENERIC = ['rows', 'objects', 'spectra'];
// SDSS is queried for class GALAXY only (docs/DATA.md), Milliquas is quasars and other active nuclei, and DESI's
// table row gives galaxies.
const SOURCE_NOUN: Record<string, string> = {
  sdss: 'galaxies',
  milliquas: 'quasars',
  desi: 'galaxies',
};

/**
 * What a source's count is of: the noun of its catalogue size `rows` ("44,599 galaxies"), unless that only says
 * rows, objects or spectra. Then the source's own word where it holds one kind, else `group`'s word (GLADE+, which
 * takes in quasar catalogues, keeps it).
 */
export function countNoun(id: string, rows: string | undefined, group: string): string {
  const noun = rows?.split(' ')[1];
  return noun && !GENERIC.includes(noun) ? noun : (SOURCE_NOUN[id] ?? group);
}
