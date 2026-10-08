import type { ReviewNoteField } from './@types/ReviewNoteField';

export function makeNoteField(
  label: string,
  placeholder: string,
  onSave: (value: string) => void,
): ReviewNoteField {
  const el = document.createElement('label');
  el.className = 'review-note';
  el.textContent = label;
  const area = document.createElement('textarea');
  area.rows = 1;
  area.placeholder = placeholder;
  el.append(area);
  let saved = '';
  // A field inside a hidden row measures 0: leave it alone until it can be measured.
  const grow = (): void => {
    area.style.height = 'auto';
    if (area.scrollHeight > 0) area.style.height = `${area.scrollHeight}px`;
  };
  area.addEventListener('input', grow);
  area.addEventListener('blur', () => {
    const value = area.value.trim();
    if (value === saved) return;
    saved = value;
    onSave(value);
  });
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
    set(value) {
      saved = value;
      if (document.activeElement === area) return;
      area.value = value;
      queueMicrotask(grow);
    },
  };
}
