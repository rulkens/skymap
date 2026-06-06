/**
 * ViewSlice — which visualization layers are toggled on.
 *
 * Two independent booleans rather than a single enum because the layers
 * composite: the flow field and the density volume can both be drawn at once
 * (or neither). The engine reads these to decide which layers' encode passes to
 * run each frame.
 */
export type ViewSlice = { readonly flowField: boolean; readonly densityVolume: boolean };
