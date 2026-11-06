import { siteShot } from '../../../../data/siteShot.ts';
import { shotLink } from '../../../../utils/shotLink.ts';

// Each question's view is its lesson's or class feature's link, the link its shot was taken at.
export const VIEWS = {
  earth: shotLink('lesson-earth-june'),
  jupiter: shotLink('class-time'),
  orion: shotLink('class-search'),
  andromeda: shotLink('lesson-andromeda'),
};
export const SCALE_LABEL = {
  title: 'Earth and Jupiter at the same scale',
  credit: `${siteShot('lessons-earth').credit}. ${siteShot('lessons-jupiter').credit}`,
};
