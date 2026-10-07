import { parseAttributionUses } from '../../../../tools/utils/io/parseAttributionUses';
import { parseAttributions } from '../../../../tools/utils/io/parseAttributions';
import { RAW_DATA, type RawDataEntry } from '../../../../tools/utils/io/rawDataRegistry';
import type { DataEntry } from '../@types/DataEntry';
import type { DataFamily } from '../@types/DataFamily';
import type { DataPage } from '../@types/DataPage';
import { attributionsMarkdown } from '../utils/attributionsMarkdown';
import { plainText } from '../utils/plainText';
import { shortTitle } from '../utils/shortTitle';
import { DATA_FAMILIES } from './dataFamilies';
import { DATA_SOURCE_NOTES } from './dataSourceNotes';

const ROOT = '/docs/data/';
const REGISTRY: Readonly<Record<string, RawDataEntry>> = RAW_DATA;

const markdown = attributionsMarkdown();
const records = parseAttributions(markdown);

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function familyOf(id: string, section: string, families: readonly DataFamily[]): DataFamily {
  return (
    families.find((family) => family.ids.includes(id)) ??
    families.find((family) => family.sections.includes(section)) ?? {
      id: slug(section),
      name: section,
      about: '',
      pages: 'each',
      sections: [section],
      ids: [],
    }
  );
}

/**
 * The data pages, made when the site is built from `ATTRIBUTIONS.md`, the raw
 * data registry and the family table: no licence, credit line or address of a
 * source is written in the site. A new entry of the record becomes a row of
 * the index and a page (or a section of its family's page) with no edit here.
 * This module reads files, so it is for pages and build tools only.
 */
export const DATA_USES = parseAttributionUses(markdown);

export const DATA_ENTRIES: readonly DataEntry[] = records.map((record) => {
  const family = familyOf(record.id, record.section, DATA_FAMILIES);
  const path = `${ROOT}${family.pages === 'one' ? family.id : record.id}/`;
  const note = DATA_SOURCE_NOTES[record.id];
  return {
    id: record.id,
    title: note?.title ?? shortTitle(record.heading),
    description: note?.description ?? plainText(record.bullets.What ?? ''),
    family: family.id,
    path,
    href: family.pages === 'one' ? `${path}#${record.id}` : path,
    record,
    files: Object.entries(REGISTRY)
      .filter(([key]) =>
        record.keys.some((pattern) => (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : pattern === key)),
      )
      .map(([key, file]) => ({ key, path: file.path, kept: file.source, fetcher: file.fetcher })),
  };
});

/** Every family that has an entry, the table's first and then any the record's own sections add. */
export const DATA_FAMILIES_USED: readonly DataFamily[] = [
  ...DATA_FAMILIES,
  ...records
    .map((record) => familyOf(record.id, record.section, DATA_FAMILIES))
    .filter((family, i, all) => !DATA_FAMILIES.includes(family) && all.findIndex((f) => f.id === family.id) === i),
].filter((family) => DATA_ENTRIES.some((entry) => entry.family === family.id));

export const DATA_PAGES: readonly DataPage[] = DATA_FAMILIES_USED.flatMap((family): DataPage[] => {
  const entries = DATA_ENTRIES.filter((entry) => entry.family === family.id);
  if (family.pages === 'one')
    return [
      {
        slug: family.id,
        path: `${ROOT}${family.id}/`,
        title: family.name,
        description: family.about,
        family,
        entries,
      },
    ];
  return entries.map((entry) => ({
    slug: entry.id,
    path: entry.path,
    title: entry.title,
    description: entry.description,
    family,
    entries: [entry],
  }));
});

/** Where one entry is printed, by its id in `ATTRIBUTIONS.md`: its own page, or its section of its family's page. */
export function dataEntry(id: string): DataEntry {
  const entry = DATA_ENTRIES.find((row) => row.id === id);
  if (!entry) throw new Error(`No entry "${id}" in ATTRIBUTIONS.md`);
  return entry;
}
