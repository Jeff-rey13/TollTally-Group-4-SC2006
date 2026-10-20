# Requirements traceability

See [the implementation review](code-review.md) for regression fixes, verification scope and outstanding acceptance checks. The mappings below identify implementation coverage; they do not prove live-service or deployment compliance.

This document records where each requirement in SRS version 1.3 is implemented and what proves it. It is the evidence SRS section 6.4 asks for, which says the release is accepted when every mandatory requirement has at least one passing test and all nineteen use cases have acceptance evidence.

Requirement identifiers appear in the unit, API and browser test names. Search the tests to find the associated evidence:

```
rg 'FR-|NFR-' backend/test frontend/e2e
```

Deployment, browser-version coverage and human acceptance still require the checks described in the implementation review.

## How to read the tables

The implementation column names the file that owns the behaviour. The evidence column names the test that fails if the behaviour regresses. A test in backend/test/domain exercises the pure calculation module with plain values, one in backend/test/api drives the real Express application through HTTP against a temporary database and the mock providers, and one in frontend/e2e drives a real browser at both desktop and 360 pixel widths.

## Feature 1, account and authentication

| Requirement | Implementation                                                                     | Evidence                                                                                  |
| ----------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR-ACC-01   | backend/src/modules/auth/routes.ts with the strength rule in shared/src/schemas.ts | api/auth.test.ts, a password that fails the strength rules is rejected next to the field  |
| FR-ACC-02   | auth/routes.ts, one generic registration error                                     | api/auth.test.ts, a duplicate email is rejected with one generic error                    |
| FR-ACC-03   | backend/src/lib/password.ts, salted scrypt                                         | api/requirements.test.ts, a password is stored only as a salted one way hash              |
| FR-ACC-04   | auth/routes.ts, Driver role and session on registration                            | api/flow.test.ts, registration signs the new user in with the Driver role                 |
| FR-ACC-05   | auth/routes.ts, hash comparison and role in the session                            | api/auth.test.ts, a correct sign in creates a session carrying the role                   |
| FR-ACC-06   | frontend/src/components/Shell.tsx and middleware/auth.ts                           | api/auth.test.ts and e2e/admin-reference.spec.ts, an administrator never sees the planner |
| FR-ACC-07   | auth/routes.ts with lib/sessionStore.ts                                            | api/auth.test.ts, Sign Out invalidates the session on the server                          |

## Feature 2, vehicle and trip setup

| Requirement | Implementation                                                           | Evidence                                                                                                     |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| FR-SET-01   | modules/vehicles/service.ts, delete refused and archive offered          | api/admin-ownership.test.ts, a vehicle used by a saved trip cannot be deleted but can be archived            |
| FR-SET-02   | vehicles/service.ts and the Prisma VehicleProfile model                  | api/flow.test.ts, creates a vehicle profile with the required fields                                         |
| FR-SET-03   | vehicles/service.ts resolveConsumptionRate                               | api/admin-ownership.test.ts, an efficiency record is offered as a default and never rewrites a saved profile |
| FR-SET-04   | vehicles/service.ts and shared/src/schemas.ts                            | api/admin-ownership.test.ts, a profile without a consumption rate and without a reference value is rejected  |
| FR-SET-05   | modules/trips/service.ts planTrip and frontend PlanTrip.tsx              | api/requirements.test.ts, Plan Trip requires the Driver to select one of their own stored vehicles           |
| FR-SET-06   | shared/src/schemas.ts tripSchema, Singapore bounds and distinct places   | api/flow.test.ts, invalid trip input is rejected with field level errors                                     |
| FR-SET-07   | trips/service.ts buildLegs, each leg at its own departure time           | api/flow.test.ts, a return trip prices each leg at its own departure time                                    |
| FR-SET-08   | trips/service.ts, the default duration recorded as an assumption         | api/flow.test.ts, a missing parking duration is defaulted and disclosed                                      |
| FR-SET-09   | trips/service.ts planTrip always calls estimateTrip                      | api/flow.test.ts, planning a trip unconditionally produces an estimate                                       |
| FR-SET-10   | middleware/validate.ts and the error shape in middleware/errorHandler.ts | api/flow.test.ts, field specific errors are returned and stored data is untouched                            |

## Feature 3, trip cost estimation

