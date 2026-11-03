/**
 * One part of a lesson: a teaching routine run on one thing the app does. `shot` is its picture in
 * the shot manifest and `tall` the one for upright screens; `hash` is the deep-link body its control
 * opens. `factIds` are printed as the sentences that say what the app does; `lesson` is the routine
 * and `ask` one question for the room.
 */
export type ClassFeature = {
  title: string;
  /** Who takes part and what they need, printed small above the title. */
  prep: string;
  /** Its share of a 45-minute lesson, drawn on the lesson's time bar. */
  minutes: number;
  shot: string;
  tall: string;
  hash: string;
  action: string;
  factIds: readonly string[];
  lesson: string;
  ask: string;
};
