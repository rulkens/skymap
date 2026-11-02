import pkg from '../../../../../../package.json';
import { HISTORY } from '../../../data/aboutFacts';
import { fact } from '../../../data/fact';
import { REPO_URL } from '../../../data/siteIdentity';

// Each value is the figure its fact row's sentence states, read from the same source.
export const ALIVE = [
  { term: 'Licence', value: pkg.license, id: 'about-licence' },
  { term: 'Version', value: pkg.version, id: 'about-version' },
  { term: 'Commits', value: HISTORY.commits.toLocaleString('en-GB'), id: 'about-history' },
];
// The two typefaces' facts are printed by Specimens, beside their names set in themselves.
export const COLOPHON = [
  { term: 'Pictures', id: 'about-pictures' },
  { term: 'Font files', id: 'about-fonts-hosted' },
  { term: 'Pages', id: 'about-built-with' },
];
// Every fact row the page prints is in factIds, so the Sources list cannot drift from the copy.
export const factIds = [
  'about-what-is',
  'about-maker',
  'about-ai',
  ...ALIVE.map((item) => item.id),
  'about-picture-licence',
  'about-picture-reuse',
  'gaia-licence',
  'about-display-face',
  'about-text-face',
  ...COLOPHON.map((item) => item.id),
];
export const whatIs = fact('about-what-is').text;
export const makerProfile = REPO_URL.slice(0, REPO_URL.lastIndexOf('/'));
