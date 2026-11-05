/**
 * SectionScope — where a `FrameSection`, a `ContentCompute`, or a
 * `FrameContentPlanner` runs: `'once'` against the frame's main context, or
 * `'perView'` once per the rig's view. Lifted out of `FrameSection` so all
 * three can share one literal union instead of three copies drifting apart.
 */

export type SectionScope = 'once' | 'perView';
