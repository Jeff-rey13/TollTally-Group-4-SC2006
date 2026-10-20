# TollTally

TollTally is a Singapore journey-cost planner. A signed-in driver keeps vehicle profiles, plans a trip, and receives an itemised estimate of fuel, Electronic Road Pricing (ERP) and parking with an estimated cost range. The driver can compare routes, optimise the departure time, plan a fuel top-up for a rented car, save the estimate, log what was actually paid and review spend over a period. An administrator maintains the fuel-price, ERP-rate and vehicle-efficiency reference data. The requirements are in the SRS and the build plan is in docs/implementation-plan.md.

The latest implementation review, fixes and outstanding acceptance checks are in [docs/code-review.md](docs/code-review.md).

## Running it locally

You need Node 20.19+, 22.12+ or 24+ and npm (the project is developed on Node 24). Install once, then start both servers with one command.

```
npm install
npm run dev
```

The first command creates backend/.env from backend/.env.example and generates the Prisma client. The second applies the database migrations to a local SQLite file, seeds the reference data and the administrator account, and starts the API on http://localhost:3000 and the web app on http://localhost:5173. Open the web app, register a driver account, add a vehicle and plan a trip.

The seeded administrator signs in as admin@tolltally.local with the password Admin1234 (both come from backend/.env). Administrators see the Fuel prices, ERP tariffs and Vehicle efficiency screens instead of the driver screens.

By default the routing provider is a mock that works offline. It offers a fixed set of Singapore places (type Jurong, Marina, Orchard, Changi and so on) and builds routes that pass through the seeded ERP charge points, so ERP pricing, route comparison and departure optimisation all behave as they would with a live provider. The estimate screen draws the route on a OneMap street map with the ERP gantries it is charged for. To use the real OneMap service, create a free account at https://www.onemap.gov.sg/apidocs/ and set ROUTING_PROVIDER=onemap, ONEMAP_EMAIL and ONEMAP_PASSWORD in backend/.env. OneMap returns one route, so distinct alternatives for route comparison come from the Google Routes API when GOOGLE_ROUTES_API_KEY is also set; without it the comparison screen reports that no alternative is available.

To run with live OneMap routing, real LTA ERP rates and a public link for demos, follow [DEMO-SETUP.md](DEMO-SETUP.md).

## Running it with Docker

```
docker compose up --build
```

The supplied Compose file runs a local HTTP demo in development mode. For a public deployment, use a trusted TLS reverse proxy, set NODE_ENV=production and provide a strong SESSION_SECRET.

This builds one image containing the API, the built web app and the Prisma CLI, applies migrations, seeds the reference data, and serves everything on http://localhost:3000 with the SQLite database on a named volume. Copy .env.example to .env in the repository root to change the administrator credentials, the session secret or the routing provider. The image can also be run on any host that accepts a Docker image, such as Render, Railway or Fly, with the same environment variables; use a persistent disk for /data.

## Configuration

All settings are environment variables read by the backend and documented in backend/.env.example. The important ones are DATABASE_URL (a SQLite file path in development), SESSION_SECRET and SESSION_TTL_MINUTES for the session cookie, ROUTING_PROVIDER (mock or onemap) with the OneMap and Google credentials, PARKING_PROVIDER (table, which looks up the nearest seeded carpark, or mock), TRAFFIC_PROVIDER and WEATHER_PROVIDER for the live road and weather card (LTA DataMall incidents with LTA_ACCOUNT_KEY, data.gov.sg forecasts without a key; `npm run feeds:check` tests both), the calculation policy values from Appendix D of the SRS (ERP boundary tolerance, fuel range percentage, route option count, departure window and interval, parking search radius, default parking duration and the freshness thresholds), and ADMIN_EMAIL with ADMIN_PASSWORD for the seeded administrator.

## User documentation

The release documentation required by SRS 2.6 lives in docs. The quick-start guide in docs/quick-start.md covers signing in, vehicle setup, trip planning, reading an estimate, comparing routes, saving and logging trips, and the renter top-up. The administrator guide in docs/administrator-guide.md explains the reference-data screens, effective dates, the overlap and validation rules, and why records are withdrawn rather than deleted. Inline help in the application itself explains fuel efficiency on the vehicle form, the rate sources and freshness flags in the cost derivation panel, and the fuel-level inputs on the top-up screen.

## Tests

```
npm test
```

This runs the backend unit tests for the pure calculation module and the API tests, which drive the Express app through Supertest against a separate SQLite test database with the mock routing adapter. Every test is named after the requirement it proves, for example FR-EST-05, so the acceptance evidence for SRS section 6.4 is a search for FR- across backend/test. The mapping from every requirement to its implementation and its test is written out in docs/requirements-traceability.md. The end-to-end test in frontend/e2e runs in a real browser at desktop and 360-pixel widths after installing a browser once with npx playwright install chromium inside the frontend folder, then npm run test:e2e. The CI workflow in .github/workflows/ci.yml runs the linter, the type checks, the build, the tests and a Docker build on every push.

The Lab 4 test design (equivalence classes and boundary values for the fuel top-up controller, basis path tests for `selectRate` and `recommendDeparture`) lives in backend/test/lab4. Each case records its actual output in backend/test/lab4/results when it runs. Run only those with `npx vitest run test/lab4` inside backend.

To run all backend and browser tests together, use `npm run test:all`. Browser tests use their own SQLite database and dedicated ports (3417 and 5417), so they do not change development accounts or reference records. On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

## Dependency security

Run `npm audit` after installing or updating dependencies. Review any proposed major upgrades before using `npm audit fix --force`.

Vitest 4.1.11 or later fixes [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). The root package also overrides Prisma's `deepmerge-ts` dependency to 8.0.0 to fix [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), while keeping Prisma and its client on matching versions. Remove this override when the selected Prisma release depends on a patched version itself. Commit `package-lock.json` with dependency changes and use `npm ci` for reproducible installs.

Prisma's CLI is also declared at the workspace root so npm 11 applies the override through the dependency tree. Keep this version aligned with `prisma` and `@prisma/client` in the backend package. The backend test runner uses the same Vite 7 release line as the frontend.

## Project layout

The repository is an npm workspace with three packages. The shared package holds the enumerations, the Zod validation schemas used by both the browser and the server, and the API response types. The backend package is the Express server: src/domain is the pure calculation module with no framework or database imports, src/adapters holds the routing and parking-rate adapters with mock implementations, src/modules holds one folder per SRS feature, and prisma holds the schema, migrations, seed data and the tool that builds the ERP gantry data from LTA's published files. The frontend package is the React application with one page per state in the dialog map.

## Reference data

The seed loads 74 ERP gantries at the positions in LTA's gantry map (data.gov.sg) with LTA's car rates effective 7 September 2026 (OneMotoring rate tables), HDB and mall parking rates, common vehicle efficiency figures, the 2026 public holidays and one reference fuel price per fuel type. Parking rates, efficiency figures and the fuel prices are development data, not authoritative figures. When LTA revises ERP rates, rebuild backend/prisma/data/charge-points.json with backend/prisma/tools/build_erp_data.py (see DEMO-SETUP.md); fuel prices, ERP rates and efficiency records can also be maintained through the administrator screens at any time.

TollTally is for planning before travel. It does not navigate, take payment, buy fuel, reserve parking or issue bills, and every amount it shows is an estimate.