| Requirement | Implementation                                                 | Evidence                                                                                        |
| ----------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FR-EST-01   | adapters/routing and domain/crossings.ts                       | domain/crossings.test.ts, a charge point beside the route is not crossed                        |
| FR-EST-02   | domain/fuel.ts tripFuelVolume                                  | domain/worked-example.test.ts, the SRS section 7.5 figures                                      |
| FR-EST-03   | domain/fuel.ts tripFuelCost                                    | domain/worked-example.test.ts                                                                   |
| FR-EST-04   | domain/crossings.ts and domain/erp.ts                          | domain/erp.test.ts and api/flow.test.ts, each crossing is itemised with its time                |
| FR-EST-05   | domain/erp.ts roadUsage, excluded points named                 | domain/erp.test.ts, a vehicle class without a rate is named and excluded                        |
| FR-EST-06   | domain/erp.ts selectRate boundary tolerance                    | domain/erp.test.ts, a crossing within five minutes of a boundary keeps both rates               |
| FR-EST-07   | domain/parking.ts and adapters/parking                         | domain/parking.test.ts and api/flow.test.ts, ninety minutes is three periods                    |
| FR-EST-08   | trips/service.ts lookupParking and domain/parking.ts           | api/flow.test.ts, a zero duration costs zero without a lookup                                   |
| FR-EST-09   | domain/estimate.ts combine                                     | domain/estimate.test.ts, the total is the sum of available components                           |
| FR-EST-10   | modules/trips/serialize.ts, legs shown separately and combined | api/flow.test.ts, a return trip shows both legs                                                 |
| FR-EST-11   | domain/estimate.ts and trips/pricing.ts                        | api/requirements.test.ts, an unpriceable component is named and the total becomes a lower bound |
| FR-EST-12   | trips/serialize.ts and frontend Estimate.tsx derivation panel  | api/flow.test.ts and e2e/admin-reference.spec.ts, the derivation names the price record used    |
| FR-EST-13   | the pure calculation module, no clock or randomness            | domain/erp.test.ts and api/flow.test.ts, repeated calculations are identical                    |

## Feature 4, route optimisation

| Requirement | Implementation                                                    | Evidence                                                                                             |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FR-OPT-01   | modules/optimisation/service.ts with ROUTE_OPTION_COUNT           | api/requirements.test.ts, alternatives are distinct from the default and within the configured range |
| FR-OPT-02   | optimisation/service.ts prices each option through the same rules | api/flow.test.ts, options are priced side by side                                                    |
| FR-OPT-03   | domain/ranking.ts compareRoutes, marks but never selects          | domain/ranking.test.ts and domain/worked-example.test.ts                                             |
| FR-OPT-04   | domain/ranking.ts rangesOverlap                                   | domain/ranking.test.ts, overlapping ranges are indistinguishable                                     |
| FR-OPT-05   | optimisation/service.ts exclusion reasons                         | domain/ranking.test.ts, an option without a complete bound is excluded                               |
| FR-OPT-06   | optimisation/service.ts optimiseDepartureTime                     | api/flow.test.ts, slots are priced around the planned time                                           |
| FR-OPT-07   | domain/ranking.ts recommendDeparture                              | domain/ranking.test.ts, the planned time being cheapest is stated rather than a zero saving          |
| FR-OPT-08   | domain/ranking.ts margin comparison                               | domain/ranking.test.ts, a saving inside the range width is within the margin of error                |

## Feature 5, renter fuel planning

| Requirement | Implementation                                          | Evidence                                                          |
| ----------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| FR-REN-01   | modules/topup/service.ts, rented profiles only          | api/flow.test.ts, top up planning is refused for an owned vehicle |
| FR-REN-02   | domain/fuelLevel.ts and topup/service.ts capacity check | domain/topUp.test.ts and api/flow.test.ts                         |
| FR-REN-03   | topup/service.ts calls the fuel calculation directly    | api/flow.test.ts and e2e/renter-topup.spec.ts                     |
| FR-REN-04   | domain/topUp.ts planTopUp                               | domain/topUp.test.ts and domain/worked-example.test.ts            |
| FR-REN-05   | domain/topUp.ts, max of zero and the shortfall          | domain/topUp.test.ts                                              |
| FR-REN-06   | trips/serialize.ts buildTopUpDto returns both units     | api/flow.test.ts and e2e/renter-topup.spec.ts                     |
| FR-REN-07   | domain/topUp.ts outcome and serialize.ts message        | domain/topUp.test.ts and api/flow.test.ts                         |

## Feature 6, trip records and history

