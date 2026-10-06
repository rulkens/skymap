/**
 * One step of a critically damped follow: `value` chases `target` at angular
 * rate `omega` (per second) for `dt` seconds, carrying its `velocity`, so a
 * target that moves in steps (a mouse wheel) is followed without a jerk and
 * without overshoot. The closed-form step is stable for any `dt`.
 */
export function followDamped(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
): { value: number; velocity: number } {
  const offset = value - target;
  const push = (velocity + omega * offset) * dt;
  const decay = Math.exp(-omega * dt);
  return { value: target + (offset + push) * decay, velocity: (velocity - omega * push) * decay };
}
