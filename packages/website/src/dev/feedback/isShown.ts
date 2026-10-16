/** Whether `el` is visible to the eye: no ancestor hides it, or fades it to near nothing. */
export function isShown(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.3)
      return false;
  }
  return true;
}
