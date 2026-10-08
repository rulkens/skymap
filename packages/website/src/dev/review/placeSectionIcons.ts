import type { ReviewSection } from './@types/ReviewSection';

const STATES = ['rewrite', 'cut', 'good', 'keep'] as const;

/** Puts the entry icon in each reviewed heading: a count of its marks, tinted by the commonest state. */
export function placeSectionIcons(sections: ReviewSection[]): void {
  sections.forEach((section, index) => {
    const counts = { cut: 0, keep: 0, rewrite: 0, good: 0 };
    for (const mark of section.marks) counts[mark.state]++;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-section-icon';
    button.dataset.reviewUi = '';
    button.dataset.reviewSection = String(index);
    button.dataset.state = STATES.reduce((best, s) => (counts[s] > counts[best] ? s : best));
    button.title = `${counts.cut} cut · ${counts.keep} keep · ${counts.rewrite} rewrite · ${counts.good} good`;
    button.append('§');
    const count = document.createElement('span');
    count.className = 'review-section-count';
    count.textContent = String(section.marks.length);
    button.append(count);
    section.heading.prepend(button);
  });
}
