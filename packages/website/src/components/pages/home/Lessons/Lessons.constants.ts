import { siteShot } from '../../../../data/siteShot.ts';

// Each question's view is its lesson's or class feature's link, the link its shot was taken at.
export const EARTH = {
  ask: 'Can you see the North Pole on 21 June?',
  line: 'Earth as the Sun lit it that day. Ask what it means for the length of a day there.',
  hash: siteShot('lesson-earth-june').link,
  action: 'Earth on 21 June',
};
export const JUPITER = {
  ask: 'How many times does Io go round while Europa goes round once?',
  line: 'Jupiter with the clock paused. Start it, speed it up and count.',
  hash: siteShot('class-time').link,
  action: 'Jupiter and its moons',
};
export const ORION = {
  ask: 'Which is farther away: Betelgeuse, or the centre of the Milky Way?',
  line: 'Orion and the stars around it. Pupils search for both and compare.',
  hash: siteShot('class-search').link,
  action: 'Orion and its neighbours',
};
export const ANDROMEDA = {
  ask: 'Had our species appeared when this light left Andromeda?',
  line: 'A photograph of Andromeda at its catalogued place. The light left 2.5 million years ago.',
  hash: siteShot('lesson-andromeda').link,
  action: 'Andromeda, the nearest large galaxy',
};
export const SCALE_LABEL = {
  title: 'Earth and Jupiter at the same scale',
  credit: `${siteShot('lessons-earth').credit}. ${siteShot('lessons-jupiter').credit}`,
};
