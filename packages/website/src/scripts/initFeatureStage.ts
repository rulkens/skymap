/*
 * initFeatureStage — the index and the stage of the Features page
 * (components/FeatureStage.astro). The group being read is the last whose mark has
 * passed two fifths of the way down the window: its link in the index is
 * marked, its picture is the one on the stage (`data-here`), and on a phone
 * its chip is brought into the row. `data-live` tells the page the script
 * runs; without it every picture stands beside its own group.
 */
export function initFeatureStage(layout: HTMLElement): void {
  const marks = [...layout.querySelectorAll<HTMLElement>('[data-mark]')];
  const links = [...layout.querySelectorAll<HTMLAnchorElement>('[data-index] a')];
  const shots = [...layout.querySelectorAll<HTMLElement>('[data-shot-of]')];
  const row = layout.querySelector<HTMLElement>('[data-index] ul');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let here: string | undefined;

  const mark = (): void => {
    const line = innerHeight * 0.4;
    const now = (marks.findLast((m) => m.getBoundingClientRect().top <= line) ?? marks[0])?.id;
    if (now === here) return;
    here = now;
    for (const shot of shots) shot.toggleAttribute('data-here', shot.dataset.shotOf === here);
    for (const link of links) {
      if (link.hash.slice(1) !== here) {
        link.removeAttribute('aria-current');
        continue;
      }
      link.setAttribute('aria-current', 'location');
      // Only the chip row scrolls sideways; wide, the list is as long as its words and this moves nothing.
      row?.scrollTo({
        left: link.offsetLeft - row.offsetLeft - 20,
        behavior: calm.matches ? 'auto' : 'smooth',
      });
    }
  };

  layout.setAttribute('data-live', '');
  addEventListener('scroll', mark, { passive: true });
  addEventListener('resize', mark);
  mark();
}
