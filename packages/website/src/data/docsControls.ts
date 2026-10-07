import type { DocsControlGroup } from '../@types/DocsControlGroup';

const ANYWHERE = 'Anywhere';
const STEERING = 'The scene and exhibits';

/**
 * Every table of the Controls page (content/docs/reference/controls.mdx), which
 * renders them from here. A row with `shortcut` is a row of the app's
 * KEYBOARD_SHORTCUTS, and tests/packages/website/docsReference.test.ts fails
 * when that table gains or loses a key these rows do not have. The other rows
 * are read from handlers the app does not export as data: the search
 * (usePaletteSearch.ts), the date box and the speed list, the welcome screen,
 * the sliders, and every pointer, wheel and touch handler (orbitControls.ts).
 * "Anywhere" is defined on the page: scene, tour, exhibit and welcome screen,
 * with no text field holding the keyboard.
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
        where: `${ANYWHERE}. During a tour Earth is selected and the tour keeps the camera.`,
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
      {
        input: ['Esc'],
        does: 'Closes the search. It also unpins the card and lets go of the focus.',
        where: 'Search open',
      },
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
    ],
  },
  {
    id: 'keys-clock-boxes',
    kind: 'keys',
    rows: [
      {
        input: ['Enter'],
        does: 'Moves the clock to the date in the field and closes the box.',
        where: 'The date box',
      },
      {
        input: ['Esc'],
        does: 'Closes the box and leaves the clock as it was. It also unpins the card and lets go of the focus.',
        where: 'The date box',
      },
      {
        input: ['Esc'],
        does: 'Closes the list. It also unpins the card and lets go of the focus.',
        where: 'The list of speeds, once the keyboard is on one of its rows',
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
        does: 'Goes back one step. On the first step it does nothing.',
        where: 'A tour',
      },
      {
        input: ['Space'],
        shortcut: ['space'],
        does: 'Pauses the tour, or resumes it. During the flight to a subject it does nothing.',
        where: 'A tour, while the view is holding on a subject',
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
        does: 'Hides every panel and button. Pressed again, it brings them back.',
        where: ANYWHERE,
      },
      {
        input: ['Esc'],
        does: 'Closes the welcome screen, as the Explore button does, and deselects Earth.',
        where: 'The welcome screen',
      },
    ],
  },
  {
    id: 'keys-sliders',
    kind: 'keys',
    rows: [
      { input: ['Right', 'Up'], does: 'One step up.', where: 'A slider that has the keyboard' },
      { input: ['Left', 'Down'], does: 'One step down.', where: 'A slider that has the keyboard' },
      {
        input: ['Page Up', 'Page Down'],
        does: 'Ten steps up or down.',
        where: 'A slider that has the keyboard',
      },
      {
        input: ['Home', 'End'],
        does: 'The lowest or the highest value.',
        where: 'A slider that has the keyboard',
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
        does: 'Prints the camera’s position to the browser’s console, and under it a link to the view on screen with its pose and its instant.',
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
        does: 'Turns the camera about its target. Near a surface, a drag that starts on the ground slides the ground and one that starts on the sky looks around.',
        where: STEERING,
      },
      {
        input: ['Drag with the right or the middle button'],
        does: 'Slides the view sideways. Near a surface it tilts the view towards the horizon and turns it.',
        where: STEERING,
      },
      {
        input: ['Turn the wheel'],
        does: 'Away from you moves the camera nearer its target, towards you moves it further off. Near a surface it zooms towards the point under the pointer.',
        where: `${STEERING}, with the pointer over the scene`,
      },
      {
        input: ['Click'],
        does: 'Selects the object or the name under the pointer and pins its card. On empty space it unpins the card.',
        where: `${STEERING}. In dome mode a click selects nothing and unpins the card.`,
      },
      {
        input: ['Double-click'],
        does: 'Flies the camera to the object and makes it the focus.',
        where: STEERING,
      },
      {
        input: ['Rest the pointer on an object'],
        does: 'Shows a small card that names it.',
        where: `${STEERING}, with no mouse button held`,
      },
      {
        input: ['Right-click'],
        does: 'Nothing. The browser’s menu does not open over the scene.',
        where: 'The scene',
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
        does: 'Fingers apart moves the camera nearer its target, fingers together moves it further off. It counts eight times as much as the same amount of scrolling.',
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
        does: 'Turns the camera about its target. Near a surface, a drag that starts on the ground slides the ground and one that starts on the sky looks around.',
        where: STEERING,
      },
      {
        input: ['Move two fingers apart'],
        does: 'Moves the camera nearer its target.',
        where: STEERING,
      },
      {
        input: ['Bring two fingers together'],
        does: 'Moves the camera further from its target.',
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
