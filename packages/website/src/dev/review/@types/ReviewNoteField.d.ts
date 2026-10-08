/** A labelled textarea that saves on blur or Enter and drops the edit on Escape. */
export type ReviewNoteField = {
  el: HTMLLabelElement;
  area: HTMLTextAreaElement;
  /** Shows a stored value, unless the owner is typing in the field. */
  set: (value: string) => void;
};
