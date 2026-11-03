import { CLASS_QUESTIONS } from '../../../../content/pages/classroom/classroom.data.ts';
import { LESSON_TOPICS } from '../../../../content/pages/classroom/lessons.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

export const ROWS = CLASS_QUESTIONS.map((question) => {
  const topic = LESSON_TOPICS.find((t) => t.lessons.some((l) => l.shot === question.shot))!;
  const lesson = topic.lessons.find((l) => l.shot === question.shot)!;
  return { ...question, topic: topic.title, lesson };
});
export const VIEWER_SIZES = narrowSizes('0px', 'min(calc(42vw - 4rem), 32rem)');
