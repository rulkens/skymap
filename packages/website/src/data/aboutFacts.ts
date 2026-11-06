import type { Fact } from '../@types/Fact';
import pkg from '../../../../package.json';
import sitePkg from '../../package.json';
import { MAKER_NAME, REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-06';
const IN_REPO = 'in the Skymap repository';

/** The About page's claims, spread into FACTS. */
export const ABOUT_FACTS: readonly Fact[] = [
  {
    id: 'about-what-is',
    about: 'app',
    text: 'Skymap is a free, open-source web app that draws the mapped universe in three dimensions at true scale. Catalogued stars, galaxies and quasars sit where published surveys put them. You fly the camera from a park in Copenhagen to the edge of the observable universe in one continuous scene. It runs in a current browser, with no account and nothing to install. The sources are named, and the site says which parts are measured, which are derived and which are drawn.',
    source: `${REPO_BLOB}/README.md`,
    sourceLabel: `the project’s README, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-maker',
    about: 'app',
    text: `Skymap is made by one person, ${MAKER_NAME}.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-ai',
    about: 'app',
    text: 'Parts of the code were written with AI coding assistants. The repository says so in its README and keeps its instructions to them in the open.',
    source: `${REPO_BLOB}/README.md`,
    sourceLabel: `the README’s note on AI assistance, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-licence',
    about: 'app',
    text: `The source code is open under the ${pkg.license} licence: anyone may use it, copy it, change it and pass it on, provided the copyright notice stays with it.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-pictures',
    about: 'app',
    text: 'Every picture of the universe on this site is a render from the app. The stills are rows in a manifest that holds each one’s address and settings, and one command takes them all again from a running copy of the app. The frames of the flight on the home page are cut from a recording of the app. The pictures on the Developer workbenches page are screenshots of those tools.',
    source: `${REPO_BLOB}/tools/site/README.md`,
    sourceLabel: `how the site’s pictures are made, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-display-face',
    about: 'app',
    text: 'Headings are set in Cormorant Garamond by Christian Thalmann of Catharsis Fonts, published under the SIL Open Font Licence 1.1. It is also the face of the labels inside the app.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-text-face',
    about: 'app',
    text: 'Text is set in Jost by indestructible type*, published under the SIL Open Font Licence 1.1.',
    source: 'https://github.com/indestructible-type/Jost',
    sourceLabel: 'the Jost project, on GitHub',
    checked: CHECKED,
  },
  {
    id: 'about-fonts-hosted',
    about: 'app',
    text: 'Both typefaces are served as files from this site.',
    source: `${REPO_BLOB}/packages/website/src/layouts/Base.astro`,
    sourceLabel: `the page template, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-built-with',
    about: 'app',
    text: `The site is built with Astro ${sitePkg.dependencies.astro} into static files. There is no server program behind a page and no database.`,
    source: `${REPO_BLOB}/packages/website/package.json`,
    sourceLabel: `the site’s package file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-picture-licence',
    about: 'app',
    text: `The picture files are part of the repository, so the ${pkg.license} licence covers our part of them. Imagery and data from others inside a picture keep their own terms.`,
    source: `${REPO_BLOB}/LICENSE`,
    sourceLabel: `the licence file, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'about-picture-reuse',
    about: 'app',
    text: 'No picture made with Skymap is offered for unrestricted reuse today. Every frame with stars carries Gaia data, which is licensed for non-commercial use, and most pictures hold a source that states no licence at all. So ask us before you reuse one, and we will tell you whose terms apply and whom to ask.',
    source: `${REPO_BLOB}/ATTRIBUTIONS.md`,
    sourceLabel: `the attributions file, ${IN_REPO}`,
    checked: '2026-10-07',
  },
  {
    id: 'gaia-licence',
    text: 'Gaia data are distributed under CC BY-NC 3.0 IGO, a non-commercial licence: credit ESA/Gaia/DPAC. For commercial use, ESA’s licence page points to its terms and conditions for the science archives, which ask for a request to ESA before any use that brings a financial gain, directly or indirectly.',
    source: 'https://www.cosmos.esa.int/web/gaia-users/license',
    sourceLabel: 'ESA, the Gaia data licence',
    checked: '2026-10-07',
  },
];
