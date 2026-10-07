import type { CffCitation } from '../@types/CffCitation';

/**
 * Reads the keys the site prints out of a CITATION.cff: one-line scalars and
 * the authors' names. The file is YAML, and this is not a YAML parser; a key
 * it cannot find throws, so a file reshaped past what it reads fails the build
 * and never prints an empty citation.
 */
export function parseCff(cff: string): CffCitation {
  const scalar = (key: string): string => {
    const value = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(cff)?.[1]?.trim();
    if (!value) throw new Error(`CITATION.cff: no "${key}"`);
    return value.replace(/^(['"])(.*)\1$/, '$2');
  };
  const authors = [...cff.matchAll(/^\s+- family-names:\s*(.+)\n\s+given-names:\s*(.+)$/gm)].map(
    ([, family = '', given = '']) => ({ family: family.trim(), given: given.trim() }),
  );
  // An author written in another key order would be dropped; fail and say so.
  if (
    authors.length === 0 ||
    authors.length !== (cff.match(/^\s+(?:- )?family-names:/gm) ?? []).length
  )
    throw new Error('CITATION.cff: an author is not "family-names" then "given-names"');
  const [, versionDoi, versionOfDoi] =
    /^\s+- type: doi\n\s+value:\s*(\S+)\n\s+description:.*?version (\d+\.\d+\.\d+)/m.exec(cff) ??
    [];
  return {
    title: scalar('title'),
    version: scalar('version'),
    released: scalar('date-released'),
    doi: scalar('doi'),
    ...(versionDoi && versionOfDoi
      ? { versionDoi: { doi: versionDoi, version: versionOfDoi } }
      : {}),
    url: scalar('url'),
    licence: scalar('license'),
    authors,
  };
}
