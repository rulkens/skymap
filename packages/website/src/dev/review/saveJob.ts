const ROUTE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}__job`;

/** Writes a page's job into its job file (a landing page's structure file, a docs page's front matter) (tools/site/reviewPlugin.ts); the dev server then reloads the page. */
export async function saveJob(page: string, job: string): Promise<void> {
  const res = await fetch(`${ROUTE}?page=${encodeURIComponent(page)}`, {
    method: 'PUT',
    body: JSON.stringify({ job }),
  });
  if (!res.ok) throw new Error(`The job was not saved: ${res.status}`);
}
