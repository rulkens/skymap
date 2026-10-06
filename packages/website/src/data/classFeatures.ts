import type { ClassFeature } from '../@types/ClassFeature';
import { siteShot } from './siteShot';

// A feature's control opens where its picture was taken, so the link is read from the picture's manifest row.
const at = (shot: string, tall: string) => ({ shot, tall, hash: siteShot(shot).link });

/**
 * What a class can do with the app, the least preparation first. Only things
 * read in the code are here; constellations are absent because no link can
 * switch them on, and galaxy cards because the Andromeda card dates its light
 * to "the rise of human civilisation".
 */
export const CLASS_FEATURES: readonly ClassFeature[] = [
  {
    title: 'Watch a tour together',
    prep: 'Five minutes, nothing to prepare',
    ...at('class-tour', 'class-tour-phone'),
    action: 'Start the tour',
    factIds: ['grand-tour-steps', 'tour-length', 'tour-keys'],
    lesson: 'Put it on the projector and let it play. Nobody needs a device, and nobody needs to know the controls.',
    ask: 'The caption says Andromeda’s light has travelled for millions of years. Are we seeing the galaxy as it is today?',
  },
  {
    title: 'Explain one idea with an exhibit',
    prep: 'One idea at a time',
    ...at('class-exhibit', 'class-exhibit-phone'),
    action: 'The Solar System exhibit',
    factIds: ['exhibits', 'exhibit-notes'],
    lesson: 'Read the notes with the class. They say where the numbers come from, so a pupil can check them.',
    ask: 'The four inner orbits are crowded into the middle. What fills the rest of the picture?',
  },
  {
    title: 'Run the clock',
    prep: 'Two keys to learn',
    ...at('class-time', 'class-time-phone'),
    action: 'Jupiter and its moons',
    factIds: ['clock-speeds', 'ephemeris-span', 'clock-keys', 'io-lap'],
    lesson: 'The link opens with the clock paused. Start it, speed it up and watch the moons go round.',
    ask: 'How many times does Io go round while Europa goes round once?',
  },
  {
    title: 'Let pupils find things themselves',
    prep: 'Pupils at their own screens',
    ...at('class-search', 'class-search-phone'),
    action: 'Open this view, then press /',
    factIds: ['search-key', 'search-scope', 'search-tabs'],
    lesson: 'Give each group one object to find and one number to bring back.',
    ask: 'Which is farther from us: Betelgeuse, or the centre of the Milky Way?',
  },
  {
    title: 'Read numbers off a card',
    prep: 'Something to write down',
    ...at('class-card', 'class-card-phone'),
    action: 'Saturn and its card',
    factIds: ['card-on-click', 'body-card', 'card-tooltips'],
    lesson: 'Pupils open two planets and compare their cards line by line.',
    ask: 'Saturn has 95 times the mass of Earth. Why is its gravity about the same as ours?',
  },
];
