import type { LessonTopic } from '../@types/LessonTopic';
import { siteShot } from './siteShot';

// A lesson opens exactly where its picture was taken, so the link is read from the picture's manifest row.
const at = (shot: string) => ({ shot, hash: siteShot(shot).link });

/**
 * The ready-made lesson links on the classroom page, by topic. Each link is
 * parsed by the app's own parser in tests/packages/website/lessons.test.ts.
 * Moon phases and eclipses are absent on purpose: a link fixes the camera
 * against the stars, not on the ground, so it cannot show the Moon as it
 * looks from Earth.
 */
export const LESSON_TOPICS: readonly LessonTopic[] = [
  {
    id: 'solar-system',
    title: 'The scale of the solar system',
    lessons: [
      {
        id: 'orbits',
        title: 'The planets’ orbits from above',
        ...at('lesson-solar-system'),
        ask: 'Mercury’s orbit is the innermost ring and Neptune’s the outermost. How many times wider is Neptune’s?',
      },
      {
        id: 'voyager',
        title: 'Voyager 1, the farthest thing we have sent',
        ...at('lesson-voyager'),
        ask: 'Radio signals travel at the speed of light. How long does an instruction take to arrive?',
      },
    ],
  },
  {
    id: 'seasons',
    title: 'Day, night and the seasons',
    lessons: [
      {
        id: 'june',
        title: 'Earth on 21 June',
        ...at('lesson-earth-june'),
        ask: 'Can you see the North Pole? What does that mean for the length of a day there?',
      },
      {
        id: 'december',
        title: 'Earth on 21 December',
        ...at('lesson-earth-december'),
        ask: 'Which pole can you see now? What does that do to a December day where you live?',
      },
    ],
  },
  {
    id: 'milky-way',
    title: 'The Milky Way and our place in it',
    lessons: [
      {
        id: 'milky-way',
        title: 'Our galaxy from outside',
        ...at('lesson-milky-way'),
        ask: 'Nobody has taken this picture. How could we know the shape of a galaxy we are inside?',
      },
    ],
  },
  {
    id: 'nearest-galaxies',
    title: 'The nearest galaxies',
    lessons: [
      {
        id: 'andromeda',
        title: 'Andromeda, the nearest large galaxy',
        ...at('lesson-andromeda'),
        ask: 'The light in this photograph left Andromeda 2.5 million years ago. Had our species appeared yet?',
        factId: 'andromeda-distance',
      },
    ],
  },
  {
    id: 'large-scale',
    title: 'Large-scale structure',
    lessons: [
      {
        id: 'cosmic-web',
        title: 'The cosmic web',
        ...at('lesson-cosmic-web'),
        ask: 'Some dark gaps are voids with very few galaxies; others are sky the survey did not cover. How could you tell them apart?',
      },
      {
        id: 'universe',
        title: 'Everything we have mapped',
        ...at('lesson-universe'),
        ask: 'The mapped part has two fans. What on the sky stops a survey from seeing in between?',
      },
    ],
  },
];
