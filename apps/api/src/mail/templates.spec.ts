import { escapeHtml, verificationEmail } from './templates';

describe('mail templates', () => {
  it('escapes HTML in user-provided names', () => {
    expect(escapeHtml(`<a href="x">Ada</a> & 'co'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Ada&lt;/a&gt; &amp; &#39;co&#39;',
    );
  });

  it('never puts a raw HTML name into the email body', () => {
    const mail = verificationEmail(
      'ada@example.com',
      '<a href="https://evil.test">Click</a>',
      'https://app.test/verify-email?token=t',
    );

    expect(mail.html).not.toContain('https://evil.test"');
    expect(mail.html).toContain('https://app.test/verify-email?token=t');
  });
});
