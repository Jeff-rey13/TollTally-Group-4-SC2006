import { expect, test } from '@playwright/test';

test('driver can register, add a vehicle, plan a trip, save it and see it in history', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@test.local`;

  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Driver1234');
  await page.getByLabel('Confirm password').fill('Driver1234');
  await page.getByLabel('I agree to TollTally storing my account', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/vehicles/new');
  await page.getByLabel('Display name').fill('Family Corolla');
  await page.getByLabel('Consumption rate (L/100 km)').fill('7.5');
  await page.getByLabel('Tank capacity (litres)').fill('50');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Family Corolla')).toBeVisible();

  await page.goto('/app/plan');
  await page.getByLabel('Origin', { exact: true }).fill('Jurong East');
  await page.getByRole('button', { name: /Jurong East MRT Station/ }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Marina Bay');
  await page.getByRole('button', { name: /Marina Bay Sands/ }).click();
  await page.getByLabel('Expected parking at the destination (minutes)').fill('90');
  await page.getByRole('button', { name: 'Estimate this trip' }).click();

  await expect(page.getByRole('heading', { name: 'Trip estimate' })).toBeVisible();
  await expect(page.getByText('Estimated total', { exact: false })).toBeVisible();
  await expect(page.getByText('Road usage (ERP)')).toBeVisible();
  await expect(page.getByText('Parking', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'View derivation' }).click();
  await expect(page.getByRole('heading', { name: 'Cost derivation' })).toBeVisible();

  await page.getByRole('button', { name: 'Save trip' }).click();
  await expect(page.getByText('Trip saved to your history.')).toBeVisible();

  await page.goto('/app/history');
  await expect(page.getByText('Jurong East MRT Station to Marina Bay Sands')).toBeVisible();
  await expect(page.getByText('Log actual costs for a saved trip', { exact: false })).toBeVisible();

  await expect(
    page.getByText('TollTally is for planning before travel', { exact: false }),
  ).toBeVisible();
});

test('the sign-in form can be completed with the keyboard alone', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').focus();
  await page.keyboard.type('keyboard@test.local');
  await page.keyboard.press('Tab');
  await page.keyboard.type('WrongPass123');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toContainText('incorrect');
});
