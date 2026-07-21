'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'auto' | 'light' | 'dark';
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

// Falls back to the same default site key used server-side in lib/env.ts, so the
// captcha widget still renders even when NEXT_PUBLIC_TURNSTILE_SITE_KEY was not
// inlined into the client bundle at build time (a common Vercel misconfiguration).
const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAADl7nM8RNT-qeW3H';
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY;
type Step = 'email' | 'code';

export default function LoginForm() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || step !== 'email') return;
    const tryRender = () => {
      if (!window.turnstile || !captchaRef.current || widgetId.current) return false;
      widgetId.current = window.turnstile.render(captchaRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
      return true;
    };
    if (tryRender()) return;
    const id = window.setInterval(() => {
      if (tryRender()) window.clearInterval(id);
    }, 300);
    return () => window.clearInterval(id);
  }, [step]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    if (SITE_KEY && !captchaToken) {
      setError('Please complete the verification challenge.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), captchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send the login code.');
        if (SITE_KEY && window.turnstile && widgetId.current) {
          window.turnstile.reset(widgetId.current);
          setCaptchaToken('');
        }
        return;
      }
      setInfo('If this address is authorized, a 6-digit code has been emailed to it.');
      setStep('code');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid code.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card login-card center-page" style={{ display: 'block' }}>
      {/* The Turnstile API script is loaded once in app/layout.tsx with
          ?render=explicit; here we only render the widget via window.turnstile. */}
      <div className="brand-mark"><span /></div>
      <p className="eyebrow">Script Vault</p>
      <h2 style={{ fontSize: 26, marginBottom: 6 }}>Admin sign in</h2>
      <p className="muted small" style={{ marginBottom: 22 }}>
        Access is restricted to the administrator. Enter your email to receive a one-time login code.
      </p>

      {step === 'email' ? (
        <form className="stack" onSubmit={requestCode} style={{ marginTop: 0 }}>
          <label>
            <span>Admin email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </label>
          {SITE_KEY ? <div className="captcha-shell"><div className="captcha-widget" ref={captchaRef} /></div> : null}
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send login code'}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={verifyCode} style={{ marginTop: 0 }}>
          {info ? <p className="notice">{info}</p> : null}
          <div className="code-verify-section">
            <p className="code-verify-label">Enter the 6-digit code sent to your email</p>
            <input
              className="code-input-single"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/[^0-9]/g, ''))}
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setStep('email');
              setCode('');
              setError('');
              setInfo('');
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}