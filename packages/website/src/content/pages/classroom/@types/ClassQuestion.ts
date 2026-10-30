/**
 * One ready-made question on the Classroom page. `shot` names a lesson of data/lessons.ts, whose
 * link, picture and topic it reuses; `ask` is the page's own wording, put to the class. `accent` is
 * a colour taken from the picture, and `factId` a real figure printed beside it.
 */
export type ClassQuestion = {
  shot: string;
  ask: string;
  accent: string;
  factId?: string;
};
