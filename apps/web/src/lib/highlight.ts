export interface Piece {
  text: string;
  match: boolean;
}

// Splits `text` so the parts that match what was searched can be marked. Same idea as the
// server's search: every word of the query is a PREFIX of a word in the text, case-insensitive.
// Used only to show people why a result matched; it never decides what matches.
export function highlightPieces(text: string, query: string): Piece[] {
  // Only letters and digits survive (same as the server), so no search text can be a pattern.
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  if (terms.length === 0) return [{ text, match: false }];

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join('|')})[\\p{L}\\p{N}]*`, 'giu');

  const pieces: Piece[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    if (found.index > last) pieces.push({ text: text.slice(last, found.index), match: false });
    pieces.push({ text: found[0], match: true });
    last = found.index + found[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), match: false });
  return pieces.length > 0 ? pieces : [{ text, match: false }];
}
