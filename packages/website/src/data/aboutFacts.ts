import type { Fact } from '../@types/Fact';
import pkg from '../../../../package.json';
import sitePkg from '../../package.json';
import { CITATION } from './citation';
import { DATA_SOURCES } from './dataSources';
import { MAKER_NAME, REPO_BLOB, REPO_URL } from './siteIdentity';
import { formatDate } from '../utils/formatDate';

const CHECKED = '2026-10-06';
const IN_REPO = 'in the skymap repository';

/**
 * The About page's claims, spread into FACTS. The history row is a count from
 * `git log` on the main branch at the date it names: re-count and re-date it
 * together, never one without the other.
 */
export const ABOUT_FACTS: readonly Fact[] = [
  {
    id: 'about-what-is',
    text: `skymap is a free, open-source web app that draws the mapped universe in three dimensions at true scale. It places catalogued stars, galaxies and quasars where ${DATA_SOURCES.length} published sources put them, and you fly the camera from a park on Earth to the edge of the observable universe in one continuous scene. It runs in a browser with WebGPU, the graphics interface recent browsers ship, and needs no account and no installation. Every source is named, and the site says which parts are measured, which are derived and which are drawn.`,
    source: `${REPO_BLOB}/README.md`,
    sourceLabel: `the project’s README, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-maker',
    text: `skymap is made by one person, ${MAKER_NAME}: the name on the copyright line of the licence file and on the repository’s commits.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-ai',
    text: 'Parts of the code were written with AI coding assistants. The repository says so in its README and keeps its instructions to them in the open.',
    source: `${REPO_BLOB}/README.md`,
    sourceLabel: `the README’s note on AI assistance, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-licence',
    text: `The source code is open under the ${pkg.license} licence: anyone may use it, copy it, change it and pass it on, provided the copyright notice stays with it.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-version',
    text: `The current release is version ${pkg.version}, dated ${formatDate(CITATION.released)}. It is the fifth tagged release; the first is dated 5 May 2026.`,
    source: `${REPO_URL}/tags`,
    sourceLabel: 'the release tags, on GitHub',
    checked: CHECKED,
  },
  {
    id: 'about-history',
    text: 'The first commit in the repository is dated 3 May 2026. As of 5 October 2026 its main branch holds 1,550 commits.',
    source: `${REPO_URL}/commits/main`,
    sourceLabel: 'the commit history, on GitHub',
    checked: CHECKED,
  },
  {
    id: 'about-pictures',
    text: 'Every picture on this site is a render from the app. The stills are rows in a manifest that holds each one’s address and settings, and one command takes them all again from a running copy of the app. The frames of the flight on the home page are cut from a recording of the app.',
    source: `${REPO_BLOB}/tools/site/README.md`,
    sourceLabel: `how the site’s pictures are made, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-display-face',
    text: 'Headings are set in Cormorant Garamond by Christian Thalmann of Catharsis Fonts, published under the SIL Open Font Licence 1.1. It is also the face of the labels inside the app.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-text-face',
    text: 'Text is set in Jost by indestructible type*, published under the SIL Open Font Licence 1.1.',
    source: 'https://github.com/indestructible-type/Jost',
    sourceLabel: 'the Jost project, on GitHub',
    checked: CHECKED,
  },
  {
    id: 'about-fonts-hosted',
    text: 'Both typefaces are files on this site. No font service is asked for them.',
    source: `${REPO_BLOB}/packages/website/src/layouts/Base.astro`,
    sourceLabel: `the page template, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-built-with',
    text: `The site is built with Astro ${sitePkg.dependencies.astro} into static files. There is no server program behind a page and no database.`,
    source: `${REPO_BLOB}/packages/website/package.json`,
    sourceLabel: `the site’s package file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-picture-licence',
    text: `The picture files are part of the repository, so the ${pkg.license} licence covers our part of them. Imagery and data from others inside a picture keep their own terms.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'gaia-licence',
    text: 'Gaia data are published under CC BY-NC 3.0 IGO: credit ESA/Gaia/DPAC, and no commercial use without ESA’s agreement.',
    source: 'https://www.cosmos.esa.int/web/gaia-users/license',
    sourceLabel: 'ESA, the Gaia data licence',
    checked: CHECKED,
  },
];
