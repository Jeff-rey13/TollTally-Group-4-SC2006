import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerSchema } from '@tolltally/shared';
import { describeError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field, Page } from '../components/ui';
import { validate } from '../lib/form';

/**
 * «boundary» RegistrationUI (UC-01).
 */
export function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(registerSchema, {
      email,
      password,
      acceptPrivacy,
    });
    if (password !== confirm) fieldErrors.confirm = 'The two passwords do not match';
    setErrors(fieldErrors);
    if (!data || fieldErrors.confirm) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await authApi.register(data);
      setUser(res.user);
      navigate('/app', { replace: true });
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
          <h1 className="text-[2.5rem] leading-none font-black">Register</h1>
          <p className="mt-1 text-[15px] text-muted">
            An account keeps your vehicles, trips and history private to you.
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
        <Field
          id="password"
          label="Password"
          error={errors.password}
          hint="At least 8 characters with a letter and a digit."
        >
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm}>
          <input
            id="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div>
          <label
            className="flex items-start gap-3 text-[15px] leading-snug"
            htmlFor="acceptPrivacy"
          >
            <input
              id="acceptPrivacy"
              type="checkbox"
              className="mt-0.5 h-5 w-5 flex-none accent-mint-deep"
              checked={acceptPrivacy}
              aria-invalid={errors.acceptPrivacy ? true : undefined}
              aria-describedby={errors.acceptPrivacy ? 'acceptPrivacy-error' : undefined}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
            />
            <span>
              I agree to TollTally storing my account, vehicles and trips as described in the{' '}
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener"
                className="font-semibold text-mint-deep underline underline-offset-2"
              >
                privacy notice
              </Link>
              .
            </span>
          </label>
          {errors.acceptPrivacy && (
            <p className="field-error" id="acceptPrivacy-error" role="alert">
              {errors.acceptPrivacy}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary min-h-12 text-base" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-sm text-muted">
          Already registered?{' '}
          <Link to="/sign-in" className="font-bold text-mint-deep underline">
            Sign in
          </Link>
        </p>
      </form>
    </Page>
  );
}
