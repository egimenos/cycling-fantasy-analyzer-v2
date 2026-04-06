/**
 * Mapping for characters that Unicode NFD decomposition does NOT handle.
 * NFD only decomposes characters into base + combining marks (e.g. Č → C + caron).
 * Precomposed characters like Ø, Æ, Å, ł, đ, ß have no combining mark form
 * and must be replaced explicitly before NFD normalization.
 */
const SPECIAL_CHARS: Record<string, string> = {
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  å: 'a',
  Å: 'A',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ß: 'ss',
};

const SPECIAL_CHARS_RE = new RegExp(`[${Object.keys(SPECIAL_CHARS).join('')}]`, 'g');

export function normalizeText(str: string): string {
  return str
    .replace(SPECIAL_CHARS_RE, (ch) => SPECIAL_CHARS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
