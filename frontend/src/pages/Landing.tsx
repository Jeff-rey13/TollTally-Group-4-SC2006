import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui';

const ROUTE = 'M64 300 C154 290 224 240 284 180 S434 70 604 48';
const ROAD = 'M-60 330 L74 314 C164 304 234 254 294 194 S444 84 614 62 L720 50';

/**
 * The opening picture: a road seen from above, one ERP gantry across it, and a planned route that
 * draws itself along the left lane and lights up the charge as it passes under the gantry.
 */
function RoadScene() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 640 500"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="640" height="500" fill="#1e2629" />
      <g fill="none" strokeLinecap="butt">
        <path d={ROAD} stroke="rgb(255 255 255 / 0.18)" strokeWidth="138" />
        <path d={ROAD} stroke="#323d41" strokeWidth="130" />
        <path
          d={ROAD}
          stroke="#ffffff"
          strokeOpacity="0.75"
          strokeWidth="4"
          strokeDasharray="26 22"
        />
      </g>

      {/* Planned route in the left lane */}
      <path d={ROUTE} fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="14" />
      <path
        className="hero-route"
        d={ROUTE}
        pathLength={1}
        fill="none"
        stroke="#56c49a"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Gantry across the road */}
      <g>
        <path d="M150 196 L240 350" stroke="#8d989b" strokeWidth="12" strokeLinecap="square" />
        <path d="M150 196 L240 350" stroke="#b9c2c4" strokeWidth="4" />
        <rect x="138" y="184" width="24" height="24" fill="#5d686b" />
        <rect x="228" y="338" width="24" height="24" fill="#5d686b" />
        <g transform="translate(195 273) rotate(59.6)">
          <rect
            x="-30"
            y="-14"
            width="60"
            height="28"
            rx="3"
            fill="#f2b300"
            stroke="#1e2629"
            strokeWidth="3"
          />
          <text
            x="0"
            y="7"
            textAnchor="middle"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="20"
            fill="#1e2629"
          >
            ERP
          </text>
        </g>
        <g className="hero-charge" transform="translate(40 150)">
          <rect x="0" y="0" width="92" height="40" rx="5" fill="#ffffff" />
          <text
            x="46"
            y="28"
            textAnchor="middle"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="26"
            fill="#1e2629"
          >
            $2.00
          </text>
          <path d="M64 40 L96 70 L78 40 Z" fill="#ffffff" />
        </g>
      </g>

      {/* Start and destination, with the carpark sign at the end */}
      <circle cx="64" cy="300" r="13" fill="#ffffff" />
      <circle cx="64" cy="300" r="6" fill="#1e2629" />
      <g transform="translate(604 48)">
        <circle r="15" fill="#56c49a" stroke="#ffffff" strokeWidth="4" />
      </g>
      <g transform="translate(548 92)">
        <rect width="34" height="34" rx="4" fill="#1d4e9e" stroke="#ffffff" strokeWidth="2.5" />
        <text
          x="17"
          y="26"
          textAnchor="middle"
          fontFamily="Barlow Condensed, sans-serif"
          fontWeight="800"
          fontSize="24"
          fill="#ffffff"
        >
          P
        </text>
      </g>
    </svg>
  );
}

const EXAMPLE = [
  { label: 'Fuel', detail: '1.21 L at SGD 2.84 per litre', amount: '3.44' },
  { label: 'ERP', detail: '3 gantries from 08:35', amount: '2.00' },
  { label: 'Parking', detail: 'Marina Bay Sands, 90 min', amount: '4.50' },
];

