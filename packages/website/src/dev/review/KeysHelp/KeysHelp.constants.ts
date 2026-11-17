export const GROUPS = [
  [
    'Overlay',
    [
      { key: 'F', does: 'Turns the overlay on and off' },
      { key: 'Esc', does: 'Cancels' },
    ],
  ],
  [
    'Modes',
    [
      { key: 'Tab', does: 'Switches between Notes and Marks' },
      { key: 'N', does: 'Notes mode' },
      { key: 'T', does: 'Marks mode' },
    ],
  ],
  ['Notes mode', [{ word: 'Click or drag', does: 'Leaves a note on the page' }]],
  [
    'Marks mode',
    [
      { word: 'Drag', does: 'Selects text' },
      { key: 'C', does: 'Cuts the selected text' },
      { key: 'W', does: 'Rewrites the selected text' },
      { key: 'G', does: 'Marks the selected text good' },
      { word: 'Click a mark', does: 'Cycles cut, keep, rewrite, good' },
    ],
  ],
  [
    'Both modes',
    [
      { key: 'M', does: 'Shows the marks in the text' },
      { key: 'H', does: 'Shows the result' },
      { word: 'Section icon', does: "Opens that section's review" },
    ],
  ],
  ['Help', [{ key: '?', does: 'Opens and closes this box' }]],
] as const;
