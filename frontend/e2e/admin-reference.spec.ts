import { expect, test } from '@playwright/test';

test('an administrator adds a fuel price that a driver then sees as the source of the fuel cost', async ({
  page,
}, testInfo) => {
  const brand = `E2E Fuel Co ${Date.now()}`;
  const [fuelType, fuelLabel] =
    testInfo.project.name === 'desktop' ? ['PETROL_98', 'Petrol 98'] : ['PETROL_92', 'Petrol 92'];

  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill('admin@tolltally.local');
  await page.getByLabel('Password', { exact: true }).fill('Admin1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto('/admin/fuel-prices');
  await page.getByLabel('Brand').fill(brand);
  await page.getByLabel('Fuel type').selectOption(fuelType);
  await page.getByLabel('Price (SGD per litre)').fill('2.99');
  await page.getByRole('button', { name: 'Add record' }).click();
  await expect(page.getByRole('cell', { name: brand })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('admin-fuel-prices.png'), fullPage: true });

  await expect(page.getByRole('link', { name: 'Plan a trip' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  const email = `e2e-driver-${Date.now()}@test.local`;
  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Driver1234');
  await page.getByLabel('Confirm password').fill('Driver1234');
  await page.getByLabel('I agree to TollTally storing my account', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/vehicles/new');
  await page.getByLabel('Display name').fill('Reference check car');
  await page.getByLabel('Fuel type').selectOption(fuelType);
  await page.getByLabel('Consumption rate (L/100 km)').fill('8');
  await page.getByLabel('Tank capacity (litres)').fill('45');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Reference check car')).toBeVisible();

  await page.goto('/app/plan');
  await page.getByLabel('Origin', { exact: true }).fill('Toa Payoh');
  await page.getByRole('button', { name: /Toa Payoh Central/ }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Ang Mo Kio');
  await page.getByRole('button', { name: /Ang Mo Kio Hub/ }).click();
  await page.getByLabel('Expected parking at the destination (minutes)').fill('30');
  await page.getByRole('button', { name: 'Estimate this trip' }).click();
  await expect(page.getByRole('heading', { name: 'Trip estimate' })).toBeVisible();

  await page.getByRole('button', { name: 'View derivation' }).click();
  await expect(page.getByText(`${brand} ${fuelLabel} price`, { exact: false })).toBeVisible();
});

test('an administrator lands on the overview of users, traffic and service health', async ({
  page,
}, testInfo) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill('admin@tolltally.local');
  await page.getByLabel('Password', { exact: true }).fill('Admin1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  const health = page.getByRole('region', { name: 'Service health' });
  await expect(health.getByText('Database', { exact: true })).toBeVisible();
  await expect(health.getByText('ERP gantries and rates')).toBeVisible();
  await expect(page.getByText('Signed in now')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Traffic, last 24 hours' })).toBeVisible();

  await page.getByRole('button', { name: 'Run live check' }).click();
  await expect(page.getByRole('button', { name: 'Run live check' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('admin-overview.png'), fullPage: true });
});
