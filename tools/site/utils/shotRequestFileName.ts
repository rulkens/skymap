const slug = (text: string, max: number) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '');

/**
 * `<timestamp>-<requester>-<slug>.json` for a shot request made at `at`: the UTC time to the second
 * first, so a listing sorts oldest first.
 */
export function shotRequestFileName(at: Date, requester: string, subject: string): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[-:]/g, '');
  return `${stamp}-${slug(requester, 24) || 'anon'}-${slug(subject, 40) || 'shot'}.json`;
}
