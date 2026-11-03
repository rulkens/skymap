import pkg from '../../../../../../package.json';
import { fact } from '../../../data/fact';
import { REPO_URL } from '../../../data/siteIdentity';

export const COLOPHON = [
  { term: 'Pictures', id: 'about-pictures' },
  { term: 'Headings', id: 'about-display-face' },
  { term: 'Text', id: 'about-text-face' },
  { term: 'Font files', id: 'about-fonts-hosted' },
  { term: 'Pages', id: 'about-built-with' },
];
// Every fact row the page states is in factIds, so the Sources list cannot drift from the copy.
export const factIds = [
  'about-what-is',
  'about-maker',
  'about-licence',
  'about-picture-reuse',
  'gaia-licence',
  ...COLOPHON.map((item) => item.id),
];
export const whatIs = fact('about-what-is').text;
/** The licence Open source names, read where `about-licence` reads it. */
export const licence = pkg.license;
export const makerProfile = REPO_URL.slice(0, REPO_URL.lastIndexOf('/'));
