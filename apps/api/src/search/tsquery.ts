// Turns what a person typed into a Postgres tsquery: every word must match, and each word is
// matched as a PREFIX ("desi" finds "design"), so results appear while typing.
//
// The text is NOT passed to Postgres as it is: tsquery has its own syntax (& | ! ( ) : *), and
// text that can write it could make the query fail or change its meaning. Only letters and digits
// survive here, so whatever is typed, the result is a plain "word:* & word:*" and nothing else.
const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 50;

export function buildTsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS)
    .map((term) => term.slice(0, MAX_TERM_LENGTH));
  return terms.length > 0 ? terms.map((term) => `${term}:*`).join(' & ') : null;
}
