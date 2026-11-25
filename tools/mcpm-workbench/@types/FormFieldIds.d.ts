/** FormFieldIds — the element ids a FormField hands its control: its own id, the label's and the help line's. */
export type FormFieldIds = {
  readonly control: string;
  readonly label: string;
  readonly hint: string | undefined;
};
