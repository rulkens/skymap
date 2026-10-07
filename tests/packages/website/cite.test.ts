/**
 * The Cite page's references are typed by hand from each paper's record, one
 * list per entry of ATTRIBUTIONS.md, and its software citation is read from
 * CITATION.cff. What can drift: an entry that comes to name another paper or
 * is renamed, a reference with nothing to open, and a release that moves
 * package.json (the About page's version) without the citation file.
 */
import { describe, expect, it } from 'vitest';

import pkg from '../../../package.json';
import { ATTRIBUTIONS } from '../../../packages/website/src/data/attributions';
import { CITATION } from '../../../packages/website/src/data/citation';
import { CITE_REFS } from '../../../packages/website/src/data/citeRefs';
import { citationBibtex } from '../../../packages/website/src/utils/citationBibtex';
import { citationText } from '../../../packages/website/src/utils/citationText';
import { parseCff } from '../../../packages/website/src/utils/parseCff';

/** Apostrophes as one character, so "O’Neill" on the page is "O'Neill" in the record. */
const plain = (text: string) => text.replace(/’/g, "'");

describe('software citation', () => {
  it('names the release package.json names', () => {
    expect(CITATION.version).toBe(pkg.version);
  });

  it('prints the version, the year and a DOI in both forms', () => {
    for (const form of [citationText(CITATION), citationBibtex(CITATION, 'https://example.org')]) {
      expect(form).toContain(CITATION.version);
      expect(form).toContain(CITATION.released.slice(0, 4));
      expect(form).toContain(CITATION.versionDoi ?? CITATION.conceptDoi);
      expect(form).toContain(CITATION.authors[0]!.family);
    }
  });

  // A release moves `version` before Zenodo has minted its DOI: the old one must not follow it.
  it('never prints a version beside another version’s DOI', () => {
    const { versionDoi: _old, ...released } = CITATION;
    const next = { ...released, version: '99.0.0' };
    expect(citationText(next)).toContain(CITATION.conceptDoi);
    if (CITATION.versionDoi) expect(citationText(next)).not.toContain(CITATION.versionDoi);
  });
});

describe('parseCff', () => {
  const cff = (version: string, authors: string) =>
    `title: 'a thing'\nauthors:\n${authors}license: MIT\nurl: 'https://example.org'\ndoi: 10.1/concept\nidentifiers:\n  - type: doi\n    value: 10.1/v1\n    description: 'The Zenodo DOI of version 1.0.0'\nversion: ${version}\ndate-released: '2026-01-01'\n`;
  const author = '  - family-names: Doe\n    given-names: Jo\n';

  it('reads the version DOI with the version it belongs to', () => {
    expect(parseCff(cff('1.0.0', author)).versionDoi).toEqual({ doi: '10.1/v1', version: '1.0.0' });
    expect(parseCff(cff('1.1.0', author)).versionDoi?.version).toBe('1.0.0');
  });

  it('fails on an author it would otherwise drop', () => {
    expect(() =>
      parseCff(cff('1.0.0', `${author}  - given-names: Al\n    family-names: Roe\n`)),
    ).toThrow(/author/);
  });
});

describe('references for the data', () => {
  const rows = Object.entries(CITE_REFS).flatMap(([id, references]) =>
    references.map((reference) => ({ id, reference })),
  );

  it('every key names an entry of the licence record', () => {
    const ids = ATTRIBUTIONS.map((entry) => entry.id);
    expect(Object.keys(CITE_REFS).filter((id) => !ids.includes(id))).toEqual([]);
  });

  it.each(rows)(
    '$id: $reference.authors $reference.year is named by its entry',
    ({ id, reference }) => {
      const entry = ATTRIBUTIONS.find((row) => row.id === id)!;
      const named = plain(`${entry.fields.By} ${entry.fields.Attribution}`);
      const lead = plain(reference.authors.split(/, /)[0]!);
      expect(named).toContain(lead);
      // A dataset is named by its DOI where the entry gives no year for it.
      expect(named.includes(String(reference.year)) || named.includes(reference.doi ?? '\0')).toBe(
        true,
      );
    },
  );

  it.each(rows)(
    '$id: $reference.authors $reference.year can be opened and says when it was',
    ({ reference }) => {
      expect(reference.doi ?? reference.arxiv).toBeDefined();
      expect(reference.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reference.checked <= new Date().toISOString().slice(0, 10)).toBe(true);
    },
  );
});
