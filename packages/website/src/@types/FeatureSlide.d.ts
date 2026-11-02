/**
 * One view of a Features gallery. `view` is a shot id (data/siteShots.ts) or a loop id (data/siteLoops.ts)
 * for a film. `piece` is the part of the app's interface that belongs to that view (its card, the search,
 * the clock, the Settings panel), shot alone at the view's own link; `fact` names the row whose `figure`
 * is set large over it. `accent` is sampled from the view's picture (tests/packages/website/featureSlides.test.ts
 * recomputes it). `cutout` is a subject cut from black, laid over the picture and reaching past its frame.
 * `bar` marks a piece that is a strip (the clock, the search), drawn wider than a card so its line reads.
 */
export type FeatureSlide = {
  view: string;
  piece?: string;
  bar?: true;
  fact?: string;
  accent: string;
  cutout?: string;
};
