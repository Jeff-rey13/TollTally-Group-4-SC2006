import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { forgotPasswordSchema } from '@tolltally/shared';
import { describeError } from '../api/client';
import { authApi, healthApi } from '../api/endpoints';
import { Alert, Field, Page } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { validate } from '../lib/form';

/**
 * Asks for the account email and sends a one-time reset link. The answer is the same whether or
 * not the email is registered, so the page cannot be used to find accounts.
 */
export function ForgotPassword() {
  const health = useAsync(() => healthApi.get(), []);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(forgotPasswordSchema, { email });
    setError(errors.email);
    if (!data) return;
    setBusy(true);
    setMessage(null);
    try {
      await authApi.forgotPassword(data.email);
      setSentTo(data.email);
    } catch (err) {
      const d = describeError(err);
      setError(d.fields.email);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <div className="glass grid gap-5 p-6 sm:p-8">
        <div>
          <h1 className="text-[2.5rem] leading-none font-black">Reset your password</h1>
          <p className="mt-2 text-[15px] text-muted">
            Enter the email you registered with and we will send a link to choose a new password.
          </p>
        </div>
        {sentTo ? (
          <>
            <Alert kind="success">
              If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. It
              works once and expires after 30 minutes. Check your spam folder if it does not arrive.
            </Alert>
            {health.data?.mailReady === false && (
              <Alert kind="info">
                Email sending is not set up on this server yet, so the link was printed in the
                terminal where TollTally is running instead.
              </Alert>
            )}
            <Link to="/sign-in" className="btn-secondary">
              Back to sign in
            </Link>
          </>
        ) : (
          <form className="grid gap-5" onSubmit={onSubmit} noValidate>
            {message && <Alert kind="error">{message}</Alert>}
            <Field id="email" label="Email address" error={error}>
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
            <button type="submit" className="btn-primary min-h-12 text-base" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-sm text-muted">
              Remembered it?{' '}
              <Link to="/sign-in" className="font-bold text-mint-deep underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </Page>
  );
}
