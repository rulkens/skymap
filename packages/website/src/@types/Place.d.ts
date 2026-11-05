/**
 * A "place to start" card: `hash` is the app deep-link body; the line under the name is the `short` of the
 * facts.ts row `factId`, or `note` where no number applies; `shot` names its thumbnail in the shot manifest
 * and `loop` its film in the loop manifest (siteLoops.ts), which starts on that thumbnail.
 */
export type Place = {
  id: string;
  name: string;
  factId?: string;
  note?: string;
  shot: string;
  loop?: string;
  hash: string;
};
