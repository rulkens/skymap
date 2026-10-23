/**
 * What a site shot changes in the app after its link has loaded. A deep link
 * carries no settings, so each override applied to a published picture is
 * written here, where a reader of the manifest can see it.
 */
export type SiteShotSettings = {
  /** Labels, the selection ring and structure markers off. */
  hideLabels?: true;
  /** With `hideLabels`: the planets', moons' and spacecraft's names stay on. */
  keepBodyLabels?: true;
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
  /** The constellation figures and their names on (off by default in the app). */
  constellations?: true;
  /** The galaxy flow ribbons on (off by default in the app). */
  flow?: true;
  fovDeg?: number;
  /** Density correction on "None — raw catalogue" in place of the app's first choice. */
  rawDensity?: true;
  /** The data size, where the picture is not of the one the window's width picks. */
  dataSize?: 'small' | 'medium' | 'large';
  /** For a `tour=` link: start at this step (0-based) instead of the first; `settleMs` is then how far into it. */
  tourStep?: number;
  /** The app's own interface in the picture: a screenshot of the page, not of the canvas alone. */
  ui?: true;
  /** With `ui`: the navigation and settings panels, the scale bar and the clock hidden; the top bar and the info card stay. */
  minimalUi?: true;
  /** With `ui`: open the app’s search and type this before the shot; an empty string leaves it on its picture cards. */
  searchFor?: string;
  /** With `ui`: the app's debug panel open, as the D key opens it. */
  debugPanel?: true;
  /** With `ui`: headings of the app's panels to click before the shot, in order (`Settings` itself where the panel starts folded). */
  open?: readonly string[];
  /** With `query: 'dome'`: the dome opens with `?remote`, and the picture is a phone's remote page paired to it, not the dome; `searchFor` is then typed into the remote's search, which is how its header gets the focused object's name. */
  remote?: true;
  /** Keep this part of the frame only, in the viewport's CSS pixels: a phone's cut of a wide interface shot. */
  crop?: { left: number; top: number; width: number; height: number };
  /** Extra time before the shot: streamed surface imagery arrives after the app reports settled. */
  settleMs?: number;
};
