/** The one button a `Toast` may carry: its label and what a press does. */
export type ToastAction = {
  readonly label: string;
  readonly onClick: () => void;
};
