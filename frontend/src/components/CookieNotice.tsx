import { useState } from 'react';
import { Link } from 'react-router';

const STORAGE_KEY = 'tolltally.cookie-notice';
const NOTICE_VERSION = '1';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === NOTICE_VERSION;
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, NOTICE_VERSION);
  } catch {
    // Storage blocked (private window, strict settings): the notice simply shows again next visit.
  }
}

/**
 * Cookie notice. TollTally sets one strictly necessary cookie (the sign-in session) and no
 * analytics, advertising or tracking cookies, so there is nothing to opt in to or out of; the
 * notice tells people that plainly and links to the privacy notice. Only the fact that the notice
 * was dismissed is kept, in this browser's local storage.
 */
export function CookieNotice() {
  const [open, setOpen] = useState(() => !readDismissed());
  if (!open) return null;
  return (
    <section className="cookie-notice" aria-labelledby="cookie-notice-title" role="region">
      <h2 id="cookie-notice-title" className="text-xl font-bold">
        One cookie, to keep you signed in
      </h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-white/80">
        TollTally uses a single essential cookie for your sign-in session. There are no analytics,
        advertising or tracking cookies.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary min-h-10 bg-marking px-4 text-ink hover:bg-[#ffc81a]"
          onClick={() => {
            rememberDismissed();
            setOpen(false);
          }}
        >
          Got it
        </button>
        <Link
          to="/privacy#cookies"
          className="text-[15px] font-semibold text-white underline underline-offset-4"
        >
          How TollTally uses your data
        </Link>
      </div>
    </section>
  );
}
