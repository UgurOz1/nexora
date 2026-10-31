import type { MailMessage } from './mail.service';

// The user's name is user input: escape it, or a name like <a href=...> becomes a phishing link.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(name: string, intro: string, link: string, action: string, footer: string) {
  const safeName = escapeHtml(name);
  return {
    text: `Hi ${name},\n\n${intro}\n\n${link}\n\n${footer}`,
    html: `<p>Hi ${safeName},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${link}">${action}</a></p>
<p style="color:#666;font-size:12px">${footer}</p>`,
  };
}

export function verificationEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your NEXORA email address',
    ...layout(
      name,
      'Please confirm your email address to finish setting up your account.',
      link,
      'Confirm email',
      'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    ),
  };
}

export function invitationEmail(
  to: string,
  inviterName: string,
  organizationName: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: `${inviterName} invited you to ${organizationName} on NEXORA`,
    ...layout(
      'there',
      `${inviterName} invited you to join ${organizationName}.`,
      link,
      'Accept invitation',
      'This invitation expires in 7 days. Sign in or sign up with this email address to accept it.',
    ),
  };
}

export function passwordResetEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Reset your NEXORA password',
    ...layout(
      name,
      'We received a request to reset your password.',
      link,
      'Choose a new password',
      'This link expires in 1 hour and can be used once. If you did not ask for this, ignore this email; your password stays the same.',
    ),
  };
}
