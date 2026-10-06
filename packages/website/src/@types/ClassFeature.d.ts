/**
 * One thing a class can do with the app. `shot` is its picture in the shot
 * manifest and `tall` the one for upright screens; `hash` is the deep-link body
 * its control opens. `factIds` are printed as the sentences that say what it
 * is; `lesson` is the classroom moment and `ask` one question for the room.
 */
export type ClassFeature = {
  title: string;
  /** How much of a lesson it takes, printed small above the title. */
  prep: string;
  shot: string;
  tall: string;
  hash: string;
  action: string;
  factIds: readonly string[];
  lesson: string;
  ask: string;
};
