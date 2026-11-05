import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'packages/website/src/data';
const RECORD = 'ATTRIBUTIONS.md';

/**
 * Where the site gets an external address from, for a report a person can act
 * on: the `id` of the data row that holds it (`facts.ts: moon-distance`), or
 * the line of the licence record. Read as text, since the fact tables load
 * through Vite and a tool run by tsx cannot import them. `null` when the
 * address is written in a page itself.
 */
export function rowOfAddress(root: string, full: string): string | null {
  // The reference rows keep a DOI bare.
  const address = full.replace(/^https:\/\/doi\.org\//, '');
  for (const name of readdirSync(join(root, DATA_DIR)).filter((file) => file.endsWith('.ts'))) {
    const text = readFileSync(join(root, DATA_DIR, name), 'utf8');
    const at = text.indexOf(address);
    if (at < 0) continue;
    const ids = [...text.slice(0, at).matchAll(/\bid: '([^']+)'/g)];
    return `${name}: ${ids.at(-1)?.[1] ?? `line ${text.slice(0, at).split('\n').length}`}`;
  }
  const record = readFileSync(join(root, RECORD), 'utf8');
  const at = record.indexOf(address);
  return at < 0 ? null : `${RECORD}: line ${record.slice(0, at).split('\n').length}`;
}
