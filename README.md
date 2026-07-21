# Roblox Script Vault

Private `.lua` / `.txt` raw script vault for Vercel + Supabase with AES-256-GCM encryption.

## How It Works

1. Everyone signs in with email, captcha, and a 6-digit email code.
2. The email in `ADMIN_EMAIL` becomes the admin account after code verification.
3. A normal user can upload only after the account is at least 10 hours old.
4. You upload a `.lua` or `.txt` file through the vault.
5. The server generates a long random secret slug.
6. The script content is encrypted with AES-256-GCM using a key derived from that slug.
7. Only `sha256(slug)` and encrypted ciphertext are stored in the database.
8. You receive the raw URL once. It is never stored or shown again.

```lua
loadstring(game:HttpGet("https://your-site.vercel.app/raw/VERY_LONG_SECRET.lua"))()
```

The raw URL is the secret. Anyone who has the exact URL and can use an allowed non-browser client can fetch the content.

## Security Model

| Access method | Result |
| --- | --- |
| Open raw URL in a browser | Access denied |
| Admin panel | Metadata only, no content preview |
| Read database directly | AES-256-GCM ciphertext only |
| Legacy plaintext row | Blocked by the app; re-upload securely |
| Allowed loader client with exact URL | Decrypts and returns the script |

Default raw access blocks normal browsers and unknown/minimal HTTP clients. If your executor sends an unrecognized User-Agent, set `RAW_ALLOW_UNKNOWN_CLIENTS=true`, or preferably set `RAW_USER_AGENT_REGEX` to a strict allowlist.

## Hardening Included

- AES-256-GCM content encryption with URL-secret-derived keys
- One-time raw URL reveal
- No raw CORS wildcard
- Browser navigation blocking for raw URLs
- Unknown raw HTTP clients blocked by default
- HMAC-signed HttpOnly session cookie
- `__Host-` session cookie prefix in production
- Email registration with 6-digit verification codes
- Admin access controlled by `ADMIN_EMAIL`
- SMTP-backed real email delivery for registration codes
- Cloudflare Turnstile captcha on registration code requests
- 10-hour minimum account age before normal users can publish
- User/admin roles, with normal users limited to upload + one-time link reveal
- Strong env validation for secrets and production captcha
- Persistent Supabase-backed login/action rate limiting
- Strict UUID/input validation on API routes
- No detailed database errors in client responses
- CSP and security headers, with `unsafe-eval` removed in production
- RLS enabled and public grants revoked in Supabase schema

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy your Project URL and service role key.

Run the schema again after pulling security updates. It adds user/email-code tables, script ownership, the rate-limit table/function, drops the legacy `secret_slug` column after hashing it, and revokes public table access.

Legacy rows with `is_encrypted = false` are no longer served. Re-upload those scripts to store them encrypted, then delete the old rows.

## Environment Variables

Set these in Vercel Project Settings:

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key, never anon key |
| `PUBLIC_APP_URL` | Recommended | Canonical app origin, e.g. `https://example.com` |
| `ADMIN_EMAIL` | Yes | Email address that receives admin access after verification |
| `AUTH_SECRET` | Yes | 48+ character random secret for session signing |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Production | Cloudflare Turnstile public site key |
| `TURNSTILE_SECRET_KEY` | Production | Cloudflare Turnstile secret key |
| `SMTP_HOST` | Registration | SMTP server hostname |
| `SMTP_PORT` | Registration | SMTP server port, usually `587` or `465` |
| `SMTP_SECURE` | Registration | `true` for implicit TLS on port `465`; otherwise `false` |
| `SMTP_USER` | Registration | SMTP username |
| `SMTP_PASS` | Registration | SMTP password or provider app password |
| `EMAIL_FROM` | Registration | Sender address, e.g. `Script Vault <no-reply@example.com>` |
| `RAW_USER_AGENT_REGEX` | Optional | Strict User-Agent allowlist for raw fetches |
| `RAW_ALLOW_UNKNOWN_CLIENTS` | Optional | Default `false`; set `true` only if needed |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

Do not use Cloudflare Turnstile test keys in production.
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` must come from the same Cloudflare Turnstile widget.
Registration emails are not simulated. Configure SMTP variables with a real provider so the 6-digit code can actually be delivered.

## Email Delivery

Use any SMTP provider: SendGrid, Mailgun, Brevo, Postmark, Gmail app password, or your domain mail provider.

For Vercel, add these in Project Settings -> Environment Variables:

```env
ADMIN_EMAIL=you@example.com
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password-or-app-password
EMAIL_FROM="Script Vault <no-reply@your-domain.com>"
```

Use `SMTP_SECURE=true` only when your provider says to use implicit TLS, usually port `465`. For port `587`, keep `SMTP_SECURE=false`.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the environment variables above.
4. Deploy with Node.js 20+.

## Local Dev

```bash
npm install
cp .env.example .env.local
npm run dev
```

Update `.env.local` with `ADMIN_EMAIL`, SMTP credentials, and a strong `AUTH_SECRET`.

Open `http://localhost:3000`.

## Maintenance

Use these checks before deploying:

```bash
npm audit --omit=dev
npm run typecheck
npm run build
```

Commit `package-lock.json` and deploy with `npm ci` for reproducible installs.
