/**
 * What a site shot changes in the app after its link has loaded. A deep link
 * carries no settings, so each override applied to a published picture is
 * written here, where a reader of the manifest can see it.
 */
export type SiteShotSettings = {
  /** Labels, the selection ring and structure markers off. */
  hideLabels?: true;
  /** Structure names off, their rings left on. */
  hideStructureLabels?: true;
  hideOrbitTrails?: true;
  hideStructures?: true;
  /** The survey point clouds off; galaxy photographs stay. */
  hideGalaxyField?: true;
  hideCosmicWeb?: true;
  hideZoneOfAvoidance?: true;
  /** The traced filament skeleton on (off by default in the app). */
  filaments?: true;
  fovDeg?: number;
  /** For a `tour=` link: start at this step (0-based) instead of the first; `settleMs` is then how far into it. */
  tourStep?: number;
  /** The app's own interface in the picture: a screenshot of the page, not of the canvas alone. */
  ui?: true;
  /** With `ui`: open the app's search and type this before the shot. */
  searchFor?: string;
  /** Extra time before the shot: streamed surface imagery arrives after the app reports settled. */
  settleMs?: number;
};
