import type { ChangeEventHandler, FocusEventHandler, KeyboardEventHandler, RefObject } from 'react';

/** What `useSliderTextEdit` hands Slider: the mode, a way in, the props for its text box, and why its text is invalid. */
export type SliderTextEdit = {
  editing: boolean;
  /** Opens the box prefilled with the value, all of it selected. */
  start: () => void;
  /** Set while the box glows: after a failed Enter, until the text is valid. */
  reason: string | undefined;
  input: {
    ref: RefObject<HTMLInputElement | null>;
    value: string;
    'aria-invalid': true | undefined;
    onChange: ChangeEventHandler<HTMLInputElement>;
    onKeyDown: KeyboardEventHandler<HTMLInputElement>;
    onBlur: FocusEventHandler<HTMLInputElement>;
  };
};
