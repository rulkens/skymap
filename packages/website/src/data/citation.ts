import cff from '../../../../CITATION.cff?raw';
import type { SoftwareCitation } from '../@types/SoftwareCitation';
import { parseCff } from '../utils/parseCff';

const file = parseCff(cff);

/**
 * How to cite skymap, read from CITATION.cff at the repository root when the
 * site is built, so a release changes the file and nothing here. The file's
 * DOI is the concept DOI, which follows the newest release. Its `identifiers`
 * entry is the DOI of one release; it is used only while that release is the
 * file's version, so a new version is never printed beside the old one's DOI.
 */
export const CITATION: SoftwareCitation = {
  title: file.title,
  version: file.version,
  released: file.released,
  authors: file.authors,
  conceptDoi: file.doi,
  ...(file.versionDoi?.version === file.version ? { versionDoi: file.versionDoi.doi } : {}),
};
