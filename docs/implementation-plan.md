# TollTally implementation plan

Prepared 15 September 2026 from the SRS version 1.3, the Lab 2 technology stack report of 13 September 2026 and the dialog map. The folder this plan lives in was empty when it was written, so everything below starts from zero. The plan is organised so that each milestone ends with something running and tested, and so that every test carries the identifier of the requirement it proves, which turns the acceptance evidence required by SRS section 6.4 into a grep over the test names.

This plan was written before the code. The application was then built from it on the same day, so read it as the design rationale rather than as a description of the current tree. Two decisions changed during implementation. Passwords are hashed with Node's built in scrypt rather than argon2, which removes a native module that does not always build on Windows while still meeting FR-ACC-03. The estimate stores its own calculation time, which SRS 6.1 asks for and which makes the NFR-PER-01 budget measurable rather than assumed. What was actually built, and which test proves each requirement, is recorded in requirements-traceability.md.

## 1. Shape of the system

TollTally is one Express server that exposes a JSON API under /api and, in production, also serves the built React application, so the browser and the API share an origin and the session cookie needs no cross-site configuration. The server talks to the database through Prisma, to the routing provider and the parking-rate source through two adapter classes, and to nothing else. All cost arithmetic lives in a pure TypeScript module with no imports from Express, Prisma or the adapters, so it can be unit tested with plain values and reused unchanged by the estimate, route comparison, departure optimisation and top-up features.

A trip estimate flows as follows. The browser posts the validated trip form. The trips service checks the session, checks that the vehicle profile belongs to the caller, stores the Trip and asks the routing adapter for a route. The domain module turns the route geometry into charge-point crossings, prices fuel, road usage and parking from the reference tables, combines the components into a total with bounds, and returns a structure that the service persists as the CostEstimate and its CostComponents. The browser receives the estimate together with its derivation data, so the cost derivation view needs no second request.

## 2. Decisions to lock in the first week

The stack is the one the team accepted in the Lab 2 report. TypeScript everywhere, React with Vite on the front, Express on the back, Prisma over SQLite during development and PostgreSQL at deployment, decimal.js for money, express-session with a database session store, argon2 for password hashing, Zod for validation, Vitest, Supertest and Playwright for tests, GitHub Actions for CI and a single Docker image for deployment. Tailwind CSS is the better fit for the component library slot because the UI mockups in the SRS use a custom dark theme rather than Material styling.

One caveat on the SQLite-first decision before the team commits. Prisma requires the datasource provider to be a literal string, so the move to PostgreSQL means editing the schema and regenerating the migrations folder from scratch against a PostgreSQL database, not just changing a connection string. SQLite also stores Decimal columns with floating-point affinity, so the exact NUMERIC argument in the report only holds once the team is on PostgreSQL, and older Prisma versions do not accept enum types on the sqlite provider at all. None of this blocks starting on SQLite, but the switch should be scheduled as a milestone task in October rather than left to the week of the demo, and the CI workflow should run the test suite against a PostgreSQL service container from that point on. If the team would rather avoid the switch entirely, a docker compose file with a single postgres service is one command to start and removes the problem.

The seven items in Appendix D need concrete values before the code that depends on them is written. The recommended defaults follow.

TBD-01, routing service. Use OneMap for address search and for the default drive route, and the Google Routes API with alternative routes enabled for the distinct options that UC-11 needs, since OneMap does not return alternatives. Time out provider calls at five seconds and surface the retryable error the SRS asks for.

TBD-02, reference data sources. Seed ERP rates from the LTA DataMall ERP Rates dataset and charge-point locations from the ERP gantry dataset on data.gov.sg. Seed public holidays from the data.gov.sg holidays dataset. Enter fuel prices by hand from the brand price boards through the administrator screen, and seed efficiency defaults from a short hand-made list of common models.

TBD-03, passwords and sessions. Require at least eight characters containing a letter and a digit. Expire sessions after thirty minutes of inactivity with the cookie refreshed on each request.

TBD-04, parking rate service. Do not integrate a live parking API in the first release. Seed a ParkingRate table from HDB carpark data with the published half-hour rates plus a hand-made list of central carparks, and implement the Parking Rate Service adapter as a nearest-carpark lookup over that table within one kilometre of the destination, returning unavailable beyond that.

TBD-05, freshness, tolerance and range policy. Treat fuel prices as stale after seven days, parking rates after thirty days and ERP rates after one hundred and eighty days. Use a five-minute boundary tolerance for ERP crossings. Derive the estimate range by widening the fuel component by five percent either side, widening an ERP crossing near a boundary to the adjacent rate, and keeping parking point-valued.

