/** A "place to start" card: `hash` is the app deep-link body, `factId` the optional facts.ts row for the one number shown. */
export type Place = {
  id: string;
  name: string;
  factId?: string;
  image: string;
  hash: string;
};
