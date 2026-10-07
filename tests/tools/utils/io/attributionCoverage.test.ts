/**
 * The attribution gate: everything third-party that enters skymap through
 * `rawDataRegistry.ts`, and every outside host the app's code names, has an
 * entry in `ATTRIBUTIONS.md`. A new registry key or a new host fails here until
 * its licence is written down.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAttributions } from '../../../../tools/utils/io/parseAttributions';
import { RAW_DATA } from '../../../../tools/utils/io/rawDataRegistry';

const ROOT = resolve(__dirname, '../../../..');
const ENTRIES = parseAttributions(readFileSync(join(ROOT, 'ATTRIBUTIONS.md'), 'utf8'));

const REQUIRED_LABELS = [
  'What',
  'By',
  'Licence',
  'Attribution',
  'Upstream',
  'Enters skymap',
  'Modified',
  'Checked',
];

/** XML and JSON-LD namespaces and the dev server: named in code, never a third party's data. */
const NOT_A_SOURCE = new Set(['www.w3.org', 'schema.org', 'localhost']);

function covers(pattern: string, key: string): boolean {
  return pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : pattern === key;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    if (item.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css|wesl)$/.test(item.name) ? [path] : [];
  });
}

/** Hosts in code, not in comments: a comment's reference link fetches nothing. */
function hostsIn(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  return [...code.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((match) => match[1] ?? '');
}

const CODE_HOSTS = new Set(
  [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'index.html'), join(ROOT, '.env.production')]
    .flatMap((path) => hostsIn(readFileSync(path, 'utf8')))
    .filter((host) => !NOT_A_SOURCE.has(host)),
);

describe('ATTRIBUTIONS.md entries', () => {
  it('each has a unique id, every required bullet and a check date', () => {
    const ids = ENTRIES.map((entry) => entry.id);
    expect(ids.filter((id, i) => id === '' || ids.indexOf(id) !== i)).toEqual([]);
    const incomplete = ENTRIES.flatMap((entry) => {
      const missing = REQUIRED_LABELS.filter((label) => !entry.fields[label]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked)) missing.push('Checked date');
      return missing.map((label) => `${entry.id}: ${label}`);
    });
    expect(incomplete).toEqual([]);
  });
});

describe('attribution coverage', () => {
  it('every raw-data registry key has an entry', () => {
    const patterns = ENTRIES.flatMap((entry) => entry.keys);
    const uncovered = Object.keys(RAW_DATA).filter(
      (key) => !patterns.some((pattern) => covers(pattern, key)),
    );
    expect(uncovered).toEqual([]);
  });

  it('every key an entry names is still in the registry', () => {
    const keys = Object.keys(RAW_DATA);
    const stale = ENTRIES.flatMap((entry) =>
      entry.keys
        .filter((pattern) => !keys.some((key) => covers(pattern, key)))
        .map((pattern) => `${entry.id}: ${pattern}`),
    );
    expect(stale).toEqual([]);
  });

  it('every outside host the app names has an entry', () => {
    const attributed = new Set(ENTRIES.flatMap((entry) => entry.hosts));
    expect([...CODE_HOSTS].filter((host) => !attributed.has(host)).sort()).toEqual([]);
  });

  it('every host an entry names is still in the code', () => {
    const stale = ENTRIES.flatMap((entry) =>
      entry.hosts.filter((host) => !CODE_HOSTS.has(host)).map((host) => `${entry.id}: ${host}`),
    );
    expect(stale).toEqual([]);
  });
});
