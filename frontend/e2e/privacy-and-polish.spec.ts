import { expect, test } from '@playwright/test';

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the cookie notice explains the single essential cookie and stays closed once dismissed', async ({
    page,
  }) => {
    await page.goto('/');
    const notice = page.getByRole('region', { name: 'One cookie, to keep you signed in' });
    await expect(notice).toBeVisible();
    await notice.getByRole('link', { name: 'How TollTally uses your data' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cookies and storage' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
    await expect(notice).toBeHidden();
  });
});

test('an unknown address shows the way back instead of a blank screen', async ({ page }) => {
  await page.goto('/this/road/does-not-exist');
  await expect(page.getByRole('heading', { name: 'No road here' })).toBeVisible();
  await page.getByRole('link', { name: 'TollTally home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('registration needs agreement to the privacy notice, and a driver can pick a car from the list', async ({
  page,
}, testInfo) => {
  await page.goto('/register');
  await page
    .getByLabel('Email address')
    .fill(`picker-${testInfo.project.name}-${Date.now()}@test.local`);
  await page.getByLabel('Password', { exact: true }).fill('Driver1234');
  await page.getByLabel('Confirm password').fill('Driver1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Agree to the privacy notice to create an account')).toBeVisible();
  await page.getByLabel('I agree to TollTally storing my account', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/vehicles/new');
  await page.getByLabel('Car make').selectOption('Honda');
  await page.getByLabel('Car model').selectOption('Freed 1.5');
  await expect(page.getByLabel('Consumption rate (L/100 km)')).toHaveValue('5.1');
  await expect(page.getByLabel('Tank capacity (litres)')).toHaveValue('42');
  await expect(page.getByLabel('Display name')).toHaveValue('Honda Freed 1.5');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Honda Freed 1.5').first()).toBeVisible();

  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Enter your password to confirm').fill('Driver1234');
  await page.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(
    page.getByText('Your account and everything stored with it were deleted.'),
  ).toBeVisible();
});

test('a forgotten password can be requested from the sign-in page', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByLabel('Keep me signed in for 30 days')).toBeVisible();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email address').fill('someone@test.local');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('a reset link is on its way', { exact: false })).toBeVisible();
});

test('the trip planner panel sits beside the map and never covers it', async ({
  page,
}, testInfo) => {
  await page.request.post('/api/auth/register', {
    data: {
      email: `layout-${testInfo.project.name}-${Date.now()}@test.local`,
      password: 'Driver1234',
      acceptPrivacy: true,
    },
  });
  await page.goto('/app/plan');
  const panel = await page.locator('[data-stage-panel]').boundingBox();
  const map = await page.getByRole('region', { name: /map/i }).first().boundingBox();
  expect(panel && map).toBeTruthy();
  const overlapX =
    Math.min(panel!.x + panel!.width, map!.x + map!.width) - Math.max(panel!.x, map!.x);
  const overlapY =
    Math.min(panel!.y + panel!.height, map!.y + map!.height) - Math.max(panel!.y, map!.y);
  expect(overlapX <= 0 || overlapY <= 0).toBe(true);
});
