import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { env } from '@/lib/env';
import CookieConsent from '@/components/CookieConsent';
import './globals.css';

export const metadata: Metadata = {
  title: 'Script Vault',
  description: 'Private raw script vault with AES-256-GCM encryption',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#101114',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const turnstileSiteKey = env.turnstileSiteKey();

  return (
    <html lang="en">
      <body>
        {turnstileSiteKey ? (
          <Script
            id="cloudflare-turnstile"
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
          />
        ) : null}
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
