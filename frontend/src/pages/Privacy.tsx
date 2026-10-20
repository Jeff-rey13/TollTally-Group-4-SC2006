import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { PRIVACY_NOTICE_VERSION } from '@tolltally/shared';
import { describeError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field, Page, PageHeader } from '../components/ui';

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-title`} className="scroll-mt-28">
      <h2 id={`${id ?? title}-title`} className="text-2xl font-bold">
        {title}
      </h2>
      <div className="mt-2 grid gap-3 text-[16px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function updatedOn(version: string): string {
  const [y, m, d] = version.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Privacy notice (PDPA notification of purpose) with the cookie details and, for a signed-in
 * driver, the way to withdraw consent by deleting the account.
 */
export function Privacy() {
  return (
    <Page width="medium">
      <PageHeader
        title="Privacy notice"
        lede={`What TollTally stores about you, why, and how to remove it. Last updated ${updatedOn(PRIVACY_NOTICE_VERSION)}.`}
      />
      <div className="card grid gap-9 sm:p-8">
        <Section title="What we collect">
          <ul className="grid list-disc gap-1.5 pl-5">
            <li>
              Your account: email address, your password stored only as a salted one-way hash, the
              date you registered and the date you agreed to this notice. If you ask to reset your
              password, a one-time code is kept for 30 minutes, stored only as a hash.
            </li>
            <li>
              Vehicle profiles you add: display name, make and model, fuel type, ERP vehicle class,
              consumption rate and tank capacity.
            </li>
            <li>
              Trips you plan: start and end places, departure times, the route used and the cost
              estimate.
            </li>
            <li>Amounts you log after a trip, such as fuel, ERP and parking you actually paid.</li>
          </ul>
          <p>
            TollTally does not read your device location, does not take payments and has no
            analytics, advertising or tracking code. To keep the site running, the server counts how
            many requests each part of the site gets per hour, without recording who made them or
            from where.
          </p>
        </Section>

        <Section title="Why we use it">
          <p>
            Only to price the trips you plan, keep your vehicles and trip history for you, and
            compare your estimates with what you paid. Your data is not sold, shared for marketing
            or used to profile you.
          </p>
        </Section>

        <Section title="Who else sees it">
          <p>
            To find places and routes, the TollTally server sends your search text and the start and
            end points of a trip to OneMap, run by the Singapore Land Authority. Your email is never
            sent.
          </p>
          <p>
            Map images are loaded by your browser directly from OneMap, so OneMap receives your
            internet address when you view a map.
          </p>
          <p>
            The database sits with the hosting provider that runs the site. ERP rates and gantry
            positions come from tables LTA publishes; nothing about you is sent to LTA.
          </p>
          <p>
            For the road and weather card, the server downloads LTA's full list of current traffic
            incidents and NEA's forecast from data.gov.sg, then matches them to your route itself.
            Your route, places and account are not sent to either.
          </p>
        </Section>

        <Section id="cookies" title="Cookies and storage">
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Kept for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold whitespace-nowrap">tolltally.sid</td>
                  <td>
                    Essential cookie that keeps you signed in. It cannot be read by page scripts.
                  </td>
                  <td>
                    Until you sign out, or 30 minutes without activity. With Keep me signed in, 30
                    days.
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold whitespace-nowrap">tolltally.cookie-notice</td>
                  <td>
                    Local storage in your browser that remembers you closed the cookie notice.
                  </td>
                  <td>Until you clear your browser data</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Because the only cookie is needed for signing in, there is nothing to switch off. If you
            block it, you can still read this site but cannot sign in.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Your data stays until you delete your account. Deleting it removes your vehicle
            profiles, trips, estimates and logged costs at once.
          </p>
        </Section>

        <Section title="How it is protected">
          <p>
            The site is served over HTTPS, passwords are hashed, sign-in attempts are limited to
            slow down guessing, and every request checks that the trip or vehicle belongs to the
            person asking for it.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can correct your vehicle details at any time from Vehicles. You can withdraw your
            consent by deleting your account below. Questions about this notice go to the TollTally
            project team (NTU SC2006, lab group 2006-SCSF-B4).
          </p>
        </Section>

        <DeleteAccount />
      </div>
    </Page>
  );
}

function DeleteAccount() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.role !== 'DRIVER') return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Enter your password');
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(null);
    try {
      await authApi.deleteAccount(password);
      setUser(null);
      navigate('/', { replace: true, state: { accountDeleted: true } });
    } catch (err) {
      const d = describeError(err);
      setError(d.fields.password);
      if (!d.fields.password) setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-title"
      className="rounded-control border-[1.5px] border-red-200 bg-red-50/60 p-5"
    >
      <h2 id="delete-title" className="text-2xl font-bold">
        Delete your account
      </h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        This permanently removes {user.email} with every vehicle, trip and logged cost. It cannot be
        undone.
      </p>
      {!confirming ? (
        <button
          type="button"
          className="btn-secondary mt-4 border-red-300 text-red-800 hover:bg-red-100"
          onClick={() => setConfirming(true)}
        >
          Delete my account
        </button>
      ) : (
        <form className="mt-4 grid max-w-sm gap-4" onSubmit={onSubmit} noValidate>
          {message && <Alert kind="error">{message}</Alert>}
          <Field id="delete-password" label="Enter your password to confirm" error={error}>
            <input
              id="delete-password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn-primary bg-red-700 hover:bg-red-800"
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete account permanently'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setConfirming(false);
                setPassword('');
                setError(undefined);
              }}
            >
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
