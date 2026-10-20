import { expect, test } from '@playwright/test';

test('a rider adds a motorcycle from the list and sees road and weather beside the estimate', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Email address').fill(`rider-${Date.now()}@test.local`);
  await page.getByLabel('Password', { exact: true }).fill('Driver1234');
  await page.getByLabel('Confirm password').fill('Driver1234');
  await page.getByLabel('I agree to TollTally storing my account', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // FR-SET-12: the motorcycle list is separate from the car list.
  await page.goto('/app/vehicles/new');
  // The radio buttons are styled as a segmented control, so the visible label is what is clicked.
  await page.locator('label', { hasText: /^Motorcycle$/ }).click();
  await expect(page.getByRole('radio', { name: 'Motorcycle' })).toBeChecked();
  await expect(page.getByLabel('ERP vehicle class')).toHaveCount(0);
  await page.getByLabel('Motorcycle make').selectOption('Honda');
  await page.getByLabel('Motorcycle model').selectOption('PCX125');
  await expect(page.getByText('Honda PCX125: 2.1 L/100 km, 8.1 L tank')).toBeVisible();
  await page.getByLabel('Display name').fill('Daily scooter');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Daily scooter')).toBeVisible();

  await page.goto('/app/plan');
  await page.getByLabel('Origin', { exact: true }).fill('Jurong East');
  await page.getByRole('button', { name: /Jurong East MRT Station/ }).click();
  await page.getByLabel('Destination', { exact: true }).fill('Marina Bay');
  await page.getByRole('button', { name: /Marina Bay Sands/ }).click();
  await page.getByRole('button', { name: 'Estimate this trip' }).click();
  await expect(page.getByRole('heading', { name: 'Trip estimate' })).toBeVisible();

  // FR-EST-17 and FR-EST-18, with demo data: an incident on the AYE and showers over the city.
  const card = page.getByRole('region', { name: 'Road and weather' });
  await expect(card.getByText('Rain is forecast on your ride', { exact: false })).toBeVisible();
  await expect(card.getByRole('list', { name: 'Incidents on your route' })).toContainText('AYE');
  await expect(card.getByRole('list', { name: 'Forecast along your trip' })).toContainText(
    'Light Showers',
  );
  await expect(card.getByText('does not change the estimate', { exact: false })).toBeVisible();
});
