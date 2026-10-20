const ROUTE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}__job`;

/** Writes a page's job into the front matter of its text (tools/site/reviewPlugin.ts); the dev server then reloads the page. */
export async function saveJob(page: string, job: string): Promise<void> {
  const res = await fetch(`${ROUTE}?page=${encodeURIComponent(page)}`, {
    method: 'PUT',
    body: JSON.stringify({ job }),
  });
  if (!res.ok) throw new Error(`The job was not saved: ${res.status}`);
}
