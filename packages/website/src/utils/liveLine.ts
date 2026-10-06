/**
 * Rewrites a sentence each time it scrolls into view and leaves it alone in
 * between: a figure that kept counting would be motion.
 */
export function liveLine(line: HTMLElement, say: () => string): void {
  new IntersectionObserver(([entry]) => {
    if (entry!.isIntersecting) line.textContent = say();
  }).observe(line);
}
