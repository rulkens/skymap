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
        sees: 'The orbits of the planets as rings around the Sun, with the inner four packed into the middle.',
        ask: 'Compare the innermost ring with the outermost. How many times wider is it?',
      },
      {
        id: 'voyager',
        title: 'Voyager 1, the farthest thing we have sent',
        ...at('lesson-voyager'),
        sees: 'The spacecraft itself, about one light-day from Earth. Zoom out from here to find the Sun.',
        ask: 'Radio signals travel at the speed of light. How long does an instruction take to arrive?',
        factId: 'voyager1-light-day',
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
        sees: 'Earth from its sunlit side at noon in Greenwich. Europe and the Arctic are tipped towards the camera.',
        ask: 'Can you see the North Pole? What does that mean for the length of a day there?',
      },
      {
        id: 'december',
        title: 'Earth on 21 December',
        ...at('lesson-earth-december'),
        sees: 'The same view six months later. Now the southern oceans face the camera and Antarctica is in the light.',
        ask: 'Which pole can you see now? What does that do to a winter day in Copenhagen?',
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
        sees: 'The Milky Way from above, with a label where the Sun is: about 26,700 light-years from the centre.',
        ask: 'Nobody has taken this picture. How could we know the shape of a galaxy we are inside?',
        factId: 'sgr-a-distance',
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
        sees: 'Andromeda at its catalogued distance of about 2.5 million light-years. Zoom out to find the Milky Way.',
        ask: 'The light in this photograph left Andromeda 2.5 million years ago. Who was on Earth to see it leave?',
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
        sees: 'Threads and knots of matter, computed from the positions of galaxies in the Sloan Digital Sky Survey (SDSS).',
        ask: 'Galaxies sit on the threads and in the knots. What is in the dark gaps between them?',
        factId: 'cosmic-web-map',
      },
      {
        id: 'universe',
        title: 'Everything we have mapped',
        ...at('lesson-universe'),
        sees: 'A sphere marking the edge of the observable universe, with every catalogued galaxy as the small cloud inside it.',
        ask: 'Why is the mapped part so small, and why does it have two lobes?',
        factId: 'observable-edge',
      },
    ],
  },
];
