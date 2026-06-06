/**
 * LabelsSlice — whether on-screen text labels are drawn.
 *
 * A single boolean today, kept as its own slice so labels can grow their own
 * tunables (font scale, density) later without reshaping the rest of AppState.
 */
export type LabelsSlice = { readonly enabled: boolean };
