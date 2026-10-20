import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { loginSchema } from '@tolltally/shared';
import { describeError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field, Page } from '../components/ui';
import { validate } from '../lib/form';

/**
 * «boundary» SignInUI (UC-02).
 */
export function SignIn() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(loginSchema, { email, password, remember });
    setErrors(fieldErrors);
    if (!data) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await authApi.login(data);
      setUser(res.user);
      const home = res.user.role === 'ADMINISTRATOR' ? '/admin' : '/app';
      const target = from && (from === home || from.startsWith(`${home}/`)) ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      const d = describeError(err);
      setErrors(d.fields);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <form className="glass grid gap-5 p-6 sm:p-8" onSubmit={onSubmit} noValidate>
        <div>
          <h1 className="text-[2.5rem] leading-none font-black">Sign in</h1>
          <p className="mt-1 text-[15px] text-muted">
            Use the email address and password you registered with.
          </p>
        </div>
        {message && <Alert kind="error">{message}</Alert>}
        <Field id="email" label="Email address" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-[15px]" htmlFor="remember">
            <input
              id="remember"
              type="checkbox"
              className="h-5 w-5 flex-none accent-mint-deep"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Keep me signed in for 30 days
          </label>
          <Link
            to="/forgot-password"
            className="text-[15px] font-semibold text-mint-deep underline underline-offset-2"
          >
            Forgot your password?
          </Link>
        </div>
        <button type="submit" className="btn-primary min-h-12 text-base" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm text-muted">
          New to TollTally?{' '}
          <Link to="/register" className="font-bold text-mint-deep underline">
            Register an account
          </Link>
        </p>
      </form>
    </Page>
  );
}
