/**
 * The attribution gate: every `###` heading of `ATTRIBUTIONS.md` is a complete
 * entry with a `Use` term of the closed vocabulary, every key of `rawDataRegistry.ts` (with its upstream host) belongs to
 * exactly one entry, and every outside host the app's source names, comments
 * included, is on an entry.
 * Limits: it cannot see a host assembled at run time, `packages/website/`,
 * fetchers under `tools/` that bypass the registry, files under `public/`, npm
 * packages, an entry with no key and no host that is deleted whole, or
 * whether a licence text is true. The `Use` check reads words, not terms: it
 * catches a free term beside a Licence text that says "non-commercial", "NC"
 * or "permission", and misses a restriction worded any other way ("all rights
 * reserved", "scientific use", a copyleft, a licence named only by its URL).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ATTRIBUTION_USES } from '../../../../tools/utils/io/attributionUses';
import { parseAttributions } from '../../../../tools/utils/io/parseAttributions';
import { parseAttributionUses } from '../../../../tools/utils/io/parseAttributionUses';
import { RAW_DATA, type RawDataEntry } from '../../../../tools/utils/io/rawDataRegistry';

const ROOT = resolve(__dirname, '../../../..');
const MARKDOWN = readFileSync(join(ROOT, 'ATTRIBUTIONS.md'), 'utf8');
const ENTRIES = parseAttributions(MARKDOWN);
const REGISTRY: Readonly<Record<string, RawDataEntry>> = RAW_DATA;

const REQUIRED_LABELS = [
  'What',
  'By',
  'Licence',
  'Use',
  'Attribution',
  'Upstream',
  'Enters skymap',
  'Modified',
  'Checked',
];
/** A licence line that says nothing: a marker word, or "unknown" with no reason after it. */
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|^(unknown|n\/a|none|\W*)\W*$/i;
/** Words of a Licence text that a free `Use` term cannot stand beside. */
const RESTRICTS = /non-?commercial|\bNC\b|permission/i;
/** Entries whose Licence text has such a word and is free all the same, each with why. */
const FREE_ALL_THE_SAME: Readonly<Record<string, string>> = {
  'hoskins-hash':
    'MIT opens "Permission is hereby granted"; the NC licence named is the sound tab\u2019s',
};
/** A prefix shorter than this is a catch-all (`*`, `a*`), not a catalogue. */
const MIN_PREFIX = 4;

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

const SOURCE = [
  ...sourceFiles(join(ROOT, 'src')),
  join(ROOT, 'index.html'),
  join(ROOT, '.env.production'),
].map((path) => readFileSync(path, 'utf8'));
/** Comments are scanned too: a comment is where ported code names where it came from. */
const CODE_HOSTS = new Set(
  SOURCE.flatMap((text) =>
    [...text.matchAll(/(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g)].map((match) => match[1] ?? ''),
  ).filter((host) => !NOT_A_SOURCE.has(host)),
);

describe('parseAttributions', () => {
  const entry = (marker: string, extra = '') =>
    `### Thing\n\n${marker}\n\n- **What:** a thing\n- **Licence:** MIT\n${extra}`;

  it('refuses a heading whose marker is missing, misspelt or carries an unknown attribute', () => {
    expect(() => parseAttributions(entry(''))).toThrow(/no attribution marker/);
    expect(() => parseAttributions(entry('<!-- atribution: id=thing -->'))).toThrow(
      /no attribution marker/,
    );
    expect(() =>
      parseAttributions(entry('<!-- attribution: id=thing; host=example.org -->')),
    ).toThrow(/"host"/);
  });

  it('keeps a bullet’s lines, block quotes and all, and gives it joined on one line as well', () => {
    const [row] = parseAttributions(
      '## Part\n\nA note.\n\n' +
        entry(
          '<!-- attribution: id=thing -->',
          '- **Attribution:** Say:\n\n  > A text\n  > of theirs.\n\nNot the bullet.\n',
        ),
    );
    expect(row!.bullets.Attribution).toBe('Say:\n\n> A text\n> of theirs.');
    expect(row!.fields.Attribution).toBe('Say: > A text > of theirs.');
    expect([row!.heading, row!.section, row!.sectionNotes]).toEqual(['Thing', 'Part', ['A note.']]);
  });

  it('refuses a second bullet of the same label', () => {
    expect(() =>
      parseAttributions(entry('<!-- attribution: id=thing -->', '- **Licence:** GPL\n')),
    ).toThrow(/second "Licence"/);
  });
});

describe('ATTRIBUTIONS.md entries', () => {
  it('each has a unique id, every required bullet, a licence that says something and a check date not in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ids = ENTRIES.map((entry) => entry.id);
    expect(ids.filter((id, i) => id === '' || ids.indexOf(id) !== i)).toEqual([]);
    const incomplete = ENTRIES.flatMap((entry) => {
      const missing = REQUIRED_LABELS.filter((label) => !entry.fields[label]);
      if (PLACEHOLDER.test(entry.fields.Licence ?? '')) missing.push('Licence is a placeholder');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked) || entry.checked > today)
        missing.push('Checked date');
      return missing.map((label) => `${entry.id}: ${label}`);
    });
    expect(incomplete).toEqual([]);
  });
});

