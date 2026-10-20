import type { PointerEventHandler, RefObject } from 'react';

/** What `useSheetDrag` hands MobileSheet: refs to attach, rest state, and the sheet's pointer handlers. */
export type SheetDrag = {
  sheetRef: RefObject<HTMLElement | null>;
  /** The expanded sheet only drags from inside this element; its content scrolls instead. */
  handleRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  /** True from the first moved pixel past the slop until release: CSS turns the snap transition off. */
  dragging: boolean;
  handlers: {
    onPointerDown: PointerEventHandler<HTMLElement>;
    onPointerMove: PointerEventHandler<HTMLElement>;
    onPointerUp: PointerEventHandler<HTMLElement>;
    onPointerCancel: PointerEventHandler<HTMLElement>;
  };
};
