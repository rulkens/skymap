import type { Plan } from './Plan';

export type PlanResult =
  | { readonly ok: true; readonly plan: Plan }
  | { readonly ok: false; readonly refusals: readonly string[] };
