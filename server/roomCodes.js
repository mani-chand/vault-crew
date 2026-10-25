// Room codes: four letters, no I or O (and never digits) so they are easy to
// read aloud and type on a phone.

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function generateCode(rng, taken) {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += rng.pick(CODE_ALPHABET);
    if (!taken.has(code)) return code;
  }
}

export function normalizeCode(input) {
  if (input === undefined || input === null) return '';
  return String(input).trim().toUpperCase();
}
