import type { Lesson } from './Lesson';

/** A group of lesson links under one curriculum topic. */
export type LessonTopic = {
  title: string;
  lessons: readonly Lesson[];
};