TBD-06, one price per fuel type. Take the most recently recorded non-withdrawn price for the fuel type regardless of brand, and show the brand in the derivation view.

TBD-07, option counts and budgets. Request three route options. Price departure slots at fifteen-minute intervals across sixty minutes either side of the planned time, which is nine slots. The route is fetched once and only the ERP timing is recomputed per slot, so the ten-second budget is comfortable.

## 3. Repository layout

Use npm workspaces with three packages so the frontend and backend share one lockfile, one lint configuration and one test command.

```
Tolltally/
  package.json                 workspaces and root scripts (dev, build, test, lint)
  docker-compose.yml           optional postgres service
  Dockerfile
  .github/workflows/ci.yml
  docs/
    implementation-plan.md     this file
  shared/                      types and Zod schemas used by both sides
    src/
      enums.ts                 FuelType, VehicleClass, DayType, OwnershipType and the rest
      schemas/                 Zod schemas for every request body
      api.ts                   response DTO types
  backend/
    prisma/
      schema.prisma
      migrations/
      seed.ts                  admin user, charge points, ERP rates, holidays, parking, efficiency
    src/
      index.ts                 starts the server
      app.ts                   builds the Express app (imported by Supertest)
      config.ts                environment variables parsed with Zod
      lib/                     prisma client, decimal helpers, time helpers
      middleware/              session, requireAuth, requireRole, errorHandler
      domain/                  the pure calculation module (section 5)
      adapters/
        routing/               RoutingService.ts, OneMapRoutingAdapter.ts, GoogleRoutesAdapter.ts, MockRoutingAdapter.ts
        parking/               ParkingRateService.ts, TableParkingAdapter.ts, MockParkingAdapter.ts
      modules/
        auth/                  routes.ts, service.ts
        vehicles/
        locations/
        trips/                 plan, estimate, derivation
        optimisation/          compare routes, optimise departure
        topup/
        records/               save, log, history
        admin/                 fuel prices, ERP rates, efficiency records
    test/                      Vitest unit tests and Supertest API tests
  frontend/
    src/
      main.tsx, App.tsx, router.tsx
      api/                     typed fetch client, one function per endpoint
      pages/                   one folder per dialog-map state
      components/              form fields, money display, range badge, layout shell
      hooks/
    e2e/                       Playwright specs
```

The root dev script runs the backend with tsx in watch mode on port 3000 and the Vite dev server on port 5173 with a proxy that forwards /api to the backend, so cookies work in development exactly as in production. The root build script builds shared, then backend, then frontend, and the backend serves frontend/dist when NODE_ENV is production.

## 4. Data model in Prisma

The entity class diagram maps onto Prisma almost one to one. Three simplifications are worth making deliberately. Driver and Administrator become a role column on User, because the diagram already shows them as subtypes sharing the User key and the SRS says Renter is a profile attribute, not a role. EstimateRange folds into two columns on CostEstimate. RouteOption and DepartureSlot are returned in API responses but not stored, because comparison and optimisation results are recomputed on demand and the saved snapshot only needs the chosen route, which is a Route row. If the Lab 3 design review wants the diagram and the schema to match exactly, those two tables can be added later without changing anything else.

The sketch below shows the intended shape. Follow the current Prisma quickstart for the exact generator and driver syntax of the version you install.

