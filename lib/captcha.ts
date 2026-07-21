import { env } from './env';

type TurnstileVerifyResponse = {
  success?: boolean;
};

export type CaptchaResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string,
  options: { required?: boolean } = {}
): Promise<CaptchaResult> {
  const secretKey = env.turnstileSecretKey();

  if (!secretKey) {
    if (options.required && process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'Captcha is not configured', status: 500 };
    }
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: 'Captcha is required', status: 400 };
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (remoteIp && remoteIp !== 'unknown') {
    body.set('remoteip', remoteIp);
  }

  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const verifyData = await verifyRes.json().catch(() => ({ success: false })) as TurnstileVerifyResponse;
  if (!verifyRes.ok || !verifyData.success) {
    return { ok: false, error: 'Captcha verification failed. Please try again.', status: 400 };
  }

  return { ok: true };
}
