import { siteShot } from '../../../../data/siteShot.ts';

// Each question's view is its lesson's or class feature's link, the link its shot was taken at.
export const VIEWS = {
  earth: siteShot('lesson-earth-june').link,
  jupiter: siteShot('class-time').link,
  orion: siteShot('class-search').link,
  andromeda: siteShot('lesson-andromeda').link,
};
export const SCALE_LABEL = {
  title: 'Earth and Jupiter at the same scale',
  credit: `${siteShot('lessons-earth').credit}. ${siteShot('lessons-jupiter').credit}`,
};
