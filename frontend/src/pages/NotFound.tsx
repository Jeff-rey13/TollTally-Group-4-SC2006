import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Page } from '../components/ui';

function SignArrow({ direction }: { direction: 'left' | 'up' | 'right' }) {
  const rotate = { left: 180, up: -90, right: 0 }[direction];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="h-8 w-8 flex-none"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path d="M4 16h18M15 7l9 9-9 9" fill="none" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

function SignRow({ children }: { children: ReactNode }) {
  return <li className="border-t-2 border-white/70 first:border-t-0">{children}</li>;
}

const rowClass =
  'flex min-h-16 w-full items-center gap-4 px-5 py-3 text-left font-display text-[1.75rem] leading-tight font-bold text-white transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none';

/**
 * Page not found, drawn as a direction sign: each row is a way back onto the map.
 */
export function NotFound() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const home = user ? (user.role === 'ADMINISTRATOR' ? '/admin' : '/app') : '/';

  useEffect(() => {
    document.title = 'Page not found · TollTally';
    return () => {
      document.title = 'TollTally';
    };
  }, []);

  return (
    <Page width="narrow">
      <div className="mx-auto max-w-md">
        <div className="rounded-[14px] bg-mint-deep p-2 shadow-[0_18px_40px_rgb(0_86_60/0.35)]">
          <div className="rounded-[9px] border-[3px] border-white">
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
              <span className="rounded-[4px] bg-marking px-2 py-0.5 font-display text-2xl font-extrabold text-ink">
                404
              </span>
              <h1 className="text-[2.25rem] leading-none font-black text-white">No road here</h1>
            </div>
            <ul className="border-t-[3px] border-white">
              <SignRow>
                <button type="button" className={rowClass} onClick={() => navigate(-1)}>
                  <SignArrow direction="left" />
                  Go back
                </button>
              </SignRow>
              <SignRow>
                <Link to={home} className={rowClass}>
                  <SignArrow direction="up" />
                  TollTally home
                </Link>
              </SignRow>
              {(!user || user.role === 'DRIVER') && (
                <SignRow>
                  <Link to={user ? '/app/plan' : '/sign-in'} className={rowClass}>
                    <SignArrow direction="right" />
                    {user ? 'Plan a trip' : 'Sign in'}
                  </Link>
                </SignRow>
              )}
            </ul>
          </div>
        </div>
        <p className="mt-5 text-center text-[15px] text-muted">
          Nothing lives at{' '}
          <span className="font-semibold break-all text-ink">{location.pathname}</span>. Check the
          address, or take one of the exits above.
        </p>
      </div>
    </Page>
  );
}
