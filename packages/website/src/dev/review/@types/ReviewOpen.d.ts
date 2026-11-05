/**
 * The one open panel: a section (by its heading) or the history of applies. The serial is new at every
 * opening, so a panel opened again starts fresh while one that is only repainted keeps its fields.
 */
export type ReviewOpen = { target: Element | 'applied'; serial: number };
