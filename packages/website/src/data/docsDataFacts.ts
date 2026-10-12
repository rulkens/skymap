import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-07';
const IN_REPO = 'in the skymap repository';

/**
 * What the pipeline page of the docs says the build does, spread into FACTS.
 * Each number was read in the file its row cites on the check date. A row
 * about what the map shows or leaves out (a cut, a placement) is a science
 * row and is listed in the page's sources; a row about files, formats and
 * loading is marked as being about the app. What the Science page already
 * states is cited from scienceFacts.ts, not said again here.
 */
export const DOCS_DATA_FACTS: readonly Fact[] = [
  {
    id: 'pipe-galaxy-caps',
    text: 'GLADE is cut to its 256,000 most luminous galaxies at the smallest data size and 400,000 at the middle one, and the quasars of Milliquas to 60,000 and 200,000. The largest size keeps every row of both. 2MRS and the three DESI regions are never cut. For SDSS and GLADE every galaxy that appears brighter than magnitude 15 is kept as well, whatever its luminosity, so the nearby faint galaxies stay in the map.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/sources`,
    sourceLabel: `the catalogue definitions, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-blueshift',
    text: 'A nearby galaxy that moves towards us has a negative redshift, which gives no distance. If none of the three distance lists has it, we place it in its true direction at its speed divided by the Hubble constant.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-star-budgets',
    text: 'The star file of each data size is cut to fit a compressed download of 10, 30 or 75 megabytes: stars are dropped from the faintest up until the file fits. The faint stars that come only from the Gaia Catalogue of Nearby Stars are kept however faint. They are thinned from 70 parsecs outwards, more of them the farther out, and gone at 100, so that the neighbourhood of the Sun fades out gradually. Which ones go is fixed by each star’s Gaia number, so every build drops the same stars.',
    source: `${REPO_BLOB}/tools/stars/buildStars.ts`,
    sourceLabel: `the star build, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-sdss-query',
    about: 'app',
    text: 'Our SDSS query matches about 970,000 spectra. SkyServer’s interactive search page returns at most 500,000 rows and says nothing when it stops, and the rows it drops follow the order of the survey’s plates: one pull made that way left a hole in the map through the bridge of galaxies by the Coma cluster. We run the query in CasJobs, which has no such limit.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-galaxy-format',
    about: 'app',
    text: 'A galaxy file is a 16-byte header and then 64 bytes for each galaxy: its position, brightness, shape, stellar mass and the redshift its catalogue published. The header carries a version number, and the app refuses a file of another version with a message that says to build it again.',
    source: `${REPO_BLOB}/src/data/galaxyCatalog/galaxyCatalogFormat.ts`,
    sourceLabel: `the galaxy file format, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-manifest',
    about: 'app',
    text: 'Every data file the build tracks carries the first 8 characters of a hash of its own bytes in its name, and one list, the manifest, maps each plain name to the hashed one. Pictures and the surface tiles are outside it and keep plain names. The manifest is written last, after every file it names, and the app fetches it first, uncached, so a page load never pairs a new file with an old one.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-draw',
    about: 'app',
    text: 'The bytes of a galaxy file go to the graphics processor almost as they are: 56 bytes a galaxy, with the values that never change, such as its tilt and its luminosity, computed once on arrival. Each galaxy is then one small triangle that always faces the camera, of which only the dot inside it is coloured, and the program that colours it runs on the graphics processor for every frame.',
    source: `${REPO_BLOB}/docs/RENDERER.md`,
    sourceLabel: `the renderer notes, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'pipe-earth-tiles',
    about: 'app',
    text: 'Earth’s surface is cut into square tiles of 512 pixels at 17 levels of detail, each level twice as fine as the one before. Blue Marble fills levels 3 to 7 over the whole globe, EOxCloudless levels 8 to 13 in chosen regions, and the GeoDanmark orthophoto levels 14 to 19 over one park. A second set of tiles on the same grid holds heights.',
    source: `${REPO_BLOB}/docs/DATA.md`,
    sourceLabel: `the data pipeline notes, ${IN_REPO}`,
    checked: CHECKED,
  },
];
