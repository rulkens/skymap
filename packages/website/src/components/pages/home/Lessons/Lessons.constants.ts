import { siteShot } from '../../../../data/siteShot.ts';
import { requireShotLink } from '../../../../utils/requireShotLink.ts';

// Each question's view is its lesson's or class feature's link, the link its shot was taken at.
export const VIEWS = {
  earth: requireShotLink('lesson-earth-june'),
  jupiter: requireShotLink('class-time'),
  orion: requireShotLink('class-search'),
  andromeda: requireShotLink('lesson-andromeda'),
};
export const SCALE_LABEL = {
  title: 'Earth and Jupiter at the same scale',
  credit: `${siteShot('lessons-earth').credit}. ${siteShot('lessons-jupiter').credit}`,
};