| Requirement | Implementation                                                        | Evidence                                                                  |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FR-REC-01   | modules/records/service.ts saveTrip, the snapshot is never recomputed | api/flow.test.ts, re-estimating a saved trip is refused                   |
| FR-REC-02   | records/service.ts duplicate handling                                 | api/requirements.test.ts, saving the same trip twice keeps one record     |
| FR-REC-03   | records/service.ts logActualCosts, partial entry allowed              | api/flow.test.ts, a partial log marks the rest not logged                 |
| FR-REC-04   | shared/src/schemas.ts tripLogSchema                                   | api/requirements.test.ts, an actual cost must be a number of zero or more |
| FR-REC-05   | domain/variance.ts                                                    | domain/spend.test.ts and api/flow.test.ts                                 |
| FR-REC-06   | domain/variance.ts not applicable outcome                             | domain/spend.test.ts                                                      |
| FR-REC-07   | records/service.ts tripHistory                                        | api/flow.test.ts                                                          |
| FR-REC-08   | domain/spend.ts aggregateSpend, logged trips only                     | domain/spend.test.ts and api/flow.test.ts                                 |
| FR-REC-09   | records/service.ts, the report is suppressed with an explanation      | api/flow.test.ts and e2e/driver-flow.spec.ts                              |

## Feature 7, reference data administration

| Requirement | Implementation                                                    | Evidence                                                                          |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FR-ADM-01   | middleware/auth.ts requireRole on the admin router                | api/admin-ownership.test.ts, a Driver is refused and an Administrator allowed     |
| FR-ADM-02   | modules/admin/service.ts, system set recorded time                | api/admin-ownership.test.ts                                                       |
| FR-ADM-03   | admin/service.ts withdraw keeps the row                           | api/admin-ownership.test.ts and domain/erp.test.ts                                |
| FR-ADM-04   | admin/service.ts and shared/src/schemas.ts erpRateSchema          | api/requirements.test.ts, an effective date returns as the Singapore date entered |
| FR-ADM-05   | domain/erp.ts periodsOverlap and admin/service.ts assertNoOverlap | domain/erp.test.ts and api/admin-ownership.test.ts                                |
| FR-ADM-06   | domain/erp.ts effectiveRates and the admin overlap key            | domain/erp.test.ts and api/requirements.test.ts                                   |
| FR-ADM-07   | shared/src/schemas.ts efficiencyRecordSchema                      | api/requirements.test.ts, a record needs a make, a model and a positive rate      |
| FR-ADM-08   | admin/service.ts findDuplicate                                    | api/admin-ownership.test.ts                                                       |
| FR-ADM-09   | vehicles store their own rate, nothing propagates                 | api/admin-ownership.test.ts, amending a record never rewrites a saved profile     |
| FR-ADM-10   | CostComponent keeps the reference identifiers and the source name | api/admin-ownership.test.ts, a withdrawn price still names the record used        |

## Non functional requirements

| Requirement | Implementation                                                     | Evidence                                                                           |
| ----------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| NFR-PER-01  | backend/src/lib/budget.ts, measured and stored on the estimate     | api/requirements.test.ts, one estimate completes within the three second budget    |
| NFR-PER-02  | optimisation/service.ts measures the whole comparison              | api/requirements.test.ts, a comparison finishes within the ten second budget       |
| NFR-SAF-01  | frontend Shell.tsx footer and Landing.tsx                          | e2e/driver-flow.spec.ts, the planning statement is visible                         |
| NFR-SAF-02  | frontend TopUp.tsx stationary instruction                          | e2e/renter-topup.spec.ts                                                           |
| NFR-SEC-01  | middleware/security.ts, redirect and strict transport security     | api/requirements.test.ts, plain HTTP is redirected in production                   |
| NFR-SEC-02  | app.ts session cookie, rolling expiry, Prisma session store        | api/auth.test.ts, the cookie is HttpOnly and SameSite                              |
| NFR-SEC-03  | auth/routes.ts generic errors and the dummy hash comparison        | api/auth.test.ts, both failures produce the same message                           |
| NFR-SEC-04  | middleware/validate.ts with the shared Zod schemas                 | api/requirements.test.ts, crafted bodies are rejected server side                  |
| NFR-SEC-05  | every query filters by the caller's identifier                     | api/admin-ownership.test.ts, another Driver cannot read the trip                   |
| NFR-SEC-06  | middleware/requestLog.ts and errorHandler.ts                       | api/requirements.test.ts, no password, cookie or trip input reaches the log        |
| NFR-USA-02  | mobile first Tailwind layout                                       | the phone-360 Playwright project runs every flow at 360 pixels                     |
| NFR-USA-03  | native controls, visible focus, text beside every colour cue       | e2e/driver-flow.spec.ts, the sign in form is completed with the keyboard alone     |
| NFR-USA-04  | components/ui.tsx Field, message tied to the control               | api tests assert field level errors, the keyboard test asserts the announcement    |
| NFR-ACCY-01 | domain/parking.ts and domain/erp.ts, decimal arithmetic throughout | domain/parking.test.ts                                                             |
| NFR-ACCY-02 | domain/fuel.ts and domain/topUp.ts                                 | domain/worked-example.test.ts                                                      |
| NFR-ACCY-03 | no clock or randomness inside the calculation module               | domain/erp.test.ts and api/flow.test.ts                                            |
| NFR-ACCY-04 | domain/estimate.ts, an unavailable component is never zero         | api/requirements.test.ts                                                           |
| NFR-REL-02  | lib/errors.ts ExternalServiceError mapped to a retryable response  | api/flow.test.ts, a routing timeout leaves the trip planned and keeps the session  |
| NFR-REL-03  | only Save Trip changes the status to SAVED                         | api/requirements.test.ts, re-estimating adds nothing to history                    |
| NFR-MAI-01  | adapters are the only code that names a provider                   | architecture.test.ts, the calculation module imports no provider or framework code |
| NFR-MAI-02  | the pure calculation module in backend/src/domain                  | architecture.test.ts and the domain test suite                                     |
| NFR-MAI-03  | the nine cases the SRS names                                       | architecture.test.ts, each named case has a test                                   |
| NFR-MAI-04  | the root test script                                               | architecture.test.ts, the README and the CI workflow use the same command          |

