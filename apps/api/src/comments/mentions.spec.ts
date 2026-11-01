import { newlyMentioned, parseMentions } from './mentions';

const ada = '11111111-1111-4111-8111-111111111111';
const max = '22222222-2222-4222-8222-222222222222';

describe('parseMentions', () => {
  it('finds mentions anywhere in the text', () => {
    expect(parseMentions(`Hi @[Ada](${ada}), please ask @[Max Power](${max}).`)).toEqual([
      ada,
      max,
    ]);
  });

  it('lists each person once, in order of first appearance', () => {
    expect(parseMentions(`@[Max](${max}) @[Ada](${ada}) @[Max again](${max})`)).toEqual([max, ada]);
  });

  it('treats ids case-insensitively', () => {
    expect(parseMentions(`@[Ada](${ada.toUpperCase()})`)).toEqual([ada]);
  });

  it('ignores plain @names, malformed ids and mentions spanning lines', () => {
    expect(parseMentions('Hi @ada and @[Ada](not-a-uuid)')).toEqual([]);
    expect(parseMentions(`@[Ada\nLovelace](${ada})`)).toEqual([]);
    expect(parseMentions('')).toEqual([]);
  });
});

describe('newlyMentioned', () => {
  it('skips the author and people who were already mentioned', () => {
    expect(
      newlyMentioned({ mentioned: [ada, max], alreadyMentioned: [ada], authorId: '33' }),
    ).toEqual([max]);
    expect(newlyMentioned({ mentioned: [ada, max], alreadyMentioned: [], authorId: ada })).toEqual([
      max,
    ]);
  });
});
