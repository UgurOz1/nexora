import { describe, expect, it } from 'vitest';
import { mentionToken, splitMentions } from './mentions';

const id = '11111111-1111-4111-8111-111111111111';

describe('splitMentions', () => {
  it('separates text from mentions', () => {
    expect(splitMentions(`Hi @[Ada Lovelace](${id}), look!`)).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', name: 'Ada Lovelace', userId: id },
      { type: 'text', text: ', look!' },
    ]);
  });

  it('keeps plain text and lookalikes as text', () => {
    expect(splitMentions('no mentions @ada [x](y)')).toEqual([
      { type: 'text', text: 'no mentions @ada [x](y)' },
    ]);
    expect(splitMentions('')).toEqual([]);
  });

  it('does not treat markup as anything special', () => {
    expect(splitMentions('<b>bold</b>')).toEqual([{ type: 'text', text: '<b>bold</b>' }]);
  });
});

describe('mentionToken', () => {
  it('round-trips through splitMentions', () => {
    expect(splitMentions(mentionToken('Ada', id))).toEqual([
      { type: 'mention', name: 'Ada', userId: id },
    ]);
  });

  it('drops characters that would break the format', () => {
    expect(mentionToken('A]da\n', id)).toBe(`@[Ada](${id})`);
    expect(mentionToken(']', id)).toBe(`@[member](${id})`);
  });
});
