import { env } from './env';
import nodemailer from 'nodemailer';
function requireEmailConfig() {
  const host = env.smtpHost();
  const port = env.smtpPort();
  const secure = env.smtpSecure();
  const user = env.smtpUser();
  const pass = env.smtpPass();
  const from = env.emailFrom();

  if (!host || !port || !user || !pass || !from) {
    throw new Error('SMTP is not fully configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM).');
  }

  return { host, port, secure, user, pass, from };
}

// Render the 6-digit code as an evenly-spaced row of monospace cells so the
// layout stays perfectly aligned in every email client.
function renderCodeCells(code: string): string {
  return code
    .split('')
    .map(
      (digit) =>
        `<td align="center" valign="middle" style="width:46px;height:56px;border:1px solid #2b3344;border-radius:10px;background:#0f1420;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;color:#ffffff;">${digit}</td>`
    )
    .join('<td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>');
}

export async function sendVerificationEmail(to: string, code: string, _opts?: { username?: string; isAdmin?: boolean }) {
  const config = requireEmailConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const codeCells = renderCodeCells(code);

  await transporter.sendMail({
    from: config.from,
    to,
    subject: `Your admin login code: ${code}`,
    text: [
      'Script Vault — admin login',
      '',
      `Your one-time login code is: ${code}`,
      '',
      'This code expires in 10 minutes and can be used only once.',
      'If you did not request it, you can safely ignore this email.',
    ].join('\n'),
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin login code</title>
</head>
<body style="margin:0;padding:0;background:#070a11;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070a11;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#10141d;border:1px solid #1d2533;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7c8aa5;">Script Vault</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Admin login code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#aeb8c9;">Use the one-time code below to sign in to the admin dashboard.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>${codeCells}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#7c8aa5;">This code expires in <strong style="color:#aeb8c9;">10 minutes</strong> and can be used only once. If you did not request it, simply ignore this message.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;border-top:1px solid #1d2533;background:#0c1019;">
              <p style="margin:0;font-size:11px;color:#56627a;">Script Vault &mdash; AES-256 encrypted private script hosting</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}