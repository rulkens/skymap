import type { ChangeEventHandler, FocusEventHandler, KeyboardEventHandler, RefObject } from 'react';

/** What `useSliderTextEdit` hands Slider: the mode, a way in, and the props for its text box. */
export type SliderTextEdit = {
  editing: boolean;
  /** Opens the box prefilled with the value, all of it selected. */
  start: () => void;
  input: {
    ref: RefObject<HTMLInputElement | null>;
    value: string;
    'aria-invalid': true | undefined;
    onChange: ChangeEventHandler<HTMLInputElement>;
    onKeyDown: KeyboardEventHandler<HTMLInputElement>;
    onBlur: FocusEventHandler<HTMLInputElement>;
  };
};
