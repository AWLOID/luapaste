'use client';

import { useEffect, useState } from 'react';

const COOKIE_CONSENT_KEY = 'sv_cookie_consent';
const COOKIE_CONSENT_VALUES = ['accepted', 'declined'] as const;

type ConsentValue = typeof COOKIE_CONSENT_VALUES[number];

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!stored || !COOKIE_CONSENT_VALUES.includes(stored as ConsentValue)) {
      setVisible(true);
    }
  }, []);

  function handleChoice(choice: ConsentValue | 'later') {
    if (choice === 'later') {
      setVisible(false);
      return;
    }
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-inner">
        <div className="cookie-banner-text">
          <svg className="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
            <path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" />
            <path d="M11 17v.01" /><path d="M7 14v.01" />
          </svg>
          <span>We use cookies to keep you signed in and improve your experience.</span>
        </div>
        <div className="cookie-banner-actions">
          <button className="cookie-btn cookie-btn-accept" onClick={() => handleChoice('accepted')}>
            Accept
          </button>
          <button className="cookie-btn cookie-btn-decline" onClick={() => handleChoice('declined')}>
            Decline
          </button>
          <button className="cookie-btn cookie-btn-later" onClick={() => handleChoice('later')}>
            Ask later
          </button>
        </div>
      </div>
    </div>
  );
}
