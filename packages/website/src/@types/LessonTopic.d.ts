import type { Lesson } from './Lesson';

/** A group of lesson links under one curriculum topic. */
export type LessonTopic = {
  id: string;
  title: string;
  lessons: readonly Lesson[];
};
