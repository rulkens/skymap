/** One row per panel that may cover the view; each owner claims and clears its own. */
export type CoverId =
  | 'phoneBottom'
  | 'exhibitNotes'
  | 'exhibitCaption'
  | 'leftStack'
  | 'infoCard'
  | 'timeBar'
  | 'scaleBar'
  | 'topBar';
