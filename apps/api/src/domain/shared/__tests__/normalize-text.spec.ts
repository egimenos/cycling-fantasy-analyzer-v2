import { normalizeText } from '../normalize-text';

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  POGACAR Tadej  ')).toBe('pogacar tadej');
  });

  it('strips combining diacritics via NFD', () => {
    expect(normalizeText('POGAČAR')).toBe('pogacar');
    expect(normalizeText('Müller')).toBe('muller');
  });

  it('maps Scandinavian Ø → o', () => {
    expect(normalizeText('TJØTTA')).toBe('tjotta');
    expect(normalizeText('ØRN-KRISTOFF')).toBe('orn kristoff');
  });

  it('maps Scandinavian Æ → ae', () => {
    expect(normalizeText('TRÆEN')).toBe('traeen');
  });

  it('maps Scandinavian Å → a', () => {
    expect(normalizeText('HÅKANSSON')).toBe('hakansson');
  });

  it('maps Polish ł → l', () => {
    expect(normalizeText('Michał')).toBe('michal');
  });

  it('maps German ß → ss', () => {
    expect(normalizeText('GROßSCHARTNER')).toBe('grossschartner');
  });

  it('replaces punctuation with space', () => {
    expect(normalizeText("O'Connor")).toBe('o connor');
    expect(normalizeText('van-aert')).toBe('van aert');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('van   der   poel')).toBe('van der poel');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});
