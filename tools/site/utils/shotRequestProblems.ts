const REQUIRED = ['requester', 'page', 'section', 'shotId', 'subject', 'why'] as const;
const STATUSES = ['open', 'done', 'declined'];

/**
 * What is wrong with a parsed shot-request file (empty when it is a valid `ShotRequest`).
 * `shotIds` are the manifest's ids: a request names one of them or `'new'`.
 */
export function shotRequestProblems(value: unknown, shotIds: readonly string[]): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['not an object'];
  const r = value as Record<string, unknown>;
  const problems = REQUIRED.filter(
    (key) => typeof r[key] !== 'string' || !(r[key] as string).trim(),
  ).map((key) => `\`${key}\` is required`);
  if (typeof r.page === 'string' && !/^\/(.*\/)?$/.test(r.page))
    problems.push('`page` is a site path such as /home-2/');
  if (typeof r.shotId === 'string' && r.shotId !== 'new' && !shotIds.includes(r.shotId))
    problems.push(`\`shotId\` "${r.shotId}" is not in the manifest (use 'new' for a new picture)`);
  if (typeof r.link === 'string' && r.link.startsWith('#'))
    problems.push('`link` is the hash body, without the #');
  if (r.link !== undefined && typeof r.link !== 'string') problems.push('`link` is a string');
  if (r.settings !== undefined && (typeof r.settings !== 'object' || r.settings === null))
    problems.push('`settings` is an object of SiteShotSettings');
  const size = r.size as { width?: unknown; height?: unknown } | undefined;
  if (
    size !== undefined &&
    ![size?.width, size?.height].every((n) => Number.isInteger(n) && (n as number) > 0)
  )
    problems.push('`size` is { width, height } in whole CSS pixels');
  if (!STATUSES.includes(r.status as string))
    problems.push(`\`status\` is one of ${STATUSES.join(', ')}`);
  const ids = r.resultIds;
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((id) => typeof id === 'string')))
    problems.push('`resultIds` is a list of shot ids');
  else if (ids !== undefined) {
    const missing = (ids as string[]).filter((id) => !shotIds.includes(id));
    if (missing.length > 0)
      problems.push(`\`resultIds\` not in the manifest: ${missing.join(', ')}`);
  }
  if (r.status === 'done' && !(Array.isArray(ids) && ids.length > 0) && !r.answer)
    problems.push('a done request names its `resultIds` or says in `answer` what was done');
  if (r.status === 'declined' && !r.answer)
    problems.push('a declined request says why in `answer`');
  return problems;
}