```prisma
enum Role          { DRIVER ADMINISTRATOR }
enum OwnershipType { OWNED RENTED }
enum FuelType      { PETROL_92 PETROL_95 PETROL_98 DIESEL }
enum VehicleClass  { PASSENGER_CAR_LGV_TAXI MOTORCYCLE HGV_SMALL_BUS VHGV_BIG_BUS }
enum DayType       { WEEKDAY SATURDAY SUNDAY_PUBLIC_HOLIDAY }
enum TripStatus    { PLANNED ESTIMATED SAVED COMPLETED }
enum ComponentType { FUEL ROAD_USAGE PARKING }
enum FuelLevelUnit { LITRES TANK_FRACTION PERCENT }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(DRIVER)
  registeredAt DateTime @default(now())
  vehicles     VehicleProfile[]
  trips        Trip[]
}

model Session {            // shape required by the Prisma session store
  id        String   @id
  sid       String   @unique
  data      String
  expiresAt DateTime
}

model VehicleProfile {
  id              String        @id @default(cuid())
  driverId        String
  displayName     String
  make            String?
  model           String?
  ownershipType   OwnershipType
  fuelType        FuelType
  vehicleClass    VehicleClass  @default(PASSENGER_CAR_LGV_TAXI)
  consumptionRate Decimal       // litres per 100 km
  tankCapacity    Decimal       // litres
  isArchived      Boolean       @default(false)
  driver          User          @relation(fields: [driverId], references: [id])
  trips           Trip[]
}

model VehicleEfficiencyRecord {
  id              String  @id @default(cuid())
  make            String
  model           String
  consumptionRate Decimal
  @@unique([make, model])
}

model Trip {
  id                     String     @id @default(cuid())
  driverId               String
  vehicleProfileId       String
  originName             String
  originLat              Float
  originLng              Float
  destinationName        String
  destinationLat         Float
  destinationLng         Float
  departureTime          DateTime   // stored in UTC
  isReturnTrip           Boolean    @default(false)
  returnDepartureTime    DateTime?
  parkingDurationMin     Int
  parkingDurationAssumed Boolean    @default(false)
  status                 TripStatus @default(PLANNED)
  savedAt                DateTime?
  createdAt              DateTime   @default(now())
  routes                 Route[]
  estimate               CostEstimate?
  topUpPlan              FuelTopUpPlan?
  log                    TripLog?
}

model Route {
  id             String  @id @default(cuid())
  tripId         String
  isReturnLeg    Boolean @default(false)
  distanceKm     Decimal
  drivingTimeSec Int
  geometry       String  // encoded polyline from the provider
  provider       String
}

model CostEstimate {
  id                String   @id @default(cuid())
  tripId            String   @unique
  total             Decimal
  totalIsLowerBound Boolean
  lowerBound        Decimal
  upperBound        Decimal? // null while any component is unavailable
  calculatedAt      DateTime @default(now())
  components        CostComponent[]
}

model CostComponent {
  id                String        @id @default(cuid())
  estimateId        String
  type              ComponentType
  isReturnLeg       Boolean       @default(false)
  amount            Decimal?
  lowerBound        Decimal?
  upperBound        Decimal?
  isAvailable       Boolean
  unavailableReason String?
  sourceRecordedAt  DateTime?
  isStale           Boolean       @default(false)
  fuelPriceId       String?       // snapshot links for FR-ADM-10
  parkingRateId     String?
  crossings         ChargePointCrossing[]
}

model ChargePoint {
  id         String  @id @default(cuid())
  name       String
  zoneId     String
  lat        Float
  lng        Float
  headingDeg Float   // charged direction of travel
  isActive   Boolean @default(true)
  rates      ERPRate[]
}

model ERPRate {
  id            String       @id @default(cuid())
  chargePointId String
  vehicleClass  VehicleClass
  dayType       DayType
  startTime     String       // "07:30" Singapore local time
  endTime       String       // "08:00"
  rate          Decimal
  effectiveDate DateTime
  recordedAt    DateTime     @default(now())
  isWithdrawn   Boolean      @default(false)
}

model ChargePointCrossing {
  id                    String   @id @default(cuid())
  componentId           String
  chargePointId         String
  erpRateId             String?
  adjacentErpRateId     String?
  estimatedCrossingTime DateTime
  charge                Decimal?
  nearPeriodBoundary    Boolean  @default(false)
  isExcluded            Boolean  @default(false)
  exclusionReason       String?
}

model ParkingRate {
  id                String   @id @default(cuid())
  carparkName       String
  lat               Float
  lng               Float
  ratePerPeriod     Decimal
  chargingPeriodMin Int
  roundingRule      String   @default("CEIL")
  source            String
  recordedAt        DateTime @default(now())
}

model FuelPrice {
  id          String   @id @default(cuid())
  brand       String
  fuelType    FuelType
  price       Decimal  // SGD per litre
  recordedAt  DateTime @default(now())
  isWithdrawn Boolean  @default(false)
}

model FuelTopUpPlan {
  id                    String        @id @default(cuid())
  tripId                String        @unique
  fuelPriceId           String
  pickUpLevel           Decimal
  requiredReturnLevel   Decimal
  levelUnit             FuelLevelUnit
  projectedReturnVolume Decimal
  shortfall             Decimal
  topUpVolume           Decimal
  estimatedCost         Decimal
  createdAt             DateTime      @default(now())
}

model TripLog {
  id                    String   @id @default(cuid())
  tripId                String   @unique
  actualFuelCost        Decimal?
  actualRoadUsageCharge Decimal?
  actualParkingFee      Decimal?
  actualTotal           Decimal
  varianceAbsolute      Decimal?
  variancePercent       Decimal?
  loggedAt              DateTime @default(now())
}

model PublicHoliday {
  date DateTime @id
  name String
}
```

