import type { DocsControlGroup } from '../@types/DocsControlGroup';

const ANYWHERE = 'Anywhere';
const STEERING = 'The scene and exhibits';

/**
 * Every table of the Controls page (content/docs/reference/controls.mdx), which
 * renders them from here. A row with `shortcut` is a row of the app's
 * KEYBOARD_SHORTCUTS, and tests/packages/website/docsReference.test.ts fails
 * when that table gains or loses a key these rows do not have. The other rows
 * are read from handlers the app does not export as data: the search
 * (usePaletteSearch.ts), the date box, the welcome screen, and every pointer,
 * wheel and touch handler (orbitControls.ts). "Anywhere" and "The scene and
 * exhibits" are defined on the page.
 */
export const DOCS_CONTROLS: readonly DocsControlGroup[] = [
  {
    id: 'keys-camera',
    kind: 'keys',
    rows: [
      {
        input: ['F'],
        shortcut: ['f'],
        does: 'Flies the camera to the selected object and makes it the focus. With nothing selected it does nothing.',
        where: ANYWHERE,
      },
      {
        input: ['H', 'E'],
        shortcut: ['h', 'e'],
        does: 'Flies the camera home to the sunlit side of Earth, and selects Earth.',
        where: ANYWHERE,
      },
      {
        input: ['Esc'],
        shortcut: ['escape'],
        does: 'Unpins the card and lets go of the focus. The camera stays where it is.',
        where: `${ANYWHERE}, and in a text field too`,
      },
    ],
  },
  {
    id: 'keys-search',
    kind: 'keys',
    rows: [
      { input: ['/'], shortcut: ['/'], does: 'Opens the search.', where: ANYWHERE },
      {
        input: ['Ctrl+K', 'Cmd+K'],
        shortcut: ['ctrl+k', 'command+k'],
        does: 'Opens the search.',
        where: ANYWHERE,
      },
    ],
  },
  {
    id: 'keys-search-open',
    kind: 'keys',
    rows: [
      {
        input: ['Left', 'Right', 'Up', 'Down'],
        does: 'Move the highlight across the cards.',
        where: 'Search open, nothing typed',
      },
      {
        input: ['Alt+Left', 'Alt+Right'],
        does: 'Go to the tab before or the tab after.',
        where: 'Search open, nothing typed',
      },
      {
        input: ['Enter'],
        does: 'Opens the highlighted card.',
        where: 'Search open, nothing typed',
      },
      {
        input: ['Up', 'Down'],
        does: 'Move through the results. Past the last one the highlight goes back to the first, and the other way round.',
        where: 'Search open, something typed',
      },
      {
        input: ['Enter'],
        does: 'Goes to the highlighted result.',
        where: 'Search open, something typed',
      },
      { input: ['Esc'], does: 'Closes the search.', where: 'Search open' },
    ],
  },
  {
    id: 'keys-clock',
    kind: 'keys',
    rows: [
      { input: [']'], shortcut: [']'], does: 'Makes the clock one step faster.', where: ANYWHERE },
      { input: ['['], shortcut: ['['], does: 'Makes the clock one step slower.', where: ANYWHERE },
      {
        input: ['\\'],
        shortcut: ['\\'],
        does: 'Pauses the clock, or starts it again.',
        where: ANYWHERE,
      },
      {
        input: ['Shift+N'],
        shortcut: ['shift+n'],
        does: 'Puts the scene back on the present, running at real speed.',
        where: ANYWHERE,
      },
      {
        input: ['Enter'],
        does: 'Moves the clock to the date in the field and closes the box.',
        where: 'The clock’s date box',
      },
      {
        input: ['Esc'],
        does: 'Closes the box and leaves the clock as it was.',
        where: 'The clock’s date box',
      },
    ],
  },
  {
    id: 'keys-tours',
    kind: 'keys',
    rows: [
      {
        input: ['Right'],
        shortcut: ['right'],
        does: 'Goes to the next step. On the last step it ends the tour.',
        where: 'A tour',
      },
      {
        input: ['Left'],
        shortcut: ['left'],
        does: 'Goes back one step.',
        where: 'A tour',
      },
      {
        input: ['Space'],
        shortcut: ['space'],
        does: 'Pauses the tour, or resumes it.',
        where: 'A tour, once the camera has arrived at a step',
      },
      {
        input: ['Esc'],
        does: 'Leaves the tour or the exhibit.',
        where: 'A tour or an exhibit, with the search closed',
      },
    ],
  },
  {
    id: 'keys-interface',
    kind: 'keys',
    rows: [
      {
        input: ['Tab'],
        shortcut: ['tab'],
        does: 'Hides the interface. Pressed again, it brings it back.',
        where: ANYWHERE,
      },
      {
        input: ['Esc'],
        does: 'Closes the welcome screen, as the Explore button does.',
        where: 'The welcome screen',
      },
    ],
  },
  {
    id: 'keys-development',
    kind: 'keys',
    rows: [
      {
        input: ['L'],
        shortcut: ['l'],
        does: 'Prints the camera’s position to the browser’s console, and under it a link to the view on screen with its camera position and its date and time.',
        where: ANYWHERE,
      },
      {
        input: ['D'],
        shortcut: ['d'],
        does: 'Opens the debug panel, or closes it.',
        where: ANYWHERE,
      },
    ],
  },
  {
    id: 'mouse',
    kind: 'gesture',
    rows: [
      {
        input: ['Drag with the left button'],
        does: 'Turns the camera about its focus. Near a surface, a drag that starts on the ground slides the ground and one that starts on the sky looks around.',
        where: STEERING,
      },
      {
        input: ['Drag with the right or the middle button'],
        does: 'Slides the view sideways. Near a surface it tilts the view towards the horizon and turns it.',
        where: STEERING,
      },
      {
        input: ['Any drag, close to a Mars rover or to Søndermarken'],
        does: 'Turns the camera round the site.',
        where: 'The scene',
      },
      {
        input: ['Turn the wheel'],
        does: 'Away from you moves the camera nearer its focus, towards you moves it further off. Near a surface it zooms towards the point under the pointer.',
        where: `${STEERING}, with the pointer over the scene`,
      },
      {
        input: ['Click'],
        does: 'Selects the object or the name under the pointer and pins its card. On empty space it unpins the card.',
        where: `${STEERING}. In dome mode a click selects nothing.`,
      },
      {
        input: ['Double-click'],
        does: 'Flies the camera to the object and makes it the focus.',
        where: STEERING,
      },
      {
        input: ['Rest the pointer on an object'],
        does: 'Shows a hover card that names it.',
        where: `${STEERING}, with no mouse button held`,
      },
    ],
  },
  {
    id: 'trackpad',
    kind: 'gesture',
    rows: [
      {
        input: ['Click and drag'],
        does: 'As a drag with the left mouse button.',
        where: STEERING,
      },
      {
        input: ['Drag with a right click held'],
        does: 'As a drag with the right mouse button.',
        where: STEERING,
      },
      {
        input: ['Scroll with two fingers'],
        does: 'As the mouse wheel. Which way brings the camera nearer follows the scroll direction set on your computer.',
        where: `${STEERING}, with the pointer over the scene`,
      },
      {
        input: ['Pinch'],
        does: 'Fingers apart moves the camera nearer its focus, fingers together moves it further off.',
        where: `${STEERING}, with the pointer over the scene`,
      },
      {
        input: ['Click, double-click, rest the pointer'],
        does: 'As with a mouse.',
        where: STEERING,
      },
    ],
  },
  {
    id: 'touch',
    kind: 'gesture',
    rows: [
      {
        input: ['Drag with one finger'],
        does: 'Turns the camera about its focus. Near a surface, a drag that starts on the ground slides the ground and one that starts on the sky looks around.',
        where: STEERING,
      },
      {
        input: ['Move two fingers apart'],
        does: 'Moves the camera nearer its focus.',
        where: STEERING,
      },
      {
        input: ['Bring two fingers together'],
        does: 'Moves the camera further from its focus.',
        where: STEERING,
      },
      {
        input: ['Tap'],
        does: 'Selects the object or the name under the finger and pins its card. On empty space it unpins the card.',
        where: STEERING,
      },
      {
        input: ['Double-tap'],
        does: 'Flies the camera to the object and makes it the focus.',
        where: STEERING,
      },
    ],
  },
];
