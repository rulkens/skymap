/**
 * One named landmark for the Surface Tiles fly-to shortcuts. Carries no body:
 * a preset button is exactly "type these degrees into the box and submit", so
 * it flies on whichever body the section is already reporting.
 */
export type FlyToPreset = {
  readonly label: string;
  readonly lonDeg: number;
  readonly latDeg: number;
  /** Altitude to arrive at, km. Required, unlike the action's own optional
   *  field: a button that kept the current altitude would only spin the globe
   *  when pressed from far out, which is never what a landmark shortcut means. */
  readonly altKm: number;
  /** Why this one earns a button — shown as the button's tooltip. */
  readonly title: string;
};
