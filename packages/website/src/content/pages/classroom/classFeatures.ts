import type { ClassFeature } from '../../../@types/ClassFeature';
import { siteShot } from '../../../data/siteShot';

// A part's control opens where its picture was taken, so the link is read from the picture's manifest row.
const at = (shot: string, tall: string) => ({ shot, tall, hash: siteShot(shot).link });

/**
 * A 45-minute lesson in four parts, in the order they are taught. Each part is a routine from
 * classroom research (docs/research/2026-09-17-companion-website/14-engaging-classroom-teaching.md):
 * notice and wonder, predict then observe, open exploration with a challenge, and how we know.
 */
export const CLASS_FEATURES: readonly ClassFeature[] = [
  {
    title: 'Notice and wonder',
    prep: 'The whole class at the projector',
    minutes: 5,
    ...at('class-tour', 'class-tour-phone'),
    action: 'Start the tour',
    factIds: ['grand-tour-steps', 'tour-keys'],
    lesson: 'Pause on any step. Ask what pupils notice, then what they wonder, and write the wonders on the board: they are the questions for the rest of the lesson.',
    ask: 'The caption says Andromeda’s light has travelled for millions of years. Are we seeing the galaxy as it is today?',
  },
  {
    title: 'Guess, then look',
    prep: 'The whole class, then pairs',
    minutes: 10,
    ...at('class-time', 'class-time-phone'),
    action: 'Jupiter and its moons',
    factIds: ['clock-keys'],
    lesson: 'Each pupil writes down a guess first. The link opens with the clock paused: start it, speed it up and count.',
    ask: 'How many times does Io go round while Europa goes round once?',
  },
  {
    title: 'Find it yourselves',
    prep: 'Pairs, each at a screen',
    minutes: 20,
    ...at('class-search', 'class-search-phone'),
    action: 'Open this view',
    factIds: ['search-key'],
    lesson: 'Give each pair the question and no instructions. They find both objects, decide, and say how they know.',
    ask: 'Which is farther from us: Betelgeuse, or the centre of the Milky Way?',
  },
  {
    title: 'Ask how we know',
    prep: 'The whole class at the projector',
    minutes: 10,
    ...at('class-exhibit', 'class-exhibit-phone'),
    action: 'The Solar System exhibit',
    factIds: ['exhibit-notes'],
    lesson: 'Read the notes together. For each thing on screen, pupils decide whether it is measured, derived or drawn.',
    ask: 'The orbits are lines on the screen. Did a telescope see them, or were they worked out?',
  },
];