Three rules keep the snapshot requirements honest. Reference records are never deleted once an estimate points at them, so fuel prices and ERP rates carry an isWithdrawn flag and the administrator withdraw action sets that flag. A saved estimate is never recomputed, so the estimate service must refuse to overwrite the CostEstimate of a Trip whose status is SAVED or COMPLETED. Every query for vehicles, trips, plans and logs filters by the caller's user id, which is how NFR-SEC-05 is enforced without a permissions framework.

The lifecycle of a Trip is worth agreeing on now because several requirements depend on it. Planning a trip creates the row with status PLANNED and immediately runs the estimate, which stores the Route and CostEstimate and moves the status to ESTIMATED. Re-running the estimate on the same trip replaces the Route and CostEstimate rows in one transaction. Save Trip sets status SAVED and savedAt, and only SAVED and COMPLETED trips appear in history, which satisfies NFR-REL-03. If the same driver plans a trip whose vehicle, origin, destination, departure time and return details all match an existing SAVED trip, the service updates that trip instead of creating another, which is FR-REC-02. Logging actual costs creates the TripLog and sets status COMPLETED. Unsaved ESTIMATED trips can be pruned by a periodic cleanup once the app is live, and simply ignored until then.

## 5. The pure calculation module

Everything in backend/src/domain takes plain values and Decimal instances and returns plain objects. It never rounds except in the single presentation helper, it never reads the clock, and it never touches the database. That makes it the first thing to build and the easiest thing to test, and it is where the marks for the logic in SRS section 7 are earned.

```ts
// money.ts
type Money = Decimal                       // decimal.js, never a JS number
formatMoney(value: Money): string          // two decimals, half-up, presentation only

// fuel.ts                                  FR-EST-02, FR-EST-03
tripFuelVolume(distanceKm, consumptionLPer100Km): Decimal
tripFuelCost(volumeL, pricePerLitre): Decimal

// fuelLevel.ts                             FR-REN-02, section 6.2
toLitres(value, unit, tankCapacityL): Decimal

// topUp.ts                                 FR-REN-04 to FR-REN-07
planTopUp({ pickUpL, requiredReturnL, tripFuelL, pricePerLitre })
  -> { projectedReturnL, shortfallL, topUpL, cost, outcome }
     // outcome is TOP_UP, NONE_NEEDED or REFUEL_EN_ROUTE

// dayType.ts
dayTypeFor(instant, holidays): DayType     // evaluated in Asia/Singapore

// crossings.ts                             FR-EST-01, FR-EST-04
detectCrossings(polyline, chargePoints, drivingTimeSec, departureTime)
  -> { chargePointId, crossingTime, distanceAlongRouteKm }[]

// erp.ts                                   FR-EST-04 to FR-EST-06, FR-ADM-05, FR-ADM-06
selectRate(rates, { chargePointId, vehicleClass, dayType }, crossingTime, toleranceMin)
  -> { rate | null, adjacent | null, nearBoundary }
roadUsage(crossings, rates, vehicleClass, holidays, toleranceMin)
  -> { items, subtotal, lower, upper, excluded }
periodsOverlap(a, b): boolean              // used by the administrator validation

// parking.ts                               FR-EST-07, FR-EST-08
parkingCost({ durationMin, ratePerPeriod, chargingPeriodMin, roundingRule })
  -> { periods, cost }

// estimate.ts                              FR-EST-09 to FR-EST-11, section 7.3
combine(components) -> { total, lower, upper | null, isLowerBound, unavailable }

// ranking.ts                               FR-OPT-03 to FR-OPT-05, FR-OPT-07, FR-OPT-08
compareRoutes(options) -> { cheapestId | null, indistinguishable, excluded }
recommendDeparture(slots, plannedTime)
  -> { best, saving, withinMargin, plannedIsCheapest, allIdentical }

// variance.ts, spend.ts                    FR-REC-05, FR-REC-06, FR-REC-08
variance(estimated, actual) -> { absolute, percent } | NOT_APPLICABLE | NOT_LOGGED
aggregateSpend(logs) -> { total, varianceTotal, count }
```