## Requirements no automated test can settle

Five requirements are about the environment the application runs in or about a person using it, so the evidence for them is a configuration or an acceptance session rather than a test.

NFR-USA-01 requires a first time registered user to produce an estimate within two minutes without instruction. The end to end flow performs exactly that path, and the quick start guide covers it, but the requirement is about a person and has to be observed in an acceptance session.

NFR-REL-01 requires the deployed system to be available for at least ninety nine percent of the assessment period. The container declares a health check and the server shuts down cleanly on a termination signal, but availability is measured against the running deployment.

NFR-POR-01 requires the application to work on the current and previous major versions of Chrome, Firefox, Safari and Edge. The client is built by Vite to a broadly supported target and uses no browser specific interface. The Playwright projects currently run Chromium, so the other three browsers are a manual check before the demonstration.

NFR-POR-02 requires the server to be deployable to a Linux host without code changes. The Dockerfile builds on a Linux base image and every setting is an environment variable. The evidence is a successful container build and run, which the CI workflow performs on every push.

NFR-MAI-04 is listed in the table above because the commands are checked, but whether a clean checkout succeeds is proven by the CI workflow running on a fresh runner rather than by a test on a developer machine.

## Business rules and use case coverage

The seven business rules in SRS section 5.9 are enforced by the requirements above. BR-01 is proven by the test that every planner route requires an authenticated session. BR-02 by the Singapore bounds check in the trip schema. BR-03 by the route comparison tests. BR-04 by the top up plan being stored separately and never added to the trip total. BR-05 by the lower bound tests. BR-06 by the wording in the footer and on the logging screen. BR-07 by the top up plan requiring a fuel price before it can be produced.

All nineteen use cases have evidence. UC-01 to UC-03 in the authentication tests, UC-04 and UC-05 in the vehicle and planning tests, UC-06 to UC-10 in the estimation tests and the derivation panel test, UC-11 and UC-12 in the optimisation tests, UC-13 in the renter tests and the browser flow, UC-14 to UC-16 in the records tests, and UC-17 to UC-19 in the administration tests and the browser flow that carries a new fuel price through to a driver's estimate.

## Lab 4 test design

The black-box cases in backend/test/lab4/topup-blackbox.test.ts (BB-01 to BB-23) add equivalence class and boundary value evidence for FR-REN-01 to FR-REN-07. The basis path cases in backend/test/lab4/basis-path.test.ts add white-box evidence for FR-EST-04 to FR-EST-06 (SR-P1 to SR-P10, `selectRate`) and FR-OPT-07 and FR-OPT-08 (RD-P1 to RD-P5, `recommendDeparture`). The Lab 4 test report explains the design of each case.

## Release 2.1 additions

SRS version 2.1 adds three use cases (UC-20 Reset Password, UC-21 Delete Account, UC-22 View System Overview) and the requirements below, and rewrites FR-ADM-11 because LTA DataMall no longer offers its ERP Rates API. With them, all twenty-two use cases have evidence.

