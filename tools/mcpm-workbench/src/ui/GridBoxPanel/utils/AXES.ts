// Literal-typed axis index (not a `.map` callback index, which noUncheckedIndexedAccess
// would widen to `number` and turn every `vec[axis]` read into `number | undefined`).
export const AXES: readonly { readonly axis: 0 | 1 | 2; readonly label: 'x' | 'y' | 'z' }[] = [
  { axis: 0, label: 'x' },
  { axis: 1, label: 'y' },
  { axis: 2, label: 'z' },
];
