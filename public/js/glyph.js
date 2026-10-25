// Draws one of the shared glyphs as an inline SVG.

import { GLYPH_BY_ID } from '/shared/glyphs.js';

const NS = 'http://www.w3.org/2000/svg';

export function glyphSvg(id, size = 40) {
  const glyph = GLYPH_BY_ID[id];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('glyph');
  if (!glyph) return svg;
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', glyph.path);
  if (glyph.stroke) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  } else {
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
  }
  svg.append(path);
  return svg;
}

export function glyphName(id) {
  const glyph = GLYPH_BY_ID[id];
  return glyph ? glyph.name : id;
}
