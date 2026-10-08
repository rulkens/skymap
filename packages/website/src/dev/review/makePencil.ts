/** The glyph that reopens a rewrite mark's editor; dimmed until the owner has written something. */
export function makePencil(id: string, hasAfter: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = hasAfter ? 'review-pencil has-after' : 'review-pencil';
  button.dataset.reviewUi = '';
  button.dataset.reviewId = id;
  button.textContent = '✎';
  button.setAttribute('aria-label', 'Edit the replacement wording');
  return button;
}
