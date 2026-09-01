/**
 * AnchorPointBody — a scene body that is positioned, named and selectable.
 * Today it draws only its caption; a future anchor may also draw a far-field
 * glint and, inside its lensing band, a geodesic pass — both via dedicated
 * `ContentLayer` rows keyed on its id, never via the flat/textured/glint
 * partition planets use.
 *
 * Identity fields only, so a record cannot carry photometry or a texture it has
 * no renderer for. That is the difference from `StarBody`, whose `absMag` /
 * `color` exist to feed the star layers — filling those in for a body no layer
 * draws would be an invented measurement, and the next reader would trust it.
 *
 * `radiusM` is the body's real physical scale (for Sgr A*, the Schwarzschild
 * radius) rather than a draw size: the caption sizes its em from it and the
 * InfoCard prints it.
 */

export type AnchorPointBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number;
};