| Requirement | Implementation | Evidence |
| ----------- | -------------- | -------- |
| FR-ACC-08   | auth/routes.ts forgot-password, lib/mailer.ts; pages/ForgotPassword.tsx | api/account-recovery.test.ts; e2e/privacy-and-polish.spec.ts |
| FR-ACC-09   | auth/routes.ts reset-password (one transaction); pages/ResetPassword.tsx | api/account-recovery.test.ts, a used or expired link is refused and old sessions end |
| FR-ACC-10   | auth/routes.ts DELETE /account; pages/Privacy.tsx DeleteAccount | api/security-privacy.test.ts; e2e/privacy-and-polish.spec.ts |
| FR-ACC-11   | pages/Privacy.tsx, components/CookieNotice.tsx, Shell footer | e2e/privacy-and-polish.spec.ts, cookie notice and privacy link |
| FR-EST-15   | domain/crossings.ts onePerZonePassage; zoneId from build_erp_data.py | domain/road-matching.test.ts, gantries LTA lists together |
| FR-ADM-11   | prisma/tools/build_erp_data.py, prisma/data/charge-points.json, prisma/seed.ts (withdraws replaced rates) | manual: rebuilding from the 7 Sep 2026 LTA files reproduces charge-points.json exactly; seed is idempotent (api/requirements.test.ts) |
| FR-ADM-12   | admin/overview.ts userSummary; pages/admin/Overview.tsx | api/admin-overview.test.ts; e2e/admin-reference.spec.ts |
| FR-ADM-13   | admin/overview.ts healthChecks, runLiveCheck; lib/monitor.ts | api/admin-overview.test.ts, demo routing flagged, rejected login shown as down |
| FR-ADM-14   | lib/monitor.ts (TrafficHour table), admin/overview.ts trafficSummary | api/admin-overview.test.ts, counting and app opens |
| NFR-SEC-07  | middleware/rateLimit.ts, limits set in app.ts | api/security-privacy.test.ts, sign-in and registration limits |
| NFR-SEC-08  | middleware/security.ts securityHeaders | api/security-privacy.test.ts, CSP and headers |
| NFR-SEC-09  | pages/Privacy.tsx; lib/monitor.ts stores totals only | api/admin-overview.test.ts; review of the cookie list |
| NFR-USA-05  | app.ts isAppScreen (404 status), pages/NotFound.tsx, components/ui Skeleton, ErrorBoundary | api/security-privacy.test.ts; e2e/privacy-and-polish.spec.ts |

## Release 2.2 additions

SRS version 2.2 adds UC-23 View Road and Weather Conditions and the requirements below, and changes FR-ADM-07 (vehicle type on efficiency records) and FR-ADM-13 (traffic and weather rows). With them, all twenty-three use cases have evidence.

| Requirement | Implementation | Evidence |
| ----------- | -------------- | -------- |
| FR-SET-12   | pages/VehicleForm.tsx vehicle type and filtered catalogue; prisma/data/efficiency-records.json (9 motorcycles) | api/motorcycles.test.ts, catalogue; e2e/motorcycle-conditions.spec.ts |
| FR-EST-16   | prisma/seed.ts class multiples (motorcycle 0.5); adapters/parking TableParkingAdapter vehicleClass filter; trips/service.ts lookupParking | api/motorcycles.test.ts, half ERP and motorcycle parking |
| FR-EST-17   | domain/conditions.ts incidentsNearRoute; adapters/conditions LtaIncidentAdapter; trips/conditions.ts; components/ConditionsCard.tsx, TripMap.tsx markers | domain/conditions.test.ts; api/conditions.test.ts; e2e/motorcycle-conditions.spec.ts |
| FR-EST-18   | domain/conditions.ts nearestArea, regionOf, isRain; adapters/conditions NeaWeatherAdapter; trips/conditions.ts | domain/conditions.test.ts; api/conditions.test.ts |
| FR-EST-19   | GET /api/trips/:id/conditions (not stored); ConditionsCard source and time | api/conditions.test.ts, the estimate is the same before and after |
| FR-ADM-07   | admin/service.ts efficiency records with vehicleClass; pages/admin/Efficiency.tsx | api/motorcycles.test.ts, administrator adds a motorcycle |
| FR-ADM-13   | admin/overview.ts conditionCheck, runLiveCheck; lib/monitor.ts trackTraffic, trackWeather | api/conditions.test.ts, weather failure shown as down, off when not set up |
| NFR-SEC-10  | adapters/conditions fetch whole lists; LTA_ACCOUNT_KEY only in backend/.env | review of the adapter requests |
| NFR-REL-04  | adapters/conditions Cached (2 and 10 minutes); trips/conditions.ts handles each feed on its own | api/conditions.test.ts, a failing source is reported as unavailable and the estimate still stands |
