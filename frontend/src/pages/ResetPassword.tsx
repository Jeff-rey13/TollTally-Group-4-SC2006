import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { resetPasswordSchema } from '@tolltally/shared';
import { describeError } from '../api/client';
import { authApi } from '../api/endpoints';
import { Alert, Field, Page } from '../components/ui';
import { validate } from '../lib/form';

/**
 * Sets a new password from the one-time link in the reset email.
 */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(resetPasswordSchema, { token, password });
    if (password !== confirm) fieldErrors.confirm = 'The two passwords do not match';
    setErrors(fieldErrors);
    if (fieldErrors.token) setMessage(fieldErrors.token);
    if (!data || fieldErrors.confirm) return;
    setBusy(true);
    setMessage(null);
    try {
      await authApi.resetPassword(data.token, data.password);
      setDone(true);
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
      <div className="glass grid gap-5 p-6 sm:p-8">
        <h1 className="text-[2.5rem] leading-none font-black">Choose a new password</h1>
        {done ? (
          <>
            <Alert kind="success">
              Your password is changed and you were signed out on every device. Sign in with the new
              password.
            </Alert>
            <Link to="/sign-in" className="btn-primary min-h-12 text-base">
              Sign in
            </Link>
          </>
        ) : !token ? (
          <>
            <Alert kind="error">
              This page needs the link from the reset email. Ask for a new link if you no longer
              have it.
            </Alert>
            <Link to="/forgot-password" className="btn-secondary">
              Ask for a reset link
            </Link>
          </>
        ) : (
          <form className="grid gap-5" onSubmit={onSubmit} noValidate>
            {message && (
              <Alert kind="error">
                {message}{' '}
                <Link to="/forgot-password" className="font-bold underline">
                  Ask for a new link
                </Link>
              </Alert>
            )}
            <Field
              id="password"
              label="New password"
              error={errors.password}
              hint="At least 8 characters with a letter and a digit."
            >
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field id="confirm" label="Confirm new password" error={errors.confirm}>
              <input
                id="confirm"
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <button type="submit" className="btn-primary min-h-12 text-base" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </Page>
  );
}
