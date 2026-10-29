/** What the visitor asked the browser to spare them: data (Save-Data) and motion (reduced motion). Browser only. */
export function lessWanted(): { data: boolean; motion: boolean } {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    data: connection?.saveData === true,
    motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}
