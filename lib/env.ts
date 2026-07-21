export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAADl7nM8RNT-qeW3H';

function rejectPlaceholder(name: string, value: string): string {
  const normalized = value.toLowerCase();
  const placeholders = [
    'change-this',
    'replace-me',
    'your_',
    'your-',
    'your.',
    'example',
    'placeholder',
  ];

  if (placeholders.some((placeholder) => normalized.includes(placeholder))) {
    throw new Error(`Environment variable ${name} still contains a placeholder value`);
  }

  return value;
}

function optionalStrongSecret(name: string, minLength: number): string {
  const value = optionalEnv(name);
  if (!value) return '';
  const checked = rejectPlaceholder(name, value);
  if (checked.length < minLength) {
    throw new Error(`Environment variable ${name} must be at least ${minLength} characters long`);
  }
  return checked;
}

function requiredUrl(name: string): string {
  const value = rejectPlaceholder(name, requiredEnv(name));
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Unsupported URL protocol');
    }
    if (isProduction() && url.protocol !== 'https:') {
      throw new Error(`Environment variable ${name} must use https in production`);
    }
    return url.toString().replace(/\/$/, '');
  } catch (err) {
    if (err instanceof Error && err.message.includes(name)) throw err;
    throw new Error(`Environment variable ${name} must be a valid http(s) URL`);
  }
}

function optionalUrl(...names: string[]): string {
  const name = names.find((candidate) => optionalEnv(candidate));
  if (!name) return '';

  const value = rejectPlaceholder(name, requiredEnv(name));
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Unsupported URL protocol');
    }
    if (isProduction() && url.protocol !== 'https:') {
      throw new Error(`Environment variable ${name} must use https in production`);
    }
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.origin;
  } catch (err) {
    if (err instanceof Error && err.message.includes(name)) throw err;
    throw new Error(`Environment variable ${name} must be a valid http(s) URL`);
  }
}

function isTurnstileTestKey(value: string): boolean {
  return /^1x0+AA$/i.test(value) || /^2x0+AB$/i.test(value) || /^3x0+FF$/i.test(value);
}

function optionalTurnstileKey(name: string): string {
  const value = optionalEnv(name);
  if (!value) return '';

  try {
    const checked = rejectPlaceholder(name, value);
    if (isProduction() && isTurnstileTestKey(checked)) return '';
    return checked;
  } catch {
    return '';
  }
}

function turnstileSiteKey(): string {
  return optionalTurnstileKey('NEXT_PUBLIC_TURNSTILE_SITE_KEY') || DEFAULT_TURNSTILE_SITE_KEY;
}

function turnstileSecretKey(): string {
  return optionalTurnstileKey('TURNSTILE_SECRET_KEY');
}

function booleanEnv(name: string, defaultValue = false): boolean {
  const value = optionalEnv(name).toLowerCase();
  if (!value) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`Environment variable ${name} must be a boolean`);
}

function optionalPort(name: string, defaultValue: number): number {
  const value = optionalEnv(name);
  if (!value) return defaultValue;

  if (!/^[0-9]{2,5}$/.test(value)) {
    throw new Error(`Environment variable ${name} must be a valid TCP port`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Environment variable ${name} must be a valid TCP port`);
  }

  return parsed;
}

function optionalEmail(name: string): string {
  const value = optionalEnv(name);
  if (!value) return '';

  const checked = rejectPlaceholder(name, value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checked) || checked.length > 254) {
    throw new Error(`Environment variable ${name} must be a valid email address`);
  }

  return checked;
}

export const env = {
  supabaseUrl: () => requiredUrl('SUPABASE_URL'),
  supabaseServiceRoleKey: () => optionalStrongSecret('SUPABASE_SERVICE_ROLE_KEY', 80) || requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  adminEmail: () => optionalEmail('ADMIN_EMAIL'),
  authSecret: () => requiredEnv('AUTH_SECRET'),
  appOrigin: () => optionalUrl('PUBLIC_APP_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL'),
  rawUserAgentRegex: () => optionalEnv('RAW_USER_AGENT_REGEX'),
  rawAllowUnknownClients: () => booleanEnv('RAW_ALLOW_UNKNOWN_CLIENTS', true),
  trustCfConnectingIp: () => booleanEnv('TRUST_CF_CONNECTING_IP', false),
  turnstileSiteKey,
  turnstileSecretKey,
  smtpHost: () => optionalEnv('SMTP_HOST'),
  smtpPort: () => optionalPort('SMTP_PORT', booleanEnv('SMTP_SECURE', false) ? 465 : 587),
  smtpSecure: () => booleanEnv('SMTP_SECURE', false),
  smtpUser: () => optionalEnv('SMTP_USER'),
  smtpPass: () => optionalEnv('SMTP_PASS'),
  emailFrom: () => optionalEnv('EMAIL_FROM') || optionalEnv('SMTP_FROM')
};
