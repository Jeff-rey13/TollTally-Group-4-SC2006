# Demo setup: live data and a public link

This turns TollTally from demo mode (simulated routes) into a version that uses live OneMap routing and your own fuel prices, then puts it online. LTA's ERP gantry positions and rates are already built in (section 2).

Keys belong only in `backend/.env` on your computer or in your hosting dashboard. Never commit them, zip them or show them on a slide. `.gitignore` already excludes `.env`.

## 1. Run it on your computer with live data

You need Node 22 or 24. In PowerShell, inside the `Tolltally` folder:

```
npm install
```

This creates `backend/.env`. Open it and set these lines (leave everything else as it is):

```
ROUTING_PROVIDER=onemap
ONEMAP_EMAIL=the email you registered with OneMap
ONEMAP_PASSWORD=your OneMap password
ADMIN_EMAIL=an email you will sign in with as administrator
ADMIN_PASSWORD=a password that is not Admin1234
```

Use your OneMap email and password, not the access token shown after registration. The token expires after three days; the app uses your login to get a fresh one automatically.

Then start the app:

```
npm run dev
```

Open http://localhost:5173. The "Demo mode" banner should be gone. Typing an address in Plan a trip should now return real Singapore places, and the route overview should show a street map.

## 2. ERP gantries and rates

The app ships with LTA's ERP rates for cars, taxis and light goods vehicles that took effect on 7 September 2026, placed at the gantry positions in LTA's gantry map. They load into the database each time you run `npm run dev`; there is nothing to import. Older sample gantries from earlier versions are switched off automatically and kept only for trip history.

What this means in the app today:

- Only expressway gantries charge, mostly in the weekday morning peak (for example CTE southbound after Braddell Road up to $5.00, AYE citybound near Clementi up to $5.00, KPE southbound up to $6.00), with a few in the evening peak.
- The Orchard cordon and the YMCA or Fort Canning tunnel charge $1.00 on weekdays from 11:00 to 19:00.
- City-centre (CBD) cordon and arterial-road gantries are listed by LTA with no charge in the current period, so crossing them correctly shows SGD 0.00. Saturdays, Sundays and public holidays are free.
- Gantries LTA lists together (a main carriageway and its slip roads into the same charging point) are charged once per trip, as on the road.

LTA DataMall no longer offers its ERP Rates API (it returns "404 Not Found"), so `npm run db:import-erp` is not needed and is not run when the app is hosted. You do not need a DataMall key.

### Updating ERP rates when LTA changes them

LTA revises ERP rates every school-holiday period. To load a new table:

1. Download the new "ERP Rates" PDF for passenger cars from the OneMotoring ERP rates page, and the latest "LTA Gantry" GeoJSON from data.gov.sg.
2. Install the PDF reader once: `pip install pdfplumber`
3. In the `Tolltally` folder, run (with your file names and the date the new rates start):

   ```
   python backend/prisma/tools/build_erp_data.py RATES.pdf LTAGantryGEOJSON.geojson backend/prisma/data/charge-points.json 2027-01-05
   ```

   It prints how many gantries it placed and lists any it could not find in the map.

4. Restart `npm run dev`. The new rates replace the old ones; trips already planned keep the rates they were priced with. Commit the updated `charge-points.json` so teammates and the hosted site get the same rates.

## 3. Enter today's pump prices

Sign in with your administrator email, open Fuel prices and add today's price for Petrol 92, 95, 98 and Diesel. Use the listed price at one of the major retailers (Esso, Shell, SPC, Caltex or Sinopec) and note which one in the source field. Drivers' estimates use the newest price for their fuel type.

Do not use crude-oil prices such as Brent here. They are in US dollars per barrel and do not track Singapore pump prices day to day.

## 4. Put it online (Render)

