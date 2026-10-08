import type { ReviewSection } from './@types/ReviewSection';

const STATES = ['rewrite', 'cut', 'good', 'keep'] as const;

/** Puts the entry icon in each reviewed heading: a count of its marks and notes, tinted by the commonest mark state. */
export function placeSectionIcons(sections: ReviewSection[]): void {
  sections.forEach((section, index) => {
    const counts = { cut: 0, keep: 0, rewrite: 0, good: 0 };
    let notes = 0;
    for (const item of section.items) {
      if (item.kind === 'mark') counts[item.mark.state]++;
      else notes++;
    }
    const marked = STATES.reduce((best, s) => (counts[s] > counts[best] ? s : best));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-section-icon';
    button.dataset.reviewUi = '';
    button.dataset.reviewSection = String(index);
    button.dataset.state = counts[marked] > 0 ? marked : 'note';
    button.title =
      `${counts.cut} cut · ${counts.keep} keep · ${counts.rewrite} rewrite · ${counts.good} good` +
      (notes > 0 ? ` · ${notes} ${notes === 1 ? 'note' : 'notes'}` : '');
    button.append('§');
    const count = document.createElement('span');
    count.className = 'review-section-count';
    count.textContent = String(section.items.length);
    button.append(count);
    section.heading.prepend(button);
  });
}
