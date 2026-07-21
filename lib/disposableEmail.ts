const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'anonaddy.com',
  'burnermail.io',
  'byom.de',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'inboxkitten.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.io',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
]);

const DISPOSABLE_PARTS = [
  '10minutemail',
  'guerrillamail',
  'mailinator',
  'tempmail',
  'temp-mail',
  'throwaway',
  'trashmail',
  'yopmail',
];

export function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  return DISPOSABLE_PARTS.some((part) => domain.includes(part));
}
