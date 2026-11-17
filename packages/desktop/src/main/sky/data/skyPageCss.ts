/** Laid on every sky page in a show: no scrollbars and no text selection, so the sky reads as a picture. */
export const SKY_PAGE_CSS = `
html, body { overflow: hidden !important; }
::-webkit-scrollbar { display: none; }
*:not(input, textarea) { -webkit-user-select: none !important; user-select: none !important; }
`;