Crossing detection is the one algorithm that is not spelled out in the SRS. Decode the provider's polyline into points, and for each active charge point compute the shortest distance from the charge point to every segment of the polyline. If that distance is under twenty-five metres and the bearing of the nearest segment is within forty-five degrees of the charge point's charged heading, the route crosses that point. The fraction of the route length at which the crossing occurs, multiplied by the total driving time, gives the cumulative driving time, and adding it to the departure time gives the crossing time that FR-EST-04 asks for. Haversine distance and point-to-segment projection are about forty lines and need no library.

The range policy is the other place where the team makes a design choice rather than reading one off the SRS. With the defaults in section 2, a fuel component has bounds of ninety-five and one hundred and five percent of its point value, an ERP crossing whose time is within the tolerance of a period boundary has bounds equal to the lower and higher of the two adjacent rates, and a parking component has equal bounds. The total's bounds are the sums of the component bounds. When any component is unavailable the upper bound is null and the total is labelled a lower bound, which is exactly the rule in section 7.3. Route comparison treats two options as indistinguishable when their ranges overlap, and departure optimisation labels a saving as within the margin of error when it is smaller than the range width of the recommended slot.

Write the worked example from SRS section 7.5 as the first test file. Route A and Route B, the renter extension and the historical-cost extension give three concrete assertions with known answers, and getting them to pass proves the decimal plumbing before any HTTP exists.

## 6. External service adapters

Both adapters are interfaces with production implementations and a mock, chosen by an environment variable so tests and the CI pipeline never make network calls.

```ts
export interface RoutingService {
  search(query: string): Promise<Location[]>; // Singapore matches only
  route(request: RouteRequest): Promise<RouteResult>; // the default drive route
  alternatives(request: RouteRequest, max: number): Promise<RouteResult[]>; // may be empty
}
export type RouteRequest = { origin: LatLng; destination: LatLng; departureTime: Date };
export type RouteResult = {
  distanceKm: string;
  drivingTimeSec: number;
  geometry: LatLng[];
  provider: string;
};

export interface ParkingRateService {
  nearest(destination: LatLng): Promise<ParkingRateResult | Unavailable>;
}
```

OneMapRoutingAdapter implements search with the OneMap search endpoint, which needs no token, and route with the OneMap routing endpoint, which needs a token obtained from an email and password and refreshed every three days. GoogleRoutesAdapter implements alternatives, and a CompositeRoutingAdapter delegates each method to whichever provider handles it. MockRoutingAdapter returns fixtures keyed by origin and destination name, including one fixture that throws a timeout so the retryable error path of UC-06.EX.2 has a test. TableParkingAdapter queries the ParkingRate table for the nearest row within one kilometre using a haversine expression, and MockParkingAdapter returns a fixed rate or a fixed unavailable result.

Adapters throw a single ExternalServiceError with a kind of TIMEOUT, MALFORMED or UNAVAILABLE. The trips service catches it and maps a routing failure to the no-estimate response and a parking failure to an unavailable parking component, so the rest of the estimate is still shown, which is FR-EST-08 and NFR-REL-02. Nothing outside the adapters folder imports a provider SDK or parses a provider response, which is NFR-MAI-01.

## 7. Backend API

All routes sit under /api, accept and return JSON, and rely on the session cookie. Every protected route passes through requireAuth, administrator routes also pass through requireRole, and every request body is parsed with the Zod schema from shared before the service sees it. Errors come back in one shape so the frontend can place them next to fields.

```
{ "error": { "code": "VALIDATION", "message": "...", "fields": { "consumptionRate": "must be greater than 0" } } }
```

The endpoints, grouped by use case.

