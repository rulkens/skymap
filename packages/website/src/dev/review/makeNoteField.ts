import type { ReviewNoteField } from './@types/ReviewNoteField';

export function makeNoteField(
  label: string,
  placeholder: string,
  saveLabel: string,
  onSave: (value: string) => void,
): ReviewNoteField {
  const el = document.createElement('div');
  el.className = 'review-note';
  if (label) {
    const text = document.createElement('div');
    text.className = 'review-note-label';
    text.textContent = label;
    el.append(text);
  }
  const area = document.createElement('textarea');
  area.rows = 1;
  area.placeholder = placeholder;
  if (label) area.setAttribute('aria-label', label);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-note-save';
  button.textContent = saveLabel;
  el.append(area, button);
  let saved = '';
  // A field inside a hidden row measures 0: leave it alone until it can be measured.
  const grow = (): void => {
    area.style.height = 'auto';
    if (area.scrollHeight > 0) area.style.height = `${area.scrollHeight}px`;
  };
  const commit = (): void => {
    const value = area.value.trim();
    if (value === saved) return;
    saved = value;
    onSave(value);
  };
  area.addEventListener('input', grow);
  area.addEventListener('blur', commit);
  button.addEventListener('click', commit);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      area.blur();
    } else if (e.key === 'Escape') {
      area.value = saved;
      area.blur();
    }
  });
  return {
    el,
    area,
    button,
    set(value) {
      saved = value;
      if (document.activeElement === area) return;
      area.value = value;
      queueMicrotask(grow);
    },
  };
}
