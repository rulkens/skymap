/** A labelled textarea with a Save button that says what it saves; it also saves on blur or Enter and drops the edit on Escape. */
export type ReviewNoteField = {
  el: HTMLElement;
  area: HTMLTextAreaElement;
  button: HTMLButtonElement;
  /** Shows a stored value, unless the owner is typing in the field. */
  set: (value: string) => void;
};
