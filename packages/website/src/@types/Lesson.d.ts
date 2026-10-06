/**
 * One ready-made lesson link. `hash` is the app deep-link body the class
 * opens; `shot` is its picture in the shot manifest, taken at that same link.
 * `sees` says what is on screen and `ask` is one question for the room;
 * `factId` names the fact row behind any number in `sees`.
 */
export type Lesson = {
  id: string;
  title: string;
  hash: string;
  shot: string;
  sees: string;
  ask: string;
  factId?: string;
};
