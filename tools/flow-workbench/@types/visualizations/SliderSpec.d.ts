/**
 * SliderSpec — the single declarative description of one tunable parameter.
 *
 * Why this exists: cosmic-flow's UI is data-driven. Rather than each
 * visualization hand-rolling its own React controls (and drifting in label
 * style, clamping, and number formatting), every layer exposes a flat list
 * of these specs via `Visualization.paramSpecs`. The control panel reads
 * that list and builds the sliders generically — one code path renders the
 * controls for *every* layer, present and future.
 *
 * This keeps the contract narrow on purpose. A SliderSpec carries only what
 * the UI needs to draw a slider and report its value back as a number: an
 * `id` (the key the value is written under in `FrameContext.params`), a
 * human `label`, the numeric range + `step`, and an optional `format` so a
 * raw slider value can be shown as, say, "12.5 Mpc/h" instead of "12.5".
 * The visualization owns interpreting the value; the UI owns presenting it.
 *
 * Everything is `readonly` because a spec is a static description authored
 * once at module scope — there's no reason for it to mutate at runtime, and
 * freezing the shape lets the UI treat the array as a stable source of truth.
 */
export type SliderSpec = {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format?: (v: number) => string;
};