```
Account and authentication                       UC-01, UC-02, UC-03
POST   /api/auth/register       { email, password }        creates a Driver, starts a session
POST   /api/auth/login          { email, password }        one generic error on failure
POST   /api/auth/logout                                    destroys the server-side session
GET    /api/auth/me                                        current user and role, or 401

Vehicle and trip setup                           UC-04, UC-05
GET    /api/vehicles                                       caller's profiles
POST   /api/vehicles
GET    /api/vehicles/:id
PUT    /api/vehicles/:id
DELETE /api/vehicles/:id                                   409 with an archive offer if a saved trip uses it
POST   /api/vehicles/:id/archive
GET    /api/reference/efficiency?make=&model=              default consumption rate, if any
GET    /api/locations/search?q=                            OneMap matches, Singapore only
POST   /api/trips                                          validates, stores the Trip, runs the estimate

Trip cost estimation                             UC-06 to UC-10
GET    /api/trips/:id                                      trip, estimate, components, derivation
POST   /api/trips/:id/estimate                             re-run after a routing failure

Route optimisation                               UC-11, UC-12
POST   /api/trips/:id/compare-routes                       options, cheapest or null, excluded
POST   /api/trips/:id/choose-route   { optionId }          re-estimates on the chosen option
POST   /api/trips/:id/optimise-departure                   slots, recommendation, saving, margin flag
POST   /api/trips/:id/apply-departure { departureTime }    re-estimates at the chosen slot

Renter fuel planning                             UC-13
POST   /api/trips/:id/top-up-plan  { pickUpLevel, requiredReturnLevel, unit }

Trip records and history                         UC-14, UC-15, UC-16
POST   /api/trips/:id/save
PUT    /api/trips/:id/log          { actualFuelCost?, actualRoadUsageCharge?, actualParkingFee? }
GET    /api/history?from=&to=                              saved trips plus a spend report or a no-log notice

Reference data administration                    UC-17, UC-18, UC-19   (Administrator only)
GET    /api/admin/fuel-prices          POST /api/admin/fuel-prices
PUT    /api/admin/fuel-prices/:id      POST /api/admin/fuel-prices/:id/withdraw
GET    /api/admin/charge-points
GET    /api/admin/erp-rates            POST /api/admin/erp-rates      (rejects overlapping periods)
PUT    /api/admin/erp-rates/:id        POST /api/admin/erp-rates/:id/withdraw
GET    /api/admin/efficiency-records   POST /api/admin/efficiency-records
PUT    /api/admin/efficiency-records/:id   DELETE /api/admin/efficiency-records/:id
```

The estimate response is the most important contract in the project, so agree on it before the frontend work starts. It carries the trip, an array of legs, and for each leg the three components with amount, lower and upper bounds, availability and reason, the source name and recorded time, a stale flag, and for road usage the list of crossings with the charge point name, crossing time, rate applied and whether an adjacent rate widened the range. The top level carries the total, whether it is a lower bound, the overall bounds, and the list of assumptions such as a defaulted parking duration. Everything the cost derivation screen shows is already in this payload.

Session configuration follows NFR-SEC-02. The cookie is httpOnly, sameSite lax, secure when NODE_ENV is production, and rolling with a thirty-minute maxAge so inactivity expires it. Sessions live in the Session table so that logout destroys them on the server. The logger never receives request bodies, and the auth routes return the same message for an unknown email and a wrong password.

## 8. Frontend

Each state in the dialog map becomes one page component and one route. The layout shell shows the signed-in email, the sign-out control and the navigation permitted by the role, and a RequireAuth wrapper redirects to the sign-in page when the me endpoint returns 401.

```
/                          Landing page
/sign-in                   Sign in                        UC-02
/register                  Register account               UC-01
/app                       Overview dashboard
/app/vehicles              Vehicle profiles               UC-04
/app/vehicles/new          Vehicle profile form
/app/vehicles/:id          Vehicle profile form
/app/plan                  Plan a trip                    UC-05
/app/trips/:id             Estimate with derivation panel UC-06, UC-10
/app/trips/:id/compare     Compare routes                 UC-11
/app/trips/:id/optimise    Optimise departure time        UC-12
/app/trips/:id/top-up      Fuel top-up                    UC-13, rented profiles only
/app/history               History and spend report       UC-16
/app/history/:id/log       Log actual costs               UC-15
/admin/fuel-prices         Petrol prices                  UC-17
/admin/erp-rates           ERP tariffs                    UC-18
/admin/efficiency          Vehicle efficiency             UC-19
```

Forms use react-hook-form with the Zod schemas from shared as resolvers, so the same rule produces the inline message in the browser and the rejection on the server, and a server-side field error is written back into the form with setError so it appears beside the field as NFR-USA-04 requires. The API client is a thin typed wrapper over fetch with credentials included. TanStack Query is worth adding for loading and error state on every page, but plain useEffect is acceptable if the team prefers fewer libraries.

A few screen behaviours come straight from the requirements and are easy to forget. The estimate page must show an unavailable component by name with its reason and must label the total as a lower bound, never as a complete total, when that happens. The compare page marks the cheapest option but has no automatic selection, and shows an indistinguishable badge instead of a winner when ranges overlap. The optimise page states that the planned time is already cheapest rather than showing a zero saving, and labels a small saving as within the margin of error. The top-up page shows levels in the unit the renter typed, warns about en-route refuelling when the projected level is negative, and instructs the user to read the fuel gauge only while stationary. The history page lists saved trips even when no log exists, and replaces the spend report with an instruction to log actual costs. The landing page and the shell state that TollTally is for planning before travel.

