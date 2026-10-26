import { expect, test } from '@playwright/test'

test('builds the default bearing and downloads a STEP', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('status')).toHaveText(/Built in \d+ ms/, { timeout: 45_000 })

  const download = page.waitForEvent('download')
  await page.locator('.download-row', { hasText: 'outer ring' }).getByRole('button', { name: 'STEP' }).click()
  expect((await download).suggestedFilename()).toBe('outer_ring.step')
})

test('changing a value rebuilds, bad values show an error', async ({ page }) => {
  await page.goto('./')
  const status = page.getByTestId('status')
  await expect(status).toHaveText(/Built in/, { timeout: 45_000 })

  await page.getByLabel('Ball count', { exact: true }).fill('48')
  await expect(page.locator('.issues .error')).toContainText('Only 47 balls fit')
  await expect(page.getByRole('button', { name: 'STEP' }).first()).toBeDisabled()

  await page.getByLabel('Ball count', { exact: true }).fill('36')
  await expect(page.locator('.issues')).toHaveCount(0)
  await expect(status).toHaveText(/Built in/)
})