1. Create a private GitHub repository and push this folder to it (without `node_modules`, `.env` or `*.db`; `.gitignore` handles this).
2. In Render, choose New, then Blueprint, and select the repository. Render reads `render.yaml`: a Docker web service in Singapore with a 1 GB disk for the database. A disk needs a paid instance; check Render's current pricing.
3. When asked, enter `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Leave `GOOGLE_ROUTES_API_KEY` empty unless you have one. Render generates `SESSION_SECRET` itself.
4. Deploy. Each start applies database updates, loads reference data including the ERP gantries and rates, then serves the app over HTTPS at the `onrender.com` address Render gives you.
5. Sign in as administrator on the live site and enter fuel prices again (the hosted database is separate from your laptop's).

In production the server refuses to start if `SESSION_SECRET` is weak or `ADMIN_PASSWORD` is `Admin1234`. The Render log says which one to fix.

Railway and Fly.io also run the same Docker image. Set the same variables and mount a persistent volume at `/data`.

## 5. Before the meeting

- Create the demo driver account and vehicle on the live site the day before, so you are not typing a registration in front of investors.
- Rehearse one or two trips through charging gantries (table below) at a weekday time when they charge. Good examples: Ang Mo Kio to Marina Bay Sands at 08:30 (CTE southbound), Clementi to Marina Bay Sands at 08:30 (AYE citybound), Tampines to Marina Bay Sands at 08:30 (PIE westbound), and, for the $1.00 Orchard cordon, any trip into Orchard Road on a weekday between 11:00 and 19:00. Check that the route map marks the gantries and the ERP line is above zero. If it shows SGD 0.00 at those times, follow section 6 before the meeting.
- Open "Optimise departure" on a morning trip: ERP rates step up and down every few minutes between 07:00 and 10:00, so leaving earlier or later shows a real saving.
- Have a fallback. If venue Wi-Fi or OneMap is down, setting `ROUTING_PROVIDER=mock` in `backend/.env` and running `npm run dev` on your laptop gives the offline demo with simulated routes.

## 6. If ERP always shows SGD 0.00 with live routes

First check the time and the gantries. Most gantries charge nothing outside the weekday peaks, and the CBD gantries charge nothing at all in LTA's current table, so a city-centre trip at midday correctly shows SGD 0.00.

If a trip that should pass a charging gantry still shows "Route crosses no ERP charge point", the gantry may sit a little off the line OneMap draws. Gantry positions come from LTA's map, and when OneMap names the road a route is on, a gantry on that road counts within 350 m, so this is rare. A few gantries are placed by matching unlabelled map features or approximately (marked in the table below), and those are the ones to check.

With `ROUTING_PROVIDER=onemap` and your OneMap login in `backend/.env`, run these in the `Tolltally` folder.

1. See what the app sees for one trip:

   ```
   npm run erp:check -- "Jurong East" "Marina Bay Sands" 08:30
   ```

   It lists every known gantry within 1 km of the OneMap route, how far away it is, the angle between the road and the gantry's charged direction, and whether it was counted. Then it prices the trip for the next weekday at that time.

2. Move the gantries onto the roads OneMap uses:

   ```
   npm run erp:calibrate
   ```

   For each gantry it asks OneMap for a short drive through it in the charged direction and shows the corrected position with a Google Maps link. Nothing is saved yet. Open a few links and check that each pin sits on the road named in the list (for example, the CTE southbound carriageway).

3. Save the results marked OK:

   ```
   npm run erp:calibrate -- --apply
   ```

   This updates `backend/prisma/data/charge-points.json` and the database. Lines marked CHECK are not saved. If you have opened their links and the pins are right, save them too with `npm run erp:calibrate -- --apply --force`. Commit the updated JSON file so every teammate and the hosted site get the same positions.

4. Run step 1 again. At least one gantry should now say COUNTED and the ERP total should be above zero at 08:30 on a weekday. Restart `npm run dev` and plan the same trip in the app.

If a gantry is still missed by a few metres, you can widen the rule in `backend/.env`:

```
ERP_CROSSING_DISTANCE_M=60
ERP_CROSSING_HEADING_DEG=60
```

Keep the distance below about 100 m. Larger values start counting gantries on parallel roads the route does not use.

Also check the time. ERP only charges during its periods, so a trip at 23:00 or on a Sunday correctly shows SGD 0.00 even when gantries are counted.

## 7. Accounts, passwords and email

- Each copy of the project has its own database (`backend/prisma/dev.db`). If you move to a new folder, copy `dev.db` across too, or register again. Otherwise the accounts you made before will not be there.
- "Keep me signed in for 30 days" on the sign-in page keeps a session for 30 days. Without it, a session ends after 30 minutes without activity.
- "Forgot your password?" sends a one-time link that works for 30 minutes. Until email is set up, the link is printed in the terminal running `npm run dev`. Open it in the browser to set a new password.
- To send real emails with Gmail: turn on 2-Step Verification for the Google account, create an app password (Google Account, Security, App passwords), and set these lines in `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=the Gmail address
SMTP_PASS=the 16-character app password
MAIL_FROM="TollTally <the Gmail address>"
```

On Render, enter the same values when asked. Render supplies the site address for the links itself.

## 8. If estimates fail with a routing message

The message now says what went wrong:

- "Live routing needs a OneMap login": `ONEMAP_EMAIL` or `ONEMAP_PASSWORD` is empty in `backend/.env`. A yellow banner at the top of the app says the same. This happens when `npm install` creates a fresh `.env` in a new folder.
- "OneMap did not accept the login": the email or password is wrong, for example after you changed your OneMap password.
- "OneMap took too long" or "could not be reached": a network problem. Try again; TollTally already retries once.

After any change to `backend/.env`, stop `npm run dev` with Ctrl+C and start it again.

## 9. The administrator overview

Sign in with the administrator email. The first screen, Overview, shows:

- Users: drivers registered (and how many are new this week), accounts signed in right now, drivers who planned a trip in the last 7 days, and trips planned.
- Service health: the web server, database, OneMap routing, password reset email, traffic incidents, weather forecast, ERP data, fuel prices and public holidays, each marked Working, Check, Down or Not set up with one line on why. "Run live check" plans a short test route through OneMap and signs in to the mail server, and fetches the incident list and the forecast, so you see whether they work right now. Fuel prices turn to Check when any price is more than 7 days old.
- Traffic: app opens and API requests per hour for the last 24 hours and per day for 14 days, errors, average response time and the busiest endpoints.

The page refreshes every 30 seconds. Traffic is stored as hourly totals in the database, so it survives restarts; it records no email, IP address or request contents. Render's own health checks and the overview's refreshes are not counted.

## 10. Traffic incidents and rain forecast

The estimate page has a "Road and weather" card beside the cost. It is live information only: it never changes the estimate or a saved trip.

- Traffic incidents come from LTA DataMall. Add your account key to `backend/.env`:

  ```
  LTA_ACCOUNT_KEY=the key LTA emailed you
  ```

  Incidents (accidents, breakdowns, roadworks) within 300 m of the route are listed in the order you reach them and marked on the map with an orange "!". They are only shown for trips leaving within the next two hours, since incidents are usually cleared within a few hours.
- The rain forecast comes from data.gov.sg (NEA's 2-hour forecast by town, and the 24-hour forecast by region for later trips). It needs no key. It shows the forecast where you leave and where you arrive, and on the way back for a return trip. For a motorcycle, a rain warning is shown at the top of the card.

Check both feeds after adding the key:

```
npm run feeds:check
```

It prints how many incidents LTA reports now and which areas have rain forecast. If the traffic line says FAILED, the key is wrong or not yet active. In demo mode (`ROUTING_PROVIDER=mock`) the card shows sample incidents on the AYE and sample showers over the city, so it can be shown without any key.

The server fetches the whole incident list and the whole forecast and matches them to your route itself. Nothing about your trip or account is sent to LTA or data.gov.sg.

To hide the card, set `TRAFFIC_PROVIDER=off` and `WEATHER_PROVIDER=off`.

## 11. Motorcycles

Add a vehicle and choose Motorcycle. The list offers nine common models (Honda, Yamaha, Kawasaki) with their published fuel use, or you can type your own. Motorcycles pay half the car ERP rate at every gantry (LTA's rate table), and parking is priced from motorcycle rates: one $0.65 coupon a day at HDB and URA carparks, and the mall rates where they are known. Marina Bay Sands has no motorcycle parking, so a ride there shows parking as not priced.

## ERP gantries the app knows

The app knows 74 of LTA's gantries, from `backend/prisma/data/charge-points.json`. Rates are LTA's for cars from 7 September 2026; times and amounts below are the weekday peak values (rates change in 5-minute steps inside each period). None of these charge on Saturdays.

| Gantry | Location | Weekday charge for a car | Position |
| ------ | -------- | ------------------------ | -------- |
| 4 | Orchard Link (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 12 | Oxley Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 13 | Orchard Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 14 | Orchard Turn (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 15 | Killiney Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 21 | Buyong Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 22 | Kramat Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 26 | Clemenceau Ave (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 27 | Cairnhill Road (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 31 | CTE southbound after Braddell Road | 07:30 to 10:00 (up to $5.00) | LTA map, matched by location |
| 32 | PIE westbound after the Kallang Bahru exit | 07:00 to 10:00 (up to $4.00) | LTA map |
| 33 | CTE southbound after Braddell Road | 07:30 to 10:00 (up to $5.00) | LTA map |
| 34 | CTE southbound after Braddell Road | 07:30 to 10:00 (up to $5.00) | LTA map |
| 35 | CTE between Ang Mo Kio Ave 1 and Braddell Road | 07:00 to 10:00 (up to $3.00) | LTA map, matched by location |
| 36 | AYE between Portsdown Road and Alexandra Road | 08:00 to 09:30 (up to $2.00) | LTA map |
| 37 | PIE eastbound after Adam Road | 07:30 to 09:30 (up to $2.00) | LTA map |
| 38 | PIE eastbound after Adam Road | 07:30 to 09:30 (up to $2.00) | LTA map |
| 41 | AYE westbound after North Buona Vista Road | 17:00 to 19:30 (up to $3.00) | LTA map, matched by location |
| 42 | PIE slip road into CTE | 07:30 to 10:00 (up to $5.00) | LTA map |
| 45 | PIE westbound after the Kallang Bahru exit | 07:00 to 10:00 (up to $4.00) | LTA map |
| 46 | CTE northbound between PIE and Braddell Road | 17:30 to 20:00 (up to $4.00) | LTA map, matched by location |
| 47 | YMCA or Fort Canning Tunnel (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 49 | YMCA or Fort Canning Tunnel (Orchard cordon) | 11:00 to 19:00 (up to $1.00) | LTA map |
| 50 | KPE southbound after Defu Flyover | 07:00 to 10:00 (up to $6.00) | Approximate |
| 51 | CTE northbound between Jalan Bahagia and PIE | 17:30 to 19:00 (up to $1.00) | LTA map, matched by location |
| 52 | AYE citybound near Clementi | 07:00 to 10:00 (up to $5.00), 17:30 to 18:30 (up to $3.00) | LTA map, matched by location |
| 53 | AYE citybound near Clementi | 07:00 to 10:00 (up to $5.00), 17:30 to 18:30 (up to $3.00) | LTA map, matched by location |
| 65 | PIE westbound before Eunos Link | 07:30 to 09:30 (up to $2.00) | LTA map |
| 67 | CTE northbound between PIE and Braddell Road | 17:30 to 20:00 (up to $4.00) | LTA map, matched by location |
| 74 | AYE citybound near Clementi | 07:00 to 10:00 (up to $5.00), 17:30 to 18:30 (up to $3.00) | LTA map, matched by location |
| 92 | MCE eastbound after the Maxwell Road entry | 18:30 to 19:00 (up to $1.00) | LTA map |
| 93 | MCE eastbound after the Maxwell Road entry | 18:30 to 19:00 (up to $1.00) | LTA map |

The other 42 known gantries (the CBD cordon and arterial roads) have no charge in LTA's current table.

LTA lists four more gantries (54, 55, 68 and 71) that are not in its gantry map, so the app cannot place them yet; they are all free at present. "Matched by location" means the gantry is in LTA's map without its number, and the app picked the feature at the described location. "Approximate" means gantry 50 is not in LTA's map at all, and its position was set by hand on the KPE; with OneMap road names it still counts on the KPE within 350 m.

## Not used in this version

- The Extended OBU Library SDK key is for mobile apps that connect to a car's on-board unit over Bluetooth. It cannot run in a web app. It is the route to recording actual ERP deductions automatically in a future mobile version.
- LTA's carpark availability feed is not used: TollTally estimates what parking costs, not whether a lot is free.
- OilPriceAPI provides crude-oil benchmarks, not Singapore pump prices, so it is not connected.
