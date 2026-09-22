/**
 * PlannerStepSpec — one `FRAME_ORDER` line that runs a `FrameContentPlanner` by name.
 * Carries no `scope` of its own: `checkFrameOrder` reads it off the named
 * planner and compares it to the line's own section (`FrameSection.scope`).
 */

export type PlannerStepSpec = {
  readonly kind: 'plan';
  readonly name: string;
};
