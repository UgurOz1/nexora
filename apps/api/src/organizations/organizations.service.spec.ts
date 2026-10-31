import { slugify } from './organizations.service';

describe('slugify', () => {
  it.each([
    ['Acme Software', 'acme-software'],
    ['  Hello,   World!!  ', 'hello-world'],
    ['Şirket Ünal İş', 'sirket-unal-is'],
    ['---', 'org'],
    ['日本語', 'org'],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('caps the length', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(48);
  });
});
