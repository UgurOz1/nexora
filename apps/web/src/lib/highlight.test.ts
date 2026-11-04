import { describe, expect, it } from 'vitest';
import { highlightPieces } from './highlight';

describe('highlightPieces', () => {
  it('marks words that start with a searched word, ignoring case', () => {
    expect(highlightPieces('Design the Homepage', 'desi home')).toEqual([
      { text: 'Design', match: true },
      { text: ' the ', match: false },
      { text: 'Homepage', match: true },
    ]);
  });

  it('does not mark the middle of a word', () => {
    expect(highlightPieces('redesign', 'design')).toEqual([{ text: 'redesign', match: false }]);
  });

  it('copes with letters of other languages', () => {
    expect(highlightPieces('Haftalık Çalışma', 'çalış')).toEqual([
      { text: 'Haftalık ', match: false },
      { text: 'Çalışma', match: true },
    ]);
  });

  it('is safe for text that looks like a pattern', () => {
    expect(highlightPieces('a.b (c)', '.* ( [')).toEqual([{ text: 'a.b (c)', match: false }]);
    expect(highlightPieces('plain', '')).toEqual([{ text: 'plain', match: false }]);
  });
});
