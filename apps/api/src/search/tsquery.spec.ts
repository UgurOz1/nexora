import { buildTsQuery } from './tsquery';

describe('buildTsQuery', () => {
  it('requires every word and matches each as a prefix', () => {
    expect(buildTsQuery('Home page')).toBe('home:* & page:*');
  });

  it('keeps letters of any language and digits', () => {
    expect(buildTsQuery('Çalışma ÖĞLE 2027')).toBe('çalışma:* & öğle:* & 2027:*');
  });

  it('cannot be used to write tsquery syntax', () => {
    // Operators, quotes, parentheses and colons are separators, never passed through.
    expect(buildTsQuery("a & b | !c (d) 'e' f:*")).toBe('a:* & b:* & c:* & d:* & e:* & f:*');
    expect(buildTsQuery(')(&|!:*\\')).toBeNull();
  });

  it('is empty for nothing searchable', () => {
    expect(buildTsQuery('')).toBeNull();
    expect(buildTsQuery('   ')).toBeNull();
    expect(buildTsQuery('---')).toBeNull();
  });

  it('bounds the amount of work a single search can ask for', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(buildTsQuery(many)!.split(' & ')).toHaveLength(8);
    expect(buildTsQuery('x'.repeat(500))).toBe(`${'x'.repeat(50)}:*`);
  });
});
