import { expect, test } from '@playwright/test';

test('a renter plans a fuel top-up and is told what to buy', async ({ page }) => {
  const email = `e2e-renter-${Date.now()}@test.local`;

  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Renter1234');
  await page.getByLabel('Confirm password').fill('Renter1234');
  await page.getByLabel('I agree to TollTally storing my account', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/vehicles/new');
  await page.getByLabel('Display name').fill('Weekend rental');
  await page.getByLabel('Ownership').selectOption('RENTED');
  await page.getByLabel('Consumption rate (L/100 km)').fill('7.5');
  await page.getByLabel('Tank capacity (litres)').fill('50');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Weekend rental')).toBeVisible();

  await page.goto('/app/plan');
  await page.getByLabel('Origin', { exact: true }).fill('Jurong East');
  await page.getByRole('button', { name: /Jurong East MRT Station/ }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Marina Bay');
  await page.getByRole('button', { name: /Marina Bay Sands/ }).click();
  await page.getByLabel('Expected parking at the destination (minutes)').fill('0');
  await page.getByRole('button', { name: 'Estimate this trip' }).click();
  await expect(page.getByRole('heading', { name: 'Trip estimate' })).toBeVisible();

  await page.getByRole('link', { name: 'Fuel top-up' }).click();
  await expect(page.getByRole('heading', { name: 'Fuel top-up plan' })).toBeVisible();

  await expect(
    page.getByText('only while the vehicle is stationary', { exact: false }),
  ).toBeVisible();

  await page.getByLabel(/Fuel level at pick-up/).fill('0.5');
  await page.getByLabel(/Level required at return/).fill('0.5');
  await page.getByRole('button', { name: 'Calculate top-up' }).click();

  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByText('Top-up needed')).toBeVisible();
  await expect(page.getByText('Estimated top-up cost', { exact: false })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Fuel at pick-up' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'fraction of tank' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'litres' })).toBeVisible();
});
