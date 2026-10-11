import pkg from '../../../../package.json';

/** The public repository, read from the root package.json so it is written once. */
export const REPO_URL = pkg.repository.url.replace(/\.git$/, '');
/** Prefix for links to a file in the repository, for facts whose evidence is our own code or data record. */
export const REPO_BLOB = `${REPO_URL}/blob/main`;
export const MAKER_NAME = 'Alexander Rulkens';
