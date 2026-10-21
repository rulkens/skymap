/** True for a non-null, non-array object: the one shape a parser may read named fields from. */
export function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}
