// Renders one manual page. These are the only things a Crew member sees, so
// they are written to be read aloud: short rows, names next to every glyph
// and colour.

import { h } from './dom.js';
import { glyphSvg, glyphName } from './glyph.js';

const PULSE_COLORS = ['red', 'green', 'blue', 'yellow'];

function circuitPage(manual) {
  return h('div', { class: 'manual' },
    h('p', { class: 'manual__intro' }, 'Ask for the voltage and the wire colours from top to bottom. Go down this list; the first rule that fits is the one to use. Count only wires that are still intact.'),
    h('ol', { class: 'manual__rules' }, manual.rules.map((rule) => h('li', {}, rule))),
  );
}

function tumblerPage(manual) {
  return h('div', { class: 'manual' },
    h('p', { class: 'manual__intro' }, 'Ask which three glyphs are showing, left to right, and the arrow lamp colour. Each glyph is a number.'),
    h('table', { class: 'manual__table' },
      h('tbody', {},
        manual.table.map((row) =>
          h('tr', {},
            h('td', { class: 'manual__glyph' }, glyphSvg(row.glyph, 30), h('span', {}, glyphName(row.glyph))),
            h('td', { class: 'manual__num' }, String(row.number)),
          ),
        ),
      ),
    ),
    h('div', { class: 'manual__rule' },
      h('p', {}, h('strong', {}, 'Green lamp:'), ' turn Left to the 1st number, Right to the 2nd, Left to the 3rd.'),
      h('p', {}, h('strong', {}, 'Red lamp:'), ' turn Right to the 1st number, Left to the 2nd, Right to the 3rd.'),
    ),
  );
}

function glyphpadPage(manual) {
  return h('div', { class: 'manual' },
    h('p', { class: 'manual__intro' }, 'Ask which four glyphs have a ring around them, and the lock lamp colour. Press them in the order they appear in this grid, reading left to right, top to bottom.'),
    h('div', { class: 'manual__grid' },
      manual.grid.map((id, i) =>
        h('div', { class: 'manual__cell' },
          h('span', { class: 'manual__index' }, String(i + 1)),
          glyphSvg(id, 30),
          h('span', { class: 'manual__cellname' }, glyphName(id)),
        ),
      ),
    ),
    h('div', { class: 'manual__rule' },
      h('p', {}, h('strong', {}, 'White lamp:'), ' grid order.'),
      h('p', {}, h('strong', {}, 'Amber lamp:'), ' grid order, reversed.'),
    ),
  );
}

function pulseTable(label, table) {
  return h('div', { class: 'manual__pulse' },
    h('h3', { class: 'manual__subhead' }, label),
    h('table', { class: 'manual__table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'See'), h('th', {}, 'Press'))),
      h('tbody', {},
        PULSE_COLORS.map((c) =>
          h('tr', {},
            h('td', {}, h('span', { class: `dot dot--${c}` }), c),
            h('td', {}, h('span', { class: `dot dot--${table[c]}` }), table[c]),
          ),
        ),
      ),
    ),
  );
}

function pulsePage(manual) {
  return h('div', { class: 'manual' },
    h('p', { class: 'manual__intro' }, 'Ask whether the tempo is slow or fast, then the four flash colours in order. Translate each one with the matching table.'),
    h('div', { class: 'manual__pulse-tables' },
      pulseTable('Slow tempo', manual.tables.SLOW),
      pulseTable('Fast tempo', manual.tables.FAST),
    ),
  );
}

const PAGES = { circuit: circuitPage, tumbler: tumblerPage, glyphpad: glyphpadPage, pulse: pulsePage };

export function renderManual(moduleId, manual) {
  const page = PAGES[moduleId];
  return page ? page(manual) : h('p', { class: 'hint' }, 'Unknown page.');
}
