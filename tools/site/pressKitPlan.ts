import type { PressKitPlan } from './@types/PressKitPlan';
import { FADE } from '../../packages/website/src/components/shared/text/Wordmark/Wordmark.constants';
import { PRESS_CREDIT } from '../../packages/website/src/data/pressPictures';

/**
 * The film is 38 to 54 s of the hero flight: in past the Milky Way's disc, out to the Local Group, the structure
 * markers and the first of the cosmic web's glow. Every pixel of its star field changes, which is what costs:
 * 1920 wide at 30 fps was 70 MB at CRF 22 and 16 MB at CRF 32; 24 fps at CRF 34 is about 10 MB and keeps the
 * stars (compared on crops). The pictures are JPEG 92 with full colour (no chroma subsampling).
 */
export const PRESS_KIT: PressKitPlan = {
  file: 'skymap-press-kit.zip',
  logoWidth: 2000,
  iconSizes: [512, 1024],
  jpegQuality: 92,
  inks: {
    light: { word: '#e8eeff', fade: FADE },
    dark: {
      word: '#0b0e17',
      fade: ['rgb(11 14 23 / 0.9)', 'rgb(40 60 100 / 0.45)', 'rgb(60 90 140 / 0)'],
    },
  },
  portrait: 'packages/website/src/assets/maker/alexander-rulkens-1000.avif',
  portraitFile: 'portrait/alexander-rulkens.jpg',
  portraitCredit: 'Photo: Alexander Rulkens',
  filmFile: 'film/skymap-flight-milky-way-to-cosmic-web.mp4',
  film: { inSec: 38, outSec: 54, width: 1920, fps: 24, crf: 34 },
  filmCredit: `${PRESS_CREDIT}. Stars: ESA/Gaia/DPAC, Hipparcos. Galaxies: SDSS, 2MRS, GLADE, DESI, Milliquas, Cosmicflows-4, HyperLEDA. Density map: Wilde et al. 2023, from SDSS. Structure markers: MCXC, MSCC and the other catalogues on the credits page`,
  short: [{ fact: 'about-what-is', sentences: [0, 1, 3] }, { fact: 'about-maker' }],
  long: [
    { fact: 'about-what-is' },
    { fact: 'dome-rig', sentences: [0] },
    { fact: 'about-licence' },
    { fact: 'about-maker' },
  ],
};
