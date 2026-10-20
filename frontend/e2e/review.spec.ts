import { expect, test } from '@playwright/test';

test('estimate, comparison, departure chart and cost log fit the viewport', async ({
  page,
}, testInfo) => {
  const registered = await page.request.post('/api/auth/register', {
    data: {
      email: `review-${testInfo.project.name}-${Date.now()}@test.local`,
      password: 'Driver1234',
      acceptPrivacy: true,
    },
  });
  expect(registered.ok()).toBeTruthy();
  const vehicle = await (
    await page.request.post('/api/vehicles', {
      data: {
        displayName: 'Review rental',
        ownershipType: 'RENTED',
        fuelType: 'PETROL_95',
        consumptionRate: 7.5,
        tankCapacity: 50,
      },
    })
  ).json();
  const origin = (await (await page.request.get('/api/locations/search?q=Jurong%20East')).json())
    .results[0];
  const destination = (
    await (await page.request.get('/api/locations/search?q=Marina%20Bay')).json()
  ).results[0];
  const planned = await (
    await page.request.post('/api/trips', {
      data: {
        vehicleProfileId: vehicle.vehicle.id,
        origin,
        destination,
        departureTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        parkingDurationMin: 90,
      },
    })
  ).json();
  const id = planned.trip.id;
  for (const [path, heading] of [
    [`/app/trips/${id}`, 'Trip estimate'],
    [`/app/trips/${id}/compare`, 'Compare routes'],
    [`/app/trips/${id}/optimise`, 'Optimise departure time'],
    [`/app/trips/${id}/top-up`, 'Fuel top-up plan'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Loading|Pricing/ })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${heading.replaceAll(' ', '-')}.png`),
      fullPage: true,
    });
  }
  await page.request.post(`/api/trips/${id}/save`);
  await page.goto(`/app/history/${id}/log`);
  await page.getByLabel('Actual fuel cost (SGD)').fill('8.50');
  await page.getByLabel('Actual ERP charge (SGD)').fill('0');
  await page.getByLabel('Actual parking fee (SGD)').fill('4.50');
  await page.getByRole('button', { name: 'Save log' }).click();
  await expect(page.getByRole('button', { name: 'Update log' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('cost-log.png'), fullPage: true });
});

test('a failed sign-out keeps the session visible and offers a retry', async ({
  page,
}, testInfo) => {
  await page.request.post('/api/auth/register', {
    data: {
      email: `logout-${testInfo.project.name}-${Date.now()}@test.local`,
      password: 'Driver1234',
      acceptPrivacy: true,
    },
  });
  await page.goto('/app');
  await page.route('**/api/auth/logout', (route) => route.abort());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign out could not be completed');
  expect((await page.request.get('/api/auth/me')).ok()).toBe(true);
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});
