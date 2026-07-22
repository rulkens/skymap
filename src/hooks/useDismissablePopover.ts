// src/hooks/useDismissablePopover.ts
/**
 * useDismissablePopover — shared Esc + outside-click dismissal for the
 * TimeBar's popovers (DateEntryPopover, RateSelectorPopover).
 *
 * Both popovers are true popovers, not modal backdrops: the rest of the HUD
 * stays interactive, so dismissal is a document-level `mousedown` listener
 * (closes when the click lands outside the panel) plus an `Escape` key
 * handler wired to the panel's own `onKeyDown` — not a document keydown
 * listener, so a popover that never receives focus (RateSelectorPopover's
 * rows are clicked, not typed into) still needs the panel to be the thing
 * the key event bubbles through, which `role="dialog"` + the returned
 * `panelRef` guarantees.
 *
 * ## Why `mousedown`, not `click`
 *
 * `mousedown` fires before `click`. Using it here (rather than `click`) is
 * what makes the popover close before the same physical click's `click`
 * handler on the page runs — which matters for the trigger button.
 *
 * ## The trigger-exclusion problem
 *
 * Every trigger button toggles its own popover open/closed on `click`. Without
 * excluding that button from "outside", re-clicking it while open fires this
 * hook's `mousedown` listener FIRST (closing the popover, since the trigger
 * sits outside the panel), and then the same click's `onClick` toggle sees a
 * closed popover and reopens it — net effect, the trigger can never close its
 * own popover by re-clicking it. `triggerSelector` (matched via `.closest()`
 * against the mousedown target) exempts the trigger from the outside check,
 * leaving the toggle handler as the sole closer for its own button.
 */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

type UseDismissablePopoverOptions = {
  readonly onClose: () => void;
  // CSS selector for this popover's own trigger button, e.g. '[data-rate-trigger]'.
  // Omit it for a popover with no single toggle trigger (or one that doesn't
  // need the reopen guard).
  readonly triggerSelector?: string;
};

type UseDismissablePopoverReturn = {
  readonly panelRef: RefObject<HTMLDivElement | null>;
  // Attach to the panel's onKeyDown. Compose it with any of the panel's own
  // key handling (e.g. DateEntryPopover's Enter-to-commit) by calling both.
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function useDismissablePopover({
  onClose,
  triggerSelector,
}: UseDismissablePopoverOptions): UseDismissablePopoverReturn {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (triggerSelector && target && target.closest(triggerSelector)) return;
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [onClose, triggerSelector]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return { panelRef, onKeyDown };
}
