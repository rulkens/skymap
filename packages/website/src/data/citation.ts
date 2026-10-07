import cff from '../../../../CITATION.cff?raw';
import type { SoftwareCitation } from '../@types/SoftwareCitation';
import { parseCff } from '../utils/parseCff';

const file = parseCff(cff);

/**
 * How to cite skymap, read from CITATION.cff at the repository root when the
 * site is built, so a release changes the file and nothing here. The file's
 * DOI is the concept DOI, which follows the newest release. The version DOI
 * is the one release the file names, as Zenodo shows it: the file does not
 * carry it, so it is written here and changes with each release.
 */
export const CITATION: SoftwareCitation = {
  title: file.title,
  version: file.version,
  released: file.released,
  authors: file.authors,
  conceptDoi: file.doi,
  versionDoi: '10.5281/zenodo.22209203',
};
