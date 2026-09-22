/**
 * PlannerStepSpec — a `{ kind: 'plan', name }` line in a section's program:
 * run the planner registered under `name` at this point. Plan lines lead
 * their section, and `checkFrameOrder` checks at boot that the planner's
 * scope matches the section's.
 */

export type PlannerStepSpec = {
  readonly kind: 'plan';
  readonly name: string;
};
