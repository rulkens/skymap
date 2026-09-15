/**
 * computeTimingSlotName — a compute step's GPU-timing slot AND DebugPanel
 * toggle key, which are one string by design: `executeFrame` reads the toggle
 * under the same name it bills.
 *
 * The suffix is not decoration. A compute step's name is free to collide with a
 * content pass's — `'flow'` is both the particle integrator and the ribbon that
 * draws its output — and an undecorated key would make `buildTimingSlotMap`
 * throw on the duplicate, and one toggle silently disable both.
 *
 * A plain `-compute` suffix rather than the `·` the render slots use: those
 * separate a pass from the ROW it drew in, where this just distinguishes two
 * kinds of work under one name, and the panel is read on a phone.
 */

export function computeTimingSlotName(stepName: string): string {
  return `${stepName}-compute`;
}
