# TollTally quick start

TollTally tells you what a drive in Singapore will cost before you set off. It adds up the fuel your vehicle will burn, the Electronic Road Pricing charges your route will collect, and the parking you expect to pay at the other end. Every figure is an estimate for planning. TollTally does not give directions, take payment, buy fuel or reserve parking.

## Creating an account and signing in

Choose Register on the landing page, enter an email address and a password of at least eight characters containing a letter and a digit, and confirm the password. You are signed in as soon as the account is created, so there is no email to confirm. On later visits choose Sign in and use the same details. If the email or the password is wrong you get one message that does not say which was wrong, because saying so would tell a stranger whether an account exists.

Your email address and a Sign out control sit in the header of every signed-in page. Sign out ends the session on the server, not just in the browser, and any trip you had planned but not saved is discarded. A session that sits idle for half an hour expires on its own and returns you to the sign-in page.

## Setting up a vehicle

You need one vehicle profile before you can plan a trip. Open Vehicles and choose Add vehicle, then choose Car or Motorcycle. A profile holds a display name, whether the vehicle is owned or rented, the fuel type, the ERP vehicle class, the fuel efficiency and the tank capacity.

Fuel efficiency is the number of litres the vehicle burns every 100 kilometres. A small car is usually around 6 and a large one around 10. Take the figure from the trip computer or the handbook. If you fill in the make and model and an administrator has recorded a reference figure for that model, TollTally offers it and you can accept it or type your own. Your figure is stored on the profile, so a later change to the reference table never rewrites the vehicle you set up.

For a motorcycle the list shows common motorcycle models instead, and the ERP class is set for you. A motorcycle pays half the car rate at each ERP gantry and is parked at motorcycle rates: one $0.65 coupon a day at HDB and URA carparks, or the mall's rate where it is known. If no motorcycle rate is known near the destination, parking is shown as not priced.

Choose rented as the ownership type for a car you have hired. That is what unlocks fuel top-up planning, and it is a property of the vehicle rather than of your account, so you can keep an owned car and a rental side by side.

A profile that a saved trip already refers to cannot be removed, because removing it would leave that estimate unexplainable. Archive it instead. An archived profile disappears from the list and from the trip planner but the saved estimates that used it stay readable. Tick Show archived profiles to see it again and Restore to bring it back.

## Planning a trip

Open Plan a trip. Type into the Origin box and choose a match from the list underneath; TollTally only accepts Singapore locations and only ones you pick from the list, so a typing mistake cannot become a wrong coordinate. Do the same for the destination, which must be a different place.

Set the departure date and time in Singapore time. It must be in the future, because the ERP charge depends on when you cross each gantry. Tick the return trip box if you are coming back, and give the return departure time; each leg is then priced at its own departure time rather than the outbound cost being doubled.

Enter how long you expect to park at the destination in minutes. Enter 0 if you will not park, which skips the carpark lookup entirely. If you leave the box empty TollTally assumes an hour and says so on the estimate, so an assumed figure never passes as one you gave.

Choose the vehicle and select Estimate this trip.

## Reading the estimate

The estimate opens with the total and, underneath it, the range the real cost is likely to fall in. Below that, each leg is itemised into fuel, road usage and parking, with its own range on every line.

Two labels matter. A total marked as a complete total means every component could be priced. A total marked as a lower bound with the words "at least" means something could not be priced, and the missing part is named above the table with the reason. TollTally never shows a missing component as zero and never presents a lower bound as though it were the whole cost.

Choose View derivation to see where each number came from: the fuel price and the brand it was recorded from, every ERP gantry the route crosses with the time you are expected to cross it and the rate that applied, the carpark and its charging rule, and an explanation of how the lower and upper bounds were reached. A source that has not been updated within its freshness threshold is flagged there. The derivation also shows how long the calculation took against the three-second budget.

## Road and weather

Beside the estimate, the Road and weather card shows live information for the trip. For a trip leaving within the next two hours it lists the traffic incidents LTA reports within 300 m of your route, such as accidents, breakdowns and roadworks, in the order you will reach them, and marks them on the map. It also shows the weather forecast where you leave and where you arrive (and when you head back on a return trip), with a rain symbol where showers are forecast. On a motorcycle, a rain warning appears first.

This information is live: choose Refresh before you set off. It never changes the estimate or a saved trip. Nothing about your trip is sent to LTA or data.gov.sg; TollTally downloads the whole incident list and forecast and matches them itself.

## Comparing routes and departure times

Compare routes prices two or more alternatives with the same rules and shows them side by side with distance, driving time and cost. The cheapest fully priced option is marked, but nothing is selected for you: a route that is a few cents cheaper may not be the one you want. When two options overlap within their estimate ranges TollTally says they are indistinguishable on cost rather than pretending one wins. Choose Use this route to re-price the trip on an alternative.

Optimise departure time prices a series of slots either side of your planned departure on the same route, which mostly moves the ERP charge. It marks the cheapest slot and the saving against your plan. If your time is already the cheapest it says so rather than offering a zero saving, and if the saving is smaller than the margin of error it says that too.

## Renting: planning a fuel top-up

With a rented profile selected, Fuel top-up appears on the estimate. Choose the unit you want to work in, then enter the level at pick-up and the level the hire company wants back. Read the gauge only while the vehicle is stationary. Use litres if the agreement states litres, percent for a gauge marked from 0 to 100, or a fraction of the tank for a gauge marked in quarters, where a quarter tank is 0.25.

TollTally shows the level you are projected to return with, the litres to buy and what they will cost, in the same unit you entered. If the trip needs more fuel than you are picking up with, it warns you to refuel along the way and states the shortfall. If you already have enough to meet the return level it says no top-up is needed. The top-up is a separate plan and is never added into the trip total.

The litres to buy include any en-route shortfall; do not add the shortfall a second time. Changing the route or departure clears the previous top-up plan so you can calculate it again.

## Saving a trip and recording what you paid

Save trip stores the estimate exactly as it stands, along with the reference values it used. That snapshot is never recalculated, so a fuel price that changes next week cannot make last week's estimate drift.

Saving the same trip again keeps one record. Planning a separate trip creates a separate record when saved, even if its endpoints and departure match an earlier trip.

After the trip, open it from History and choose Log costs. Fill in what you actually paid for fuel, road usage and parking. Enter 0 for no charge and leave amounts you do not know blank. You can fill in only some of them; the rest are marked as not logged rather than counted as zero. TollTally then shows the difference against the estimate for each component and in total, in dollars and as a percentage. A component the estimate could not price is marked not applicable rather than given a meaningless variance.

## History and spend

History lists your saved trips with the date, the route, the vehicle and the estimated total, plus the actual total and variance for each trip you have logged. Set a date range to narrow both the list and the report.

The spend report totals only what you have actually logged. Estimates are never counted as spend, so if none of your saved trips has a log yet the report is replaced with a note asking you to log some actual costs first.