describe('the Use bullet', () => {
  it('refuses a term outside the vocabulary', () => {
    expect(() =>
      parseAttributions(
        '### Thing\n\n<!-- attribution: id=thing -->\n\n- **Use:** Free with credit; Free for all\n',
      ),
    ).toThrow(/unknown Use term "Free for all"/);
  });

  it('is defined, term by term, at the head of the file', () => {
    expect(Object.keys(parseAttributionUses(MARKDOWN))).toEqual(Object.keys(ATTRIBUTION_USES));
    expect(() => parseAttributionUses(MARKDOWN.replace('- `Per item`:', '- `Per thing`:'))).toThrow(
      /no definition of the Use term "Per item"/,
    );
  });

  it('is never only free terms where the Licence text speaks of non-commercial use or permission', () => {
    const free = ENTRIES.filter(
      (entry) =>
        RESTRICTS.test(entry.fields.Licence ?? '') &&
        entry.use.every((term) => ATTRIBUTION_USES[term] === 'free'),
    ).map((entry) => entry.id);
    expect(free.sort()).toEqual(Object.keys(FREE_ALL_THE_SAME).sort());
  });
});

describe('attribution coverage', () => {
  it('every raw-data registry key belongs to exactly one entry, by a key or a prefix of a catalogue', () => {
    const patterns = ENTRIES.flatMap((entry) => entry.keys);
    expect(
      patterns.filter((pattern) => pattern.endsWith('*') && pattern.length <= MIN_PREFIX),
    ).toEqual([]);
    const notOnce = Object.keys(REGISTRY).flatMap((key) => {
      const owners = ENTRIES.filter((entry) => entry.keys.some((pattern) => covers(pattern, key)));
      return owners.length === 1
        ? []
        : [`${key}: ${owners.map((entry) => entry.id).join(', ') || 'no entry'}`];
    });
    expect(notOnce).toEqual([]);
  });

  it('every key an entry names is still in the registry', () => {
    const keys = Object.keys(REGISTRY);
    const stale = ENTRIES.flatMap((entry) =>
      entry.keys
        .filter((pattern) => !keys.some((key) => covers(pattern, key)))
        .map((pattern) => `${entry.id}: ${pattern}`),
    );
    expect(stale).toEqual([]);
  });

  it('the entry of a registry key names the host the key is fetched from', () => {
    const unnamed = Object.entries(REGISTRY).flatMap(([key, row]) => {
      const host = /^https?:\/\/([A-Za-z0-9.-]+)/.exec(row.upstream ?? '')?.[1];
      const owner = ENTRIES.find((entry) => entry.keys.some((pattern) => covers(pattern, key)));
      const text = Object.values(owner?.fields ?? {}).join(' ');
      return host === undefined || text.includes(host) ? [] : [`${key}: ${host}`];
    });
    expect(unnamed).toEqual([]);
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

  it('no address in the app is assembled from a variable or left without its scheme', () => {
    const hidden = SOURCE.flatMap(
      (text) =>
        text.match(
          /(?:https?|wss?):\/\/\$\{|["'`](?:https?|wss?):\/\/["'`]|["'`]\/\/[a-z0-9-]+\.[a-z]/gi,
        ) ?? [],
    );
    expect(hidden).toEqual([]);
  });
});
