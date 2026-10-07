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
  /** Density correction on "None — raw catalogue" in place of the app's first choice. */
  rawDensity?: true;
  /** The data size, where the picture is not of the one the window's width picks. */
  dataSize?: 'small' | 'medium' | 'large';
  /** For a `tour=` link: start at this step (0-based) instead of the first; `settleMs` is then how far into it. */
  tourStep?: number;
  /** The app's own interface in the picture: a screenshot of the page, not of the canvas alone. */
  ui?: true;
  /** With `ui`: open the app’s search and type this before the shot; an empty string leaves it on its picture cards. */
  searchFor?: string;
  /** With `ui`: headings of the app's panels to click before the shot, in order (`Settings` itself where the panel starts folded). */
  open?: readonly string[];
  /** Keep this part of the frame only, in the viewport's CSS pixels: a phone's cut of a wide interface shot. */
  crop?: { left: number; top: number; width: number; height: number };
  /** Extra time before the shot: streamed surface imagery arrives after the app reports settled. */
  settleMs?: number;
};
