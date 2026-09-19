/**
 * PaletteAction — what a palette row or card asks the container to do on
 * selection, discriminated on `kind`. PR3 adds the `view` and `tour` variants.
 */

export type PaletteAction = { kind: 'focus'; focusId: string };
