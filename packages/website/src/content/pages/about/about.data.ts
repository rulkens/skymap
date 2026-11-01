import { fact } from '../../../data/fact';
import { REPO_URL } from '../../../data/siteIdentity';

export const ALIVE = [
  { term: 'Licence', id: 'about-licence' },
  { term: 'Version', id: 'about-version' },
  { term: 'History', id: 'about-history' },
];
export const COLOPHON = [
  { term: 'Pictures', id: 'about-pictures' },
  { term: 'Headings', id: 'about-display-face' },
  { term: 'Text', id: 'about-text-face' },
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
  ...COLOPHON.map((item) => item.id),
];
export const whatIs = fact('about-what-is').text;
export const makerProfile = REPO_URL.slice(0, REPO_URL.lastIndexOf('/'));
