import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { healthApi } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { CookieNotice } from './CookieNotice';
import { ErrorBoundary } from './ErrorBoundary';
import { Alert, Loading, Page } from './ui';
import logoUrl from '../assets/tolltally-logo.png';

const DRIVER_LINKS = [
  { to: '/app', label: 'Overview' },
  { to: '/app/plan', label: 'Plan a trip' },
  { to: '/app/vehicles', label: 'Vehicles' },
  { to: '/app/history', label: 'History' },
];
const ADMIN_LINKS = [
  { to: '/admin/overview', label: 'Overview' },
  { to: '/admin/fuel-prices', label: 'Fuel prices' },
  { to: '/admin/erp-rates', label: 'ERP tariffs' },
  { to: '/admin/efficiency', label: 'Vehicle efficiency' },
];

/**
 * «boundary» AuthenticatedNavigationUI: header with role-specific navigation, the user's email and Sign out (FR-ACC-06),
 * plus the planning-only disclaimer (NFR-SAF-01).
 */
export function Shell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const health = useAsync(() => healthApi.get(), []);
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const isAdmin = user?.role === 'ADMINISTRATOR';
  let links: { to: string; label: string }[] = [];
  if (user) links = isAdmin ? ADMIN_LINKS : DRIVER_LINKS;
  let home = '/';
  if (user) home = isAdmin ? '/admin' : '/app';
  const demoMode = health.data?.routingProvider === 'mock';
  const routingNotReady = health.data?.routingReady === false;

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
      navigate('/sign-in', { replace: true });
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  let barClass = 'tt-bar';
  if (links.length === 0) barClass += ' tt-bar--plain';
  if (isAdmin) barClass += ' tt-bar--dark';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header ref={headerRef} className="tt-header">
        <div className={barClass}>
          <Link to={home} className="tt-brand">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[8px] bg-asphalt">
              <img src={logoUrl} alt="" width={37} height={28} className="h-7 w-auto" />
            </span>
            TollTally
            {isAdmin && (
              <span className="hidden rounded-[4px] bg-marking px-1.5 py-0.5 font-sans text-xs font-semibold text-ink sm:inline">
                Admin
              </span>
            )}
          </Link>
          {links.length > 0 && (
            <nav aria-label="Main" className="tt-nav">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.to === '/app'} className="nav-link">
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="tt-account text-sm">
            {loading && <span className="account-email">Checking your session…</span>}
            {!loading && user && (
              <>
                <span className="account-email" title={user.email}>
                  {user.email}
                </span>
                <button
                  type="button"
                  className="signout-btn"
                  disabled={signingOut}
                  onClick={handleSignOut}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </>
            )}
            {!loading && !user && (
              <>
                <Link to="/sign-in" className="btn-ghost text-ink">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary min-h-10 px-3.5">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
        {(demoMode || routingNotReady || signOutError) && (
          <div className="tt-notices">
            {routingNotReady && (
              <Alert kind="warning">
                <strong>Live routing is not set up.</strong> Add your OneMap email and password to
                backend/.env as ONEMAP_EMAIL and ONEMAP_PASSWORD, then restart TollTally. Until
                then, trip estimates cannot be calculated.
              </Alert>
            )}
            {demoMode && (
              <p className="justify-self-start rounded-control border border-[#efd78f] bg-amber-soft px-3 py-1.5 text-[13px] text-[#5c3a00] shadow-sm">
                <strong>Demo mode.</strong> Routes are simulated and fuel and parking prices are
                sample data; ERP rates are LTA&apos;s. Use these estimates to explore the app.
              </p>
            )}
            {signOutError && (
              <Alert kind="error">
                Sign out could not be completed. Check your connection and try again.
              </Alert>
            )}
          </div>
        )}
      </header>
      <main id="main-content" tabIndex={-1} className="relative z-0 min-w-0 flex-1">
        <ErrorBoundary key={location.pathname}>
          <Suspense
            fallback={
              <Page>
                <Loading what="Opening the page" />
              </Page>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="tt-footer px-4 pt-8 pb-7 text-[13px] sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl leading-relaxed">
            TollTally is for planning before travel. It gives no turn-by-turn directions, and every
            planned amount is an estimate. Actual costs are the amounts you record after travel.
          </p>
          <nav aria-label="Legal" className="flex flex-none gap-5">
            <Link to="/privacy">Privacy notice</Link>
            <Link to="/privacy#cookies">Cookies</Link>
          </nav>
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}
