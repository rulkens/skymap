import type { ReviewEditorField } from './@types/ReviewEditorField';
import { reviewBlockOf } from './reviewBlockOf';

/**
 * The inline editor for a mark's notes, placed under the mark's paragraph: one labelled
 * textarea per field. Enter in a field or Save hands the trimmed values to `done` in
 * field order, Escape or Skip hands null; the returned function closes the editor
 * without either.
 */
export function openEditor(
  painted: Element,
  fields: ReviewEditorField[],
  done: (values: string[] | null) => void,
): () => void {
  const editor = document.createElement('div');
  editor.className = 'review-editor';
  editor.dataset.reviewUi = '';
  const submit = (): void => done(areas.map((area) => area.value.trim()));
  const areas = fields.map(({ label, value, placeholder }) => {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const area = document.createElement('textarea');
    area.rows = 1;
    area.value = value;
    area.placeholder = placeholder;
    const grow = (): void => {
      area.style.height = 'auto';
      area.style.height = `${area.scrollHeight}px`;
    };
    area.addEventListener('input', grow);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        done(null);
      }
    });
    wrap.append(area);
    editor.append(wrap);
    queueMicrotask(grow);
    return area;
  });
  const buttons = document.createElement('div');
  buttons.className = 'review-editor-buttons';
  for (const [label, act] of [
    ['Save', submit],
    ['Skip', () => done(null)],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', act);
    buttons.append(button);
  }
  editor.append(buttons);
  const block = painted.classList.contains('review-block') ? painted : reviewBlockOf(painted);
  (block ?? painted).after(editor);
  const first = areas[0]!;
  first.focus({ preventScroll: true });
  first.setSelectionRange(first.value.length, first.value.length);
  return () => editor.remove();
}