function ExampleEstimate() {
  return (
    <figure className="rounded-panel bg-white text-ink shadow-[0_24px_60px_rgb(0_0_0/0.35)]">
      <div className="border-b border-line px-5 pt-4 pb-3">
        <p className="font-display text-2xl leading-tight font-bold">
          Jurong East to Marina Bay Sands
        </p>
        <p className="text-[15px] text-muted">Weekday, leaving at 08:15</p>
      </div>
      <dl className="divide-y divide-line px-5">
        {EXAMPLE.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="min-w-0">
              <span className="font-semibold">{row.label}</span>
              <span className="block text-[13px] text-muted">{row.detail}</span>
            </dt>
            <dd className="tabular font-semibold">{row.amount}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between gap-4 rounded-b-panel bg-ink px-5 py-3 text-white">
        <span className="text-[15px] text-white/75">One way, SGD</span>
        <span className="font-black text-[2rem] leading-none">9.94</span>
      </div>
      <figcaption className="sr-only">
        Example estimate: fuel 3.44, ERP 2.00 and parking 4.50 Singapore dollars, 9.94 in total.
      </figcaption>
    </figure>
  );
}

const STEPS = [
  {
    title: 'Add your car',
    body: 'Pick it from the list of common Singapore models, or enter your own consumption and tank size.',
  },
  {
    title: 'Plan the trip',
    body: 'Choose where and when. TollTally finds the ERP gantries on your route at the time you pass them and the carpark nearest your destination.',
  },
  {
    title: 'Log what you paid',
    body: 'Record the real amounts afterwards and see how close the estimate was, trip by trip.',
  },
];

export function Landing() {
  const { user } = useAuth();
  const location = useLocation();
  const accountDeleted = Boolean(
    (location.state as { accountDeleted?: boolean } | null)?.accountDeleted,
  );
  const start = user ? (user.role === 'ADMINISTRATOR' ? '/admin' : '/app') : '/register';

  return (
    <div>
      <section className="hero-road -mt-(--header-h)">
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pt-[calc(var(--header-h)+2.5rem)] pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:pt-[calc(var(--header-h)+4.5rem)] lg:pb-24">
          <div className="max-w-xl">
            {accountDeleted && (
              <div className="mb-6">
                <Alert kind="success">
                  Your account and everything stored with it were deleted.
                </Alert>
              </div>
            )}
            <h1 className="text-[3rem] leading-[0.95] font-black sm:text-[4.25rem]">
              Know what the drive costs before you turn the key.
            </h1>
            <p className="mt-5 max-w-lg text-[18px] leading-relaxed text-white/80">
              Plan a Singapore trip and see fuel, ERP and parking itemised, with an honest range.
              Compare routes and departure times, then log what you actually paid.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={start} className="btn-primary min-h-12 px-6 text-[17px]">
                {user ? 'Open TollTally' : 'Create an account'}
              </Link>
              {!user && (
                <Link
                  to="/sign-in"
                  className="btn-secondary min-h-12 border-white/35 bg-transparent px-6 text-[17px] text-white hover:border-white/60 hover:bg-white/10"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <div className="relative">
            <div className="h-[260px] overflow-hidden rounded-panel sm:h-[360px] lg:h-[460px]">
              <RoadScene />
            </div>
            <div className="relative -mt-10 ml-auto w-[min(100%,21rem)] sm:-mt-16 lg:absolute lg:-right-4 lg:-bottom-12 lg:mt-0">
              <ExampleEstimate />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="how-title"
        className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6 lg:pt-24"
      >
        <h2 id="how-title" className="text-[2.5rem] leading-none font-black">
          How it works
        </h2>
        <ol className="relative mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden="true"
            className="absolute top-[20px] right-[calc((100%-4rem)/3-22px)] left-[22px] hidden h-1 rounded-full bg-mint-deep md:block"
          />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative grid grid-cols-[44px_1fr] gap-4 md:block">
              <span className="relative z-10 grid h-11 w-11 place-items-center rounded-full border-4 border-sand bg-mint-deep font-display text-xl font-bold text-white">
                {i + 1}
              </span>
              <div className="md:mt-5">
                <h3 className="font-display text-[1.75rem] leading-tight font-bold">
                  {step.title}
                </h3>
                <p className="mt-1.5 max-w-sm text-[16px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="rental-title" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 rounded-panel border border-line bg-white p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
          <FuelGauge />
          <div>
            <h2 id="rental-title" className="text-[2rem] leading-tight font-black">
              Renting? Plan the top-up before you return the car.
            </h2>
            <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-muted">
              Enter the fuel level at pick-up and the level the rental company wants back. TollTally
              works out how many litres to buy and what they will cost.
            </p>
          </div>
        </div>
        <p className="mt-6 text-[13px] text-muted">
          TollTally is for planning before travel. It does not navigate, make payments, buy fuel,
          reserve parking or issue bills.
        </p>
      </section>
    </div>
  );
}

function FuelGauge() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 96" className="h-24 w-40">
      <path d="M16 86 A64 64 0 0 1 144 86" fill="none" stroke="#e3e7e1" strokeWidth="14" />
      <path d="M16 86 A64 64 0 0 1 80 22" fill="none" stroke="#00704f" strokeWidth="14" />
      <path d="M80 22 A64 64 0 0 1 125 41" fill="none" stroke="#f2b300" strokeWidth="14" />
      <path d="M80 86 L118 50" stroke="#1e2629" strokeWidth="5" strokeLinecap="round" />
      <circle cx="80" cy="86" r="8" fill="#1e2629" />
    </svg>
  );
}