Tailwind makes the 360-pixel requirement straightforward if every page is built mobile first and checked in the browser device toolbar at 360 wide before it is called done. Keyboard operability and visible labels come for free from native form controls, so avoid custom dropdowns and click-only cards.

## 9. Testing

Name every test with the requirement it proves, for example FR-EST-05 crossed point with no matching rate is excluded and total becomes a lower bound. Vitest prints these names, and a grep for FR- across the test folder produces the acceptance evidence for section 6.4 without a separate matrix.

Unit tests in backend/test/domain cover the pure module. The nine cases in NFR-MAI-03 map to files as follows. normal covers the section 7.5 worked example. rate-boundary covers a crossing inside the tolerance of a period boundary and the widened range. zero-charge covers a route with no crossings returning zero rather than unavailable. missing-rate covers the excluded charge point and the lower-bound label. zero-top-up covers a return requirement already met. insufficient-fuel covers a negative projected level and the shortfall message. overlapping-rate covers the administrator overlap rejection and the accepted zero rate. route-range-overlap covers the indistinguishable outcome and the no-auto-select rule. history-aggregation covers a date range with logged and unlogged trips and the refusal to substitute estimates. Add tests for return legs priced at their own departure times, parking period rounding, fraction and percent fuel levels, day type on a public holiday, and determinism by calling the estimate twice with the same inputs.

API tests with Supertest run the Express app against a temporary database with the mock adapters. One long scenario registers, signs in, adds a vehicle, plans a trip, reads the estimate, compares routes, saves the trip, logs actual costs and reads history. Short tests cover the generic errors on duplicate registration and bad sign-in, the 401 on protected routes after logout, a Driver being unable to read another Driver's trip or call an administrator route, and the administrator overlap rejection.

Playwright covers three end-to-end flows in a real browser against the mock adapters. The first is register, add vehicle, plan trip, see estimate, save. The second is the renter top-up flow with a rented profile. The third is the administrator adding a fuel price and a driver seeing it in the derivation view. Running the first flow at a 360-pixel viewport doubles as the NFR-USA-02 check.

The root npm test command runs the workspace unit and API tests. Playwright runs as a separate script because it needs a built frontend and installed browsers, and CI runs both.

## 10. CI, environment and deployment

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
        env:
          DATABASE_URL: file:./test.db
          ROUTING_PROVIDER: mock
          PARKING_PROVIDER: mock
          SESSION_SECRET: ci-only
