import type { ClassQuestion } from './@types/ClassQuestion';
import { fact } from '../../../data/fact';

/** A fact's short form where it has one, else its text. */
export const says = (id: string): string => fact(id).short ?? fact(id).text;

/** Colours sampled from the renders a section is built on, for the lines, rings and names drawn over them. */
export const ACCENTS = { earth: '#8fb6ff', jupiter: '#dcb68a' } as const;

/**
 * The ready-made questions, in the order of data/lessons.ts's topics. Each is answered by opening
 * its link and looking, never by reading a figure off a card. The accents are sampled from the
 * pictures, so a question takes the colour of what it shows.
 */
export const CLASS_QUESTIONS: readonly ClassQuestion[] = [
  {
    shot: 'lesson-solar-system',
    ask: 'How many times wider is Neptune’s orbit than Mercury’s?',
    accent: '#d9c27a',
  },
  {
    shot: 'lesson-voyager',
    ask: 'A radio message leaves for Voyager 1 as the lesson starts. Will it arrive before the bell?',
    accent: '#c9d3e6',
    factId: 'voyager1-light-day',
  },
  {
    shot: 'lesson-earth-june',
    ask: 'On 21 June, can you see the North Pole? What does that mean for a day there?',
    accent: '#8fb6ff',
  },
  {
    shot: 'lesson-earth-december',
    ask: 'On 21 December, which pole can you see? What does that do to a day where you live?',
    accent: '#8fb6ff',
  },
  {
    shot: 'lesson-milky-way',
    ask: 'Nobody has taken this picture. How could we know the shape of a galaxy we are inside?',
    accent: '#e8d6b0',
  },
  {
    shot: 'lesson-andromeda',
    ask: 'This light left Andromeda 2.5 million years ago. Had our species appeared yet?',
    accent: '#e8a774',
    factId: 'andromeda-distance',
  },
  {
    shot: 'lesson-cosmic-web',
    ask: 'Some dark gaps hold few galaxies; others are sky the survey missed. How could you tell them apart?',
    accent: '#c58cf0',
  },
  {
    shot: 'lesson-universe',
    ask: 'The mapped part has two fans. What on the sky stops a survey from seeing in between?',
    accent: '#a8c8ff',
  },
];
