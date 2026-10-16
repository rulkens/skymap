/**
 * Rewrites a sentence each time it scrolls into view and leaves it alone in
 * between: a figure that kept counting would be motion. Returns the function
 * that stops watching, for the effect that started it.
 */
export function liveLine(line: HTMLElement, say: () => string): () => void {
  const watch = new IntersectionObserver(([entry]) => {
    if (entry!.isIntersecting) line.textContent = say();
  });
  watch.observe(line);
  return () => watch.disconnect();
}
