/**
 * parseFiniteNumbers — parse each field as a number, failing the whole batch
 * if any is empty or non-finite. `Number('')` is 0, not NaN, so an empty
 * field is mapped to NaN explicitly rather than silently passing as zero.
 */
export function parseFiniteNumbers(fields: readonly string[]): readonly number[] | null {
  const out = fields.map((f) => (f === '' ? NaN : Number(f)));
  return out.every(Number.isFinite) ? out : null;
}
