# TollTally administrator guide

An administrator maintains the reference data every estimate is built from: the fuel prices, the Electronic Road Pricing rates and the make-and-model efficiency defaults. Administrators do not plan trips, and drivers cannot reach any of these screens. The account is created by the deployment's seed script from the ADMIN_EMAIL and ADMIN_PASSWORD settings, because handing out the administrator role from inside the application is out of scope for this release.

Sign in with the administrator email and you land on Overview, with Fuel prices, ERP tariffs and Vehicle efficiency alongside it.

## Overview

Overview shows how many drivers are registered, signed in and active, the site's traffic over the last 24 hours and 14 days, and the health of each service an estimate depends on: the database, the routing provider, password reset email, traffic incidents, weather forecast, ERP data, fuel prices and public holidays. Each check is marked Working, Check, Down or Not set up, with one line saying why. Run live check calls the routing provider, the mail server and the traffic and weather feeds immediately. Traffic incidents shows Not set up until an LTA DataMall account key is in LTA_ACCOUNT_KEY. The screen refreshes every 30 seconds. Traffic is kept as hourly totals per endpoint, with nothing that identifies the person making a request.

## How reference data reaches an estimate

Every estimate reads the reference tables at the moment it is calculated, and then stores what it used. That has two consequences worth keeping in mind. A change you make now affects every estimate calculated from now on, and it never changes an estimate a driver has already saved. This is why records are withdrawn rather than deleted: a saved estimate must stay explainable, and the derivation screen still names the record it used.

Each record carries a recorded time that the system sets when the record is stored. You cannot type it or edit it. That time is what the derivation screen uses to flag a source as stale, so amending a record to correct a value also resets its freshness.

## Fuel prices

A price record holds a brand, a fuel type and a price per litre in Singapore dollars. The price must be greater than zero.

An estimate uses the most recently recorded price that has not been withdrawn for the vehicle's fuel type, whichever brand it came from. The brand is shown in the derivation so a driver can see which board the figure came from. Keep at least one active record for every fuel type your drivers use, otherwise their fuel cost is reported as unavailable and their totals become lower bounds.

Amend changes an existing record and resets its recorded time. Withdraw takes a record out of use while keeping the row, which is what you want when a price is superseded. A withdrawn record stays in the list, greyed out.

Fuel prices go stale faster than any other reference data. Estimates flag a price older than seven days, so plan to update them at least weekly.

## ERP tariffs

An ERP rate record is identified by four things together: the charge point, the vehicle class, the day type and the time period. It also carries the rate itself and an effective date.

Select a charge point and a vehicle class at the top of the page to see the rates recorded for that combination. The charge points themselves come from the seed data and are not edited here.

Times are entered as HH:MM in Singapore time. The start is inclusive and the end is exclusive, so a period of 08:00 to 09:00 covers a crossing at 08:59 but not one at 09:00. This is what lets consecutive periods sit against each other without overlapping.

A rate of zero is valid and means the charge point does not charge in that period. It is not the same as having no record at all. If a charge point charges in a period for one vehicle class but has no record for another, a crossing by that other class is named and excluded from the estimate, and the driver's total becomes a lower bound. If there is no record at all covering the crossing time, the charge is simply zero. Record a zero explicitly when a period is genuinely free.

Overlapping periods are rejected. Two records for the same charge point, vehicle class, day type and effective date cannot cover the same minute, because the calculation would then have two answers. If you get the overlap message, look at the existing period the message names and either amend it or choose a period that starts where it ends.

### Effective dates

The effective date is the Singapore date from which a rate applies. It is how a published revision is loaded before it takes effect.

To load a revision, add a new record with the same charge point, vehicle class, day type and period, and set the effective date to the day the new rate starts. Both records then exist side by side. Estimates keep using the current record until the effective date arrives, and use the new one from then on. You do not need to withdraw the old record on the day, and leaving it in place keeps older saved estimates explainable.

Because the effective date is part of what makes a record unique, the overlap check applies within one effective date. Two records for the same period with different effective dates are a revision, not a conflict.

### Boundary tolerance

A crossing predicted within a few minutes of a period boundary is uncertain, since traffic decides which side of the boundary the vehicle actually arrives on. Rather than pick one rate silently, the estimate uses both adjacent rates as the lower and upper bound of that crossing. The tolerance is five minutes by default and is set by the deployment, not from this screen. This is a common reason a driver sees a wider range than they expected, and the derivation screen names the crossing that caused it.

## Vehicle efficiency

An efficiency record holds a vehicle type (car or motorcycle), a make, a model and a consumption rate in litres per 100 kilometres, which must be greater than zero. It can also hold the tank capacity, the fuel type and where the figures came from. Motorcycle records appear only in the motorcycle list on the vehicle form.

These records are offered to a driver as a default when they type a matching make and model while creating a vehicle profile. The driver can accept it or type their own figure. Once the profile is stored it holds its own copy, so amending or deleting a record here never changes a vehicle a driver has already set up, and never changes an estimate. The record is a starting point at entry time and nothing more.

If a make and model already exists the form offers you the existing record to amend rather than creating a second one, since two defaults for the same model would be ambiguous.

## Loading published ERP rates in bulk

The screens above are for corrections and revisions. To load a new published rate table, the team rebuilds the gantry data file from LTA's rate tables and gantry map with `backend/prisma/tools/build_erp_data.py` and restarts the server, which loads the new rates and withdraws the old ones (see DEMO-SETUP.md). Records it creates behave exactly like ones entered here, including their effective dates.