```

When the team moves to PostgreSQL, add a postgres service container to this job and point DATABASE_URL at it, so the switch is rehearsed on every push.

```
DATABASE_URL                  file:./dev.db in development, a postgres URL in production
SESSION_SECRET                long random string
SESSION_TTL_MINUTES           30
ROUTING_PROVIDER              mock or onemap
PARKING_PROVIDER              mock or table
ONEMAP_EMAIL, ONEMAP_PASSWORD
GOOGLE_ROUTES_API_KEY         only if alternatives use Google
LTA_ACCOUNT_KEY               only for the seed script
ADMIN_EMAIL, ADMIN_PASSWORD   used once by the seed script to create the administrator
```

The Dockerfile builds all three workspaces in one stage and copies the result into a slim node image whose start command runs prisma migrate deploy and then the server. Render, Railway and Fly all accept that image and provide HTTPS and a managed PostgreSQL database, which covers NFR-SEC-01 and NFR-POR-02. The administrator account is created by the seed script from environment variables because the SRS puts role administration out of scope, and the same seed loads charge points, ERP rates, holidays, parking rates and efficiency defaults so a fresh deployment can produce an estimate immediately.

## 11. Build order and milestones

The order below puts the riskiest and most valuable code first and lets the frontend start on mocked data in the second week. Dates assume the demo falls in the second week of November. Shift them if the lab schedule differs.

Milestone 0, the week of 15 September. Install the current Node LTS on every machine, since this one has git but no Node, npm or Docker. Create the repository, the three workspaces, ESLint, Prettier, Vitest and a placeholder test, the CI workflow and a README with the one-command test instruction. Record the section 2 decisions in the README. Done when a push to GitHub shows a green check.

Milestone 1, the week of 21 September. Build the whole domain module with its unit tests, starting from the section 7.5 example and working through the NFR-MAI-03 list. No database, no HTTP. Done when every function in section 5 exists, every NFR-MAI-03 case has a named test, and the suite passes.

Milestone 2, the week of 28 September. Write the Prisma schema and first migration, the seed script with real charge points and ERP rates, session middleware, the auth module and the vehicles module with Supertest coverage. Done when a fresh clone can migrate, seed, register, sign in and create a vehicle profile through the API.

Milestone 3, the week of 5 October. Build the adapter interfaces, the mocks, the OneMap search and route implementation, crossing detection, the trips module and the estimate response. Done when POST /api/trips returns a full estimate against real OneMap data for a trip that crosses at least one charge point, and against the mocks in the test suite including the timeout path.

Milestone 4, from 28 September to 18 October in parallel with milestones 2 and 3. Scaffold the frontend shell, routing, auth guard and API client against the mock-backed server, then build the sign-in, register, vehicle, plan, estimate and derivation pages. Done when the first Playwright flow passes.

Milestone 5, the week of 12 October. Add compare routes, optimise departure and the top-up plan on both sides, including the Google alternatives adapter if OneMap alone cannot provide distinct routes. Done when the compare page shows an indistinguishable result for two similar routes and the top-up page passes the renter flow.

Milestone 6, the week of 19 October. Add save, log, history and the three administrator screens, and perform the PostgreSQL switch with the CI service container. Done when the long Supertest scenario passes on PostgreSQL and the administrator Playwright flow passes.

Milestone 7, 26 October to 8 November. Deploy the Docker image with a managed database and the seeded reference data, walk every page at 360 pixels and by keyboard, write the quick-start guide and administrator guide required by SRS 2.6, freeze the traceability grep output into docs, and rehearse the demo. Keep the last week free for fixes.

## 12. Suggested split of work

With five people, one owns the domain module and the adapters, one owns the database, seed and API modules, two own the frontend with one taking the driver pages and the other the administrator and records pages plus Playwright, and one owns CI, deployment, the seed data sources and the documentation while also reviewing pull requests. With four people, fold the last role into the two backend roles. Every pull request should include its tests, and the reviewer should check that new tests carry requirement identifiers.

## 13. Risks and things that trip teams up

Time zones will cause wrong ERP charges if handled loosely. Store every instant in UTC, accept departure times from the browser as ISO strings with an offset, and compute day type and ERP periods with date-fns-tz in Asia/Singapore. Test with a departure at 07:59 local on a weekday to confirm the period boundary logic.

Money must never pass through a JavaScript number. Prisma returns its own Decimal type, which is decimal.js underneath, so convert at the module boundary and keep the domain module on decimal.js. Serialise amounts as strings in JSON and format them in the browser.

Native modules on Windows occasionally fail to install. If argon2 fails to build, use bcryptjs, which is pure JavaScript and satisfies FR-ACC-03.

External keys and quotas need one owner. OneMap accounts are free, LTA DataMall needs an account key, and Google Routes has a free monthly allowance that a course project will not exhaust, but the keys must live in a .env file that is listed in .gitignore from the first commit. The mock providers mean nobody else on the team needs the keys to develop.

ERP charging locations are stable for the life of the project even though physical gantries are being removed under ERP 2.0, but rates change at the quarterly reviews, which is what the effective-date mechanism in FR-ADM-06 exists for. Seeding with an effective date and a recorded time from the start keeps the derivation view truthful.

Parking coverage will be patchy with a seeded table. The SRS already allows parking to be unavailable with a reason, so a destination with no nearby carpark is a legitimate result, not a bug, and the estimate page must display it that way.

The migration folder must be regenerated when the provider changes, and every developer must reset their local database at that point. Announce it, do it in one pull request, and do it before milestone 7.

## 14. First commands on this machine

```
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop            only if you choose PostgreSQL from day one

cd path\to\Tolltally
git init
npm init -y                                    then add "private": true and "workspaces": ["shared", "backend", "frontend"]
npm create vite@latest frontend -- --template react-ts
mkdir backend shared
cd backend
npm init -y
npm install express express-session @quixo3/prisma-session-store argon2 zod decimal.js @prisma/client date-fns date-fns-tz
npm install --save-dev typescript tsx prisma vitest supertest @types/express @types/express-session @types/supertest @types/node
npx prisma init --datasource-provider sqlite
cd ..
npm install --save-dev eslint prettier concurrently
git add .
git commit -m "Scaffold workspaces"
```
