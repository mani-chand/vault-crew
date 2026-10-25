// The sixteen glyphs used by Tumbler and Glyph Pad. Shared by server (ids)
// and browser (drawing). Names are chosen to be easy to say out loud; the
// drawing must match the name, that is what makes the game playable.
//
// Each path is drawn in a 0 0 24 24 viewBox. `stroke: true` means draw the
// path as a line (no fill); otherwise fill it.

export const GLYPHS = Object.freeze([
  { id: 'triangle', name: 'Triangle', path: 'M12 3 L21 20 L3 20 Z' },
  { id: 'square', name: 'Square', path: 'M4 4 H20 V20 H4 Z' },
  { id: 'circle', name: 'Circle', path: 'M12 3 A9 9 0 1 1 12 21 A9 9 0 1 1 12 3 Z' },
  { id: 'diamond', name: 'Diamond', path: 'M12 2 L22 12 L12 22 L2 12 Z' },
  { id: 'star', name: 'Star', path: 'M12 2 L14.9 8.6 L22 9.3 L16.6 14.1 L18.2 21 L12 17.3 L5.8 21 L7.4 14.1 L2 9.3 L9.1 8.6 Z' },
  { id: 'hexagon', name: 'Hexagon', path: 'M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z' },
  { id: 'cross', name: 'Cross', path: 'M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z' },
  { id: 'arrow', name: 'Arrow', path: 'M3 10 H14 V5 L22 12 L14 19 V14 H3 Z' },
  { id: 'moon', name: 'Moon', path: 'M15 3 A9 9 0 1 0 15 21 A7 7 0 1 1 15 3 Z' },
  { id: 'bolt', name: 'Bolt', path: 'M13 2 L4 13 H11 L10 22 L20 9 H13 Z' },
  { id: 'wave', name: 'Wave', path: 'M2 12 C5 6 8 6 11 12 S17 18 22 12', stroke: true },
  { id: 'spiral', name: 'Spiral', path: 'M12 12 a1 1 0 0 1 1 1 a2 2 0 0 1 -2 2 a3 3 0 0 1 -3 -3 a4 4 0 0 1 4 -4 a5 5 0 0 1 5 5 a6 6 0 0 1 -6 6 a7 7 0 0 1 -7 -7 a8 8 0 0 1 8 -8', stroke: true },
  { id: 'heart', name: 'Heart', path: 'M12 21 L4 13 A4.5 4.5 0 0 1 12 7 A4.5 4.5 0 0 1 20 13 Z' },
  { id: 'anchor', name: 'Anchor', path: 'M12 3 a2 2 0 1 0 0 4 a2 2 0 1 0 0 -4 M12 7 V21 M5 13 A7 7 0 0 0 19 13 M8 11 H4 M20 11 H16', stroke: true },
  { id: 'key', name: 'Key', path: 'M8 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8 M12 12 H21 M18 12 V15 M21 12 V15', stroke: true },
  { id: 'eye', name: 'Eye', path: 'M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9 Z' },
]);

export const GLYPH_IDS = Object.freeze(GLYPHS.map((g) => g.id));

export const GLYPH_BY_ID = Object.freeze(Object.fromEntries(GLYPHS.map((g) => [g.id, g])));
