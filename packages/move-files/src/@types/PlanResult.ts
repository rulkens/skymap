import type { MovePlan } from './MovePlan';
import type { Refusal } from './Refusal';

export type PlanResult =
  | { readonly ok: true; readonly plan: MovePlan }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };
